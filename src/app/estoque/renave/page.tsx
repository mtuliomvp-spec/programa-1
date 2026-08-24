import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/guards";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  Table,
  Td,
  Th,
  Thead,
  Tr,
} from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import {
  RENAVE_NORMA,
  RENAVE_PRAZO_PADRAO,
  chaveNfeValida,
  detranStatusLabel,
  detranStatusOf,
  diasParaAtpvConsignacao,
  detranOperando,
  pendenciasCobraveis,
  pendenciasRenave,
  prazoTexto,
  situacaoLabel,
  situacaoTone,
  tituloLabel,
} from "@/lib/renave";

export const dynamic = "force-dynamic";

/**
 * Livro eletrônico de entradas e saídas — a visão que a fiscalização pede
 * (art. 5º, V, da Resolução Contran nº 1.026/2026) e o mapa do que ainda falta
 * para escriturar cada veículo. Enquanto durar a implantação, é um painel de
 * conferência: nada aqui impede nenhuma operação do sistema.
 */
export default async function RenavePage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; f?: string }>;
}) {
  await requireAction("estoque", "visualizar");
  const sp = await searchParams;

  const hoje = new Date();
  const inicioPadrao = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
  const de = sp.de || inicioPadrao.toISOString().slice(0, 10);
  const ate = sp.ate || hoje.toISOString().slice(0, 10);
  const filtro = sp.f === "pendentes" ? "pendentes" : "todos";

  const company = await getCompany();
  const prazo = company.renaveObrigatorioEm ?? RENAVE_PRAZO_PADRAO;
  const detran = detranStatusOf(company.detranRenaveStatus);

  const vehicles = await prisma.vehicle.findMany({
    where: {
      intermediation: false,
      entryDate: { gte: new Date(`${de}T00:00:00`), lte: new Date(`${ate}T23:59:59`) },
    },
    orderBy: { entryDate: "asc" },
    include: {
      supplier: { select: { name: true, document: true } },
      sale: { select: { saleDate: true, totalAmount: true, customer: { select: { name: true, document: true } } } },
    },
  });

  const operando = detranOperando(company.detranRenaveStatus);
  const linhas = vehicles.map((v) => ({
    v,
    pendencias: pendenciasCobraveis(v, operando),
    todas: pendenciasRenave(v),
    diasAtpv: diasParaAtpvConsignacao(v),
  }));
  const mostradas = filtro === "pendentes" ? linhas.filter((l) => l.pendencias.length > 0) : linhas;
  const comPendencia = linhas.filter((l) => l.pendencias.length > 0).length;
  const semEntrada = linhas.filter((l) => !l.v.renaveEntradaProtocolo).length;
  const atpvVencendo = linhas.filter((l) => l.diasAtpv !== null && l.diasAtpv <= 7).length;

  return (
    <div>
      <PageHeader
        title="Renave — livro de entradas e saídas"
        description={`Escrituração eletrônica do estoque (${RENAVE_NORMA})`}
        action={
          <div className="flex gap-2 print:hidden">
            <PrintButton mode="table" title="Renave — livro de entradas e saídas" />
            <LinkButton href="/estoque" variant="secondary">
              ← Estoque
            </LinkButton>
          </div>
        }
      />

      {detran && detran !== "ADERIDO" ? (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-900">
            🛑 O DETRAN {company.uf ? `do ${company.uf}` : "do seu estado"} ainda não opera o Renave de usados
            — {detranStatusLabel[detran].toLowerCase()}
          </p>
          <p className="text-xs text-rose-800">
            Não há registro eletrônico a fazer por enquanto. Este livro continua valendo como a escrituração
            de conferência da loja, e os dados preenchidos aqui adiantam o dia em que o estado aderir.{" "}
            <Link href="/parametros/renave/passo-a-passo" className="font-medium underline">
              Ver o que fazer enquanto isso
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 print:hidden">
        <p className="text-sm font-semibold text-blue-900">Implantação em andamento — nada está bloqueado</p>
        <p className="text-xs text-blue-800">
          O registro no Renave é feito no sistema da integradora contratada. O que fica aqui são os dados que
          o registro exige e o protocolo do que já foi registrado, para a ficha bater com o livro eletrônico.
          A partir de <strong>{prazoTexto(prazo)}</strong>, movimentar um veículo sem esses dados deixa de ser
          possível.{" "}
          <Link href="/parametros/renave/passo-a-passo" className="font-medium underline">
            Ver o passo a passo da adequação
          </Link>
          .
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 print:hidden">
        <Card className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Veículos no período</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{linhas.length}</p>
        </Card>
        <Card className={`px-5 py-4 ${comPendencia > 0 ? "border-amber-300" : ""}`}>
          <p className="text-xs uppercase tracking-wide text-slate-500">Com dados faltando</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{comPendencia}</p>
          <p className="text-xs text-slate-500">{semEntrada} sem registro de entrada</p>
        </Card>
        <Card className={`px-5 py-4 ${atpvVencendo > 0 ? "border-rose-300" : ""}`}>
          <p className="text-xs uppercase tracking-wide text-slate-500">Consignações no prazo final</p>
          <p className="mt-1 text-2xl font-semibold text-rose-700">{atpvVencendo}</p>
          <p className="text-xs text-slate-500">ATPV-e em até 7 dias (art. 20, § 7º)</p>
        </Card>
      </div>

      <Card className="mb-4 print:hidden">
        <CardHeader title="Período e filtro" />
        <form className="flex flex-wrap items-end gap-3 p-5" method="get">
          <label className="text-xs font-medium text-slate-600">
            De
            <input
              type="date"
              name="de"
              defaultValue={de}
              className="mt-0.5 block h-9 rounded-lg border border-slate-300 px-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Até
            <input
              type="date"
              name="ate"
              defaultValue={ate}
              className="mt-0.5 block h-9 rounded-lg border border-slate-300 px-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Mostrar
            <select
              name="f"
              defaultValue={filtro}
              className="mt-0.5 block h-9 rounded-lg border border-slate-300 px-2 text-sm"
            >
              <option value="todos">Todos os veículos</option>
              <option value="pendentes">Só os que têm dados faltando</option>
            </select>
          </label>
          <button
            type="submit"
            className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
          >
            Aplicar
          </button>
          <Link
            href={`/estoque/renave/csv?de=${de}&ate=${ate}`}
            className="h-9 rounded-lg border border-slate-300 px-4 text-sm font-medium leading-9 text-slate-700 hover:bg-slate-50"
          >
            ⬇️ Exportar CSV
          </Link>
        </form>
      </Card>

      <Card>
        <CardHeader
          title={`Movimentações de ${formatDate(new Date(`${de}T12:00:00`))} a ${formatDate(new Date(`${ate}T12:00:00`))}`}
          description="Entrada e saída de cada veículo, com os dados que o Renave exige"
        />
        {mostradas.length === 0 ? (
          <EmptyState
            title="Nenhum veículo no período"
            description="Ajuste as datas acima ou tire o filtro de pendências."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Thead>
                <Tr>
                  <Th>Veículo</Th>
                  <Th>Entrada</Th>
                  <Th>Origem / destino</Th>
                  <Th>NF-e</Th>
                  <Th>Saída</Th>
                  <Th>Situação</Th>
                </Tr>
              </Thead>
              <tbody>
                {mostradas.map(({ v, pendencias, diasAtpv }) => (
                  <Tr key={v.id}>
                    <Td>
                      <Link href={`/estoque/${v.id}`} className="font-medium text-blue-700 hover:underline">
                        {v.brand} {v.model}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {v.plate} · {v.chassi || "sem chassi"} · {v.renavam || "sem RENAVAM"}
                      </p>
                      {pendencias.length > 0 ? (
                        <p className="mt-1 text-xs text-amber-700">
                          ⚠️ {pendencias.length} dado(s) faltando: {pendencias.map((p) => p.texto).join("; ")}
                        </p>
                      ) : null}
                      {diasAtpv !== null ? (
                        <p className={`mt-1 text-xs ${diasAtpv < 0 ? "text-rose-700" : "text-slate-500"}`}>
                          Consignação: {diasAtpv < 0 ? `prazo vencido há ${Math.abs(diasAtpv)} dia(s)` : `${diasAtpv} dia(s) para a ATPV-e`}
                        </p>
                      ) : null}
                    </Td>
                    <Td>
                      {formatDate(v.entryDate)}
                      <p className="text-xs text-slate-500">
                        {v.renaveEntradaTitulo ? tituloLabel[v.renaveEntradaTitulo] : "título não informado"}
                      </p>
                      <p className="text-xs text-slate-500">{formatCurrency(v.purchasePrice)}</p>
                    </Td>
                    <Td className="text-xs text-slate-600">
                      <p>{v.supplier?.name || "—"}</p>
                      {v.supplier?.document ? <p className="text-slate-400">{v.supplier.document}</p> : null}
                      {v.sale ? (
                        <>
                          <p className="mt-1 text-slate-900">→ {v.sale.customer.name}</p>
                          {v.sale.customer.document ? (
                            <p className="text-slate-400">{v.sale.customer.document}</p>
                          ) : null}
                        </>
                      ) : null}
                    </Td>
                    <Td className="text-xs">
                      <p className={chaveNfeValida(v.entryNfeKey) ? "text-slate-600" : "text-amber-700"}>
                        Entrada: {chaveNfeValida(v.entryNfeKey) ? `nº ${v.entryNfeNumber}/${v.entryNfeSerie}` : "—"}
                      </p>
                      <p className={chaveNfeValida(v.exitNfeKey) ? "text-slate-600" : "text-slate-400"}>
                        Saída: {chaveNfeValida(v.exitNfeKey) ? `nº ${v.exitNfeNumber}/${v.exitNfeSerie}` : "—"}
                      </p>
                    </Td>
                    <Td>
                      {v.sale ? (
                        <>
                          {formatDate(v.sale.saleDate)}
                          <p className="text-xs text-slate-500">{formatCurrency(v.sale.totalAmount)}</p>
                          <p className="text-xs text-slate-500">
                            {v.renaveSaidaTitulo ? tituloLabel[v.renaveSaidaTitulo] : "título não informado"}
                          </p>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">em estoque</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={situacaoTone[v.renaveSituacao]}>{situacaoLabel[v.renaveSituacao]}</Badge>
                      {v.renaveEntradaProtocolo ? (
                        <p className="mt-1 text-xs text-slate-500">{v.renaveEntradaProtocolo}</p>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-400">
        Este relatório é uma cópia de conferência do que a loja registrou. O livro oficial é o próprio Renave
        (art. 1º, § 1º) — a escrituração em papel foi substituída por ele.
      </p>
    </div>
  );
}
