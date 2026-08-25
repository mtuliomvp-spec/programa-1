import Link from "next/link";
import { notFound } from "next/navigation";
import { superGateOpen } from "@/lib/super-admin";
import { listOnlineUsers, listRecentLogins, loginSummary } from "@/lib/presence";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";

export const dynamic = "force-dynamic";

const PER_PAGE = 100;

const roleLabel: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrador",
  OPERADOR: "Operador",
};

const dataHora = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const diaLegivel = (d: Date) =>
  d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

/**
 * Histórico de acessos ao sistema — quem entrou, quando, de que aparelho e de
 * que IP. Tela do dono do sistema: mesma porta do painel oculto (/super).
 */
export default async function AcessosPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; quem?: string }>;
}) {
  if (!(await superGateOpen())) notFound();
  const { p: pParam, quem } = await searchParams;

  const [todos, online, resumo] = await Promise.all([
    // Teto de segurança: o histórico é longo, mas nunca ilimitado numa tela só.
    listRecentLogins(1000),
    listOnlineUsers(),
    loginSummary(),
  ]);

  const filtro = (quem || "").trim().toLowerCase();
  const acessos = filtro ? todos.filter((a) => a.email.toLowerCase() === filtro) : todos;

  const pageCount = Math.max(1, Math.ceil(acessos.length / PER_PAGE));
  const currentPage = Math.min(Math.max(1, Number(pParam) || 1), pageCount);
  const inicio = (currentPage - 1) * PER_PAGE;
  const pagina = acessos.slice(inicio, inicio + PER_PAGE);
  const href = (n: number) => {
    const sp = new URLSearchParams();
    if (filtro) sp.set("quem", filtro);
    if (n > 1) sp.set("p", String(n));
    const qs = sp.toString();
    return qs ? `/super/acessos?${qs}` : "/super/acessos";
  };

  // Pessoas que aparecem no histórico, para o filtro rápido.
  const pessoas = Array.from(new Map(todos.map((a) => [a.email, a.name])).entries()).sort((a, b) =>
    a[1].localeCompare(b[1], "pt-BR"),
  );

  // Cabeçalho de dia calculado ANTES de montar a tabela: a linha só mostra a
  // data quando ela muda em relação à de cima, e a lista respira por dia.
  const linhas = pagina.map((a, i) => {
    const dia = diaLegivel(a.at);
    return { ...a, dia, abreDia: i === 0 || dia !== diaLegivel(pagina[i - 1].at) };
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="🔑 Histórico de acessos"
        description={`${resumo.total} acesso(s) registrado(s) · ${resumo.semana} nos últimos 7 dias · ${online.length} online agora`}
        action={
          <LinkButton href="/super" variant="secondary">
            ← Painel Super Admin
          </LinkButton>
        }
      />

      {pessoas.length > 1 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          <Link
            href="/super/acessos"
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              filtro
                ? "border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                : "border-blue-300 bg-blue-50 text-blue-800"
            }`}
          >
            Todos
          </Link>
          {pessoas.map(([email, nome]) => (
            <Link
              key={email}
              href={`/super/acessos?quem=${encodeURIComponent(email)}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                filtro === email.toLowerCase()
                  ? "border-blue-300 bg-blue-50 text-blue-800"
                  : "border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50"
              }`}
            >
              {nome}
            </Link>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title={filtro ? `Acessos de ${pessoas.find(([e]) => e.toLowerCase() === filtro)?.[1] || filtro}` : "Todos os acessos"}
          description="Cada linha é uma entrada aceita no sistema (login, primeiro acesso ou troca de senha)."
        />
        {pagina.length === 0 ? (
          <p className="p-5 text-sm text-slate-600">
            Nenhum acesso registrado {filtro ? "para esta pessoa" : "ainda"}. O histórico começa a
            partir da atualização que criou esta tela — entradas anteriores não foram gravadas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Quando</Th>
                  <Th>Quem</Th>
                  <Th>Perfil</Th>
                  <Th>Aparelho</Th>
                  <Th>IP</Th>
                </Tr>
              </Thead>
              <tbody>
                {linhas.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      {a.abreDia ? (
                        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {a.dia}
                        </span>
                      ) : null}
                      <span className="tabular-nums">{dataHora(a.at)}</span>
                    </Td>
                    <Td>
                      <span className="font-medium text-slate-800">{a.name}</span>
                      {a.online ? <Badge tone="success">online</Badge> : null}
                      <span className="block text-xs text-slate-500">{a.email}</span>
                    </Td>
                    <Td>{roleLabel[a.role] || a.role}</Td>
                    <Td>{a.device || "—"}</Td>
                    <Td className="tabular-nums">{a.ip || "—"}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        {pageCount > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 print:hidden">
            <p className="text-xs text-slate-500">
              Mostrando {inicio + 1}-{inicio + pagina.length} de {acessos.length} acesso(s) · página{" "}
              {currentPage} de {pageCount}
            </p>
            <div className="flex gap-2">
              {currentPage > 1 ? (
                <LinkButton href={href(currentPage - 1)} variant="secondary">
                  ← Anterior
                </LinkButton>
              ) : null}
              {currentPage < pageCount ? (
                <LinkButton href={href(currentPage + 1)} variant="secondary">
                  Próxima →
                </LinkButton>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        A sessão desta instalação é um cookie assinado, sem sessão guardada no banco: quem está
        “online” é quem o servidor viu nos últimos 2 minutos — o sistema aberto avisa sozinho a cada
        10 segundos. Fechar a aba tira a pessoa da lista em até 2 minutos; sair pelo botão, na hora.
      </p>
    </div>
  );
}
