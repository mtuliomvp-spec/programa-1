import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import AnexosImovel from "./AnexosImovel";
import ExcluirImovel from "./ExcluirImovel";
import VincularContas from "./VincularContas";
import Desvincular from "./Desvincular";

export const dynamic = "force-dynamic";

const statusTone = { PAGO: "success", PENDENTE: "warning", ATRASADO: "danger" } as const;
const statusLabel = { PAGO: "Pago", PENDENTE: "Pendente", ATRASADO: "Atrasado" } as const;

/**
 * Ficha do imóvel: dados, documentos (por tipo e ano) e as contas ligadas a
 * ele — recorrências (o ITR anual) e títulos, pagos e em aberto. As contas
 * vivem no financeiro; aqui é o arquivo do imóvel.
 */
export default async function ImovelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("imoveis");
  const { id } = await params;
  const imovel = await prisma.imovel.findUnique({
    where: { id },
    include: {
      capitalBeneficiary: { select: { name: true } },
      anexos: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          categoria: true,
          exercicio: true,
          description: true,
          filename: true,
          size: true,
          completo: true,
          createdAt: true,
        },
      },
      recorrencias: {
        orderBy: { description: "asc" },
        select: {
          id: true,
          description: true,
          amount: true,
          active: true,
          dayOfMonth: true,
          intervalDays: true,
          intervalMonths: true,
          startDate: true,
          supplier: { select: { name: true } },
        },
      },
      payables: {
        orderBy: { dueDate: "desc" },
        select: {
          id: true,
          orderNumber: true,
          description: true,
          amount: true,
          dueDate: true,
          paymentDate: true,
          status: true,
          category: true,
          categoryLabel: true,
          recurringId: true,
          supplier: { select: { name: true } },
          _count: { select: { attachments: true } },
        },
      },
    },
  });
  if (!imovel) notFound();

  const [podeCriar, podeEditar, podeExcluir, podeRecorrente, podeLancar] = await Promise.all([
    userCan("imoveis", "criar"),
    userCan("imoveis", "editar"),
    userCan("imoveis", "excluir"),
    userCan("financeiro", "recorrentes"),
    userCan("financeiro", "criar"),
  ]);

  const anoAtual = new Date().getFullYear();
  const pagoNoAno = imovel.payables
    .filter((p) => p.status === "PAGO" && p.paymentDate && p.paymentDate.getUTCFullYear() === anoAtual)
    .reduce((s, p) => s + p.amount, 0);
  const emAberto = imovel.payables.filter((p) => p.status !== "PAGO").reduce((s, p) => s + p.amount, 0);

  // GASTOS = o que já foi pago, pelo ano do pagamento e pelo tipo de despesa.
  const pagos = imovel.payables.filter((p) => p.status === "PAGO");
  const totalPago = pagos.reduce((s, p) => s + p.amount, 0);
  const porAno = new Map<number, number>();
  const porCategoria = new Map<string, { total: number; qtd: number }>();
  for (const p of pagos) {
    const ano = (p.paymentDate ?? p.dueDate).getUTCFullYear();
    porAno.set(ano, (porAno.get(ano) ?? 0) + p.amount);
    const cat = p.categoryLabel || "Outros";
    const c = porCategoria.get(cat) ?? { total: 0, qtd: 0 };
    porCategoria.set(cat, { total: c.total + p.amount, qtd: c.qtd + 1 });
  }
  const anos = [...porAno.entries()].sort((a, b) => b[0] - a[0]);
  const categorias = [...porCategoria.entries()].sort((a, b) => b[1].total - a[1].total);

  const dados: [string, string | null][] = [
    ["Em nome de", imovel.proprietario || imovel.capitalBeneficiary?.name || null],
    ["Sócio", imovel.capitalBeneficiary?.name ?? null],
    [imovel.tipo === "RURAL" ? "CIB (NIRF)" : "Inscrição municipal", imovel.tipo === "RURAL" ? imovel.cib : imovel.inscricaoMunicipal],
    ["Área", imovel.area],
    ["Matrícula", imovel.matricula],
    ["Cartório", imovel.cartorio],
    ["Endereço", imovel.endereco],
    ["Município", imovel.municipio ? `${imovel.municipio}${imovel.uf ? `/${imovel.uf}` : ""}` : null],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`🏡 ${imovel.nome}`}
        description={`${imovel.tipo === "RURAL" ? "Imóvel rural" : "Imóvel urbano"}${imovel.ativo ? "" : " · inativo"}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {podeEditar ? <LinkButton href={`/imoveis/${imovel.id}/editar`}>Editar</LinkButton> : null}
            <LinkButton href="/imoveis" variant="secondary">
              ← Imóveis
            </LinkButton>
          </div>
        }
      />

      <Card>
        <CardHeader title="Dados" />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 p-5 text-sm sm:grid-cols-2">
          {dados
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          {imovel.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">Observações</dt>
              <dd className="whitespace-pre-line text-slate-700">{imovel.notes}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Gastos no imóvel" description="O que já foi pago nas contas ligadas a ele" />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Total pago</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(totalPago)}</p>
            <p className="text-xs text-slate-500">
              {pagos.length} pagamento(s){emAberto > 0 ? ` · ${formatCurrency(emAberto)} em aberto` : ""}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Por ano</p>
            {anos.length ? (
              <ul className="mt-1 space-y-0.5 text-sm">
                {anos.map(([ano, v]) => (
                  <li key={ano} className="flex justify-between gap-2">
                    <span className="text-slate-600">{ano}</span>
                    <span className="tabular-nums text-slate-900">{formatCurrency(v)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-slate-500">—</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Por tipo de despesa</p>
            {categorias.length ? (
              <ul className="mt-1 space-y-0.5 text-sm">
                {categorias.map(([cat, v]) => (
                  <li key={cat} className="flex justify-between gap-2">
                    <span className="text-slate-600">
                      {cat} <span className="text-xs text-slate-400">({v.qtd})</span>
                    </span>
                    <span className="tabular-nums text-slate-900">{formatCurrency(v.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-slate-500">—</p>
            )}
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Documentos"
          description="Registro, planta e, a cada ano, a declaração e o recibo do ITR, o DARF e o comprovante"
        />
        <AnexosImovel
          imovelId={imovel.id}
          anexos={imovel.anexos.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
          podeCriar={podeCriar}
          podeEditar={podeEditar}
          podeExcluir={podeExcluir}
        />
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Contas do imóvel"
          description="As contas ficam no Contas a pagar como sempre; aqui aparecem as ligadas a este imóvel"
          action={
            <div className="flex flex-wrap gap-2">
              {podeRecorrente ? (
                <LinkButton href={`/financeiro/recorrentes/novo?imovel=${imovel.id}`} variant="secondary">
                  🔁 Conta recorrente
                </LinkButton>
              ) : null}
              {podeLancar ? (
                <LinkButton href={`/financeiro/a-pagar/novo?imovel=${imovel.id}`} variant="secondary">
                  + Conta avulsa
                </LinkButton>
              ) : null}
            </div>
          }
        />
        <div className="space-y-4 p-5">
          {podeEditar ? <VincularContas imovelId={imovel.id} /> : null}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recorrentes</p>
            {imovel.recorrencias.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                Nenhuma. O ITR, por exemplo, é uma conta recorrente <strong>anual</strong> com vencimento no último
                dia útil de setembro.
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-slate-100">
                {imovel.recorrencias.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <Link href={`/financeiro/recorrentes/${r.id}/editar`} className="font-medium text-blue-700 hover:underline">
                        {r.description}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {r.intervalMonths === 12
                          ? `anual · todo ${formatDate(r.startDate).slice(0, 5)}`
                          : r.intervalDays
                            ? `a cada ${r.intervalDays} dias`
                            : `mensal · dia ${r.dayOfMonth}`}
                        {r.supplier ? ` · ${r.supplier.name}` : ""}
                        {!r.active ? " · inativa" : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums text-slate-900">{formatCurrency(r.amount)}</span>
                      {podeEditar ? <Desvincular tipo="recorrencia" id={r.id} /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Títulos
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
                pago em {anoAtual}: {formatCurrency(pagoNoAno)}
                {emAberto > 0 ? ` · em aberto: ${formatCurrency(emAberto)}` : ""}
              </span>
            </p>
            {imovel.payables.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Nenhum título ligado a este imóvel ainda.</p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Nº</Th>
                    <Th>Descrição</Th>
                    <Th>Vencimento</Th>
                    <Th className="text-right">Valor</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {imovel.payables.map((p) => {
                    const st = effectivePayableStatus(p.status, p.dueDate);
                    return (
                      <Tr key={p.id}>
                        <Td className="tabular-nums text-slate-500">{String(p.orderNumber).padStart(4, "0")}</Td>
                        <Td>
                          <Link href={`/financeiro/a-pagar/${p.id}/ordem`} className="font-medium text-blue-700 hover:underline">
                            {p.description}
                          </Link>
                          <span className="block text-xs text-slate-500">
                            {[p.categoryLabel, p.supplier?.name].filter(Boolean).join(" · ")}
                            {p.recurringId ? " · 🔁" : ""}
                            {p._count.attachments ? ` · 📎 ${p._count.attachments}` : ""}
                            {podeEditar && !p.recurringId ? (
                              <span className="ml-2">
                                <Desvincular tipo="titulo" id={p.id} />
                              </span>
                            ) : null}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap">{formatDate(p.dueDate)}</Td>
                        <Td className="text-right tabular-nums">{formatCurrency(p.amount)}</Td>
                        <Td>
                          <Badge tone={statusTone[st]}>{statusLabel[st]}</Badge>
                          {p.paymentDate && st === "PAGO" ? (
                            <span className="block text-xs text-slate-500">em {formatDate(p.paymentDate)}</span>
                          ) : null}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      </Card>

      {podeExcluir ? (
        <div className="mt-4 text-right">
          <ExcluirImovel id={imovel.id} nome={imovel.nome} />
        </div>
      ) : null}
    </div>
  );
}
