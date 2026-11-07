import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rotuloDaFerramenta } from "@/lib/ajuda-ferramentas";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

const DIA = 86_400_000;
const dataHora = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/**
 * Perguntas do chat de ajuda: o que a equipe pergunta ao assistente e o que
 * ele respondeu. Serve para achar dúvidas repetidas (treino, manual) e
 * conferir as respostas. Só administradores.
 */
export default async function ChatAjudaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; usuario?: string; dias?: string }>;
}) {
  const user = await getSessionUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) redirect("/");
  const { q: qParam, usuario, dias: diasParam } = await searchParams;
  const q = (qParam || "").trim().slice(0, 80);
  const dias = [7, 30, 90, 365].includes(Number(diasParam)) ? Number(diasParam) : 30;
  const agora = new Date();
  const desde = new Date(agora.getTime() - dias * DIA);

  const where = {
    createdAt: { gte: desde },
    ...(usuario ? { userId: usuario } : {}),
    ...(q
      ? {
          OR: [
            { pergunta: { contains: q, mode: "insensitive" as const } },
            { resposta: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [lista, total, porUsuario, semResposta] = await Promise.all([
    prisma.chatAjudaPergunta.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.chatAjudaPergunta.count({ where }),
    prisma.chatAjudaPergunta.groupBy({
      by: ["userId", "userName"],
      where: { createdAt: { gte: desde } },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
    }),
    prisma.chatAjudaPergunta.count({ where: { ...where, ok: false } }),
  ]);

  const filtroHref = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const tudo = { q: q || undefined, usuario, dias: String(dias), ...extra };
    for (const [k, v] of Object.entries(tudo)) if (v) p.set(k, v);
    return `/sistema/chat-ajuda?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Perguntas do chat de ajuda"
        description="O que a equipe pergunta ao assistente e o que ele respondeu — para achar dúvidas repetidas e conferir as respostas."
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={`Perguntas (${dias} dias)`} value={String(total)} hint={q || usuario ? "com os filtros aplicados" : undefined} />
        <StatCard label="Quem mais pergunta" value={porUsuario[0]?.userName ?? "—"} hint={porUsuario[0] ? `${porUsuario[0]._count._all} pergunta(s)` : undefined} />
        <StatCard
          label="Respostas com erro"
          value={String(semResposta)}
          hint="falha da IA ou resposta vazia"
          tone={semResposta > 0 ? "warning" : "default"}
        />
      </div>

      <Card className="mb-4 p-4">
        <form className="flex flex-wrap items-end gap-3" action="/sistema/chat-ajuda">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-slate-500">
            Buscar na pergunta ou na resposta
            <input
              name="q"
              defaultValue={q}
              placeholder="Ex.: consignado, boleto, caixa…"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Período
            <select name="dias" defaultValue={String(dias)} className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-800">
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="365">Último ano</option>
            </select>
          </label>
          {usuario ? <input type="hidden" name="usuario" value={usuario} /> : null}
          <button type="submit" className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">
            Filtrar
          </button>
          {q || usuario ? (
            <Link href={`/sistema/chat-ajuda?dias=${dias}`} className="h-10 content-center text-sm text-slate-600 hover:underline">
              Limpar
            </Link>
          ) : null}
        </form>
        {porUsuario.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {porUsuario.map((u) => (
              <Link
                key={u.userId ?? "sem"}
                href={filtroHref({ usuario: u.userId === usuario ? undefined : (u.userId ?? undefined) })}
                className={`rounded-full border px-3 py-1 text-xs ${
                  u.userId === usuario ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {u.userName ?? "—"} · {u._count._all}
              </Link>
            ))}
          </div>
        ) : null}
      </Card>

      {lista.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhuma pergunta no período"
            description="As perguntas feitas no botão “💬 Ajuda” aparecem aqui."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{c.userName ?? "—"}</span>
                <span>{dataHora(c.createdAt)}</span>
                {c.pagina ? <span>na tela {c.pagina}</span> : null}
                {c.ferramentas.map((f) => (
                  <Badge key={f} tone="info">
                    🔎 {rotuloDaFerramenta(f)}
                  </Badge>
                ))}
                {!c.ok ? <Badge tone="warning">⚠ sem resposta</Badge> : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">{c.pergunta}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-blue-700">Ver a resposta</summary>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{c.resposta || "—"}</p>
              </details>
            </Card>
          ))}
          {total > lista.length ? (
            <p className="text-center text-xs text-slate-500">Mostrando as {lista.length} mais recentes de {total}.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
