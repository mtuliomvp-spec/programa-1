import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/guards";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import {
  periodosAquisitivos,
  ROTULO_AVISO,
  ROTULO_SITUACAO,
  ROTULO_TIPO_RESCISAO,
  TOM_SITUACAO,
  type AvisoPrevio,
  type TipoRescisao,
} from "@/lib/ferias";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import FeriasForm from "./FeriasForm";
import RescisaoForm from "./RescisaoForm";
import EditarFuncionario from "./EditarFuncionario";
import ExcluirLancamento from "./ExcluirLancamento";
import AnexarRecibo from "./AnexarRecibo";
import { usuariosParaFuncionario } from "@/lib/usuarios-funcionarios";

export const dynamic = "force-dynamic";

const TOM_CONTA = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const ROTULO_CONTA = { PENDENTE: "a pagar", PAGO: "paga", ATRASADO: "atrasada" } as const;

/** Ficha do funcionário: dados, férias (períodos e lançamentos) e rescisão. */
export default async function FuncionarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { id } = await params;
  const { ok } = await searchParams;
  const [e, podeGerir] = await Promise.all([
    prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        vacations: {
          orderBy: { gozoInicio: "desc" },
          select: {
            id: true, aquisitivoInicio: true, aquisitivoFim: true, gozoInicio: true, gozoFim: true, dias: true,
            abonoDias: true, valorBruto: true, descontos: true, valorLiquido: true, pagamentoAte: true,
            payableId: true, reciboNome: true, notes: true,
          },
        },
        terminations: {
          select: {
            id: true, tipo: true, avisoPrevio: true, dataAviso: true, dataDesligamento: true, pagamentoAte: true,
            valorLiquido: true, multaFgts: true, payableId: true, multaPayableId: true, arquivoNome: true, notes: true,
          },
        },
      },
    }),
    userCan("administrativo", "folha"),
  ]);
  if (!e) notFound();
  const usuarios = podeGerir ? await usuariosParaFuncionario(e.id) : [];

  const contaIds = [
    ...e.vacations.map((v) => v.payableId),
    ...e.terminations.flatMap((t) => [t.payableId, t.multaPayableId]),
  ].filter((x): x is string => !!x);
  const contas = new Map(
    (await prisma.payable.findMany({ where: { id: { in: contaIds } }, select: { id: true, status: true, dueDate: true } })).map(
      (c) => [c.id, effectivePayableStatus(c.status, c.dueDate)],
    ),
  );
  const seloConta = (pid: string | null) => {
    if (!pid) return <Badge tone="success">paga fora do sistema</Badge>;
    const s = contas.get(pid);
    return s ? <Badge tone={TOM_CONTA[s]}>{ROTULO_CONTA[s]}</Badge> : <span className="text-xs text-slate-400">conta excluída</span>;
  };

  const hoje = new Date();
  const rescisao = e.terminations[0] ?? null;
  const periodos = periodosAquisitivos(e.admissionDate, e.vacations, hoje, rescisao?.dataDesligamento ?? e.dismissalDate);
  const opcoes = periodos
    .filter((p) => p.saldo > 0)
    .map((p) => ({
      inicio: toDateInputValue(p.inicio),
      rotulo: `${formatDate(p.inicio)} a ${formatDate(p.fim)} · saldo ${p.saldo} dias${p.situacao === "EM_AQUISICAO" ? " (em aquisição)" : ""}`,
      saldo: p.saldo,
    }));

  return (
    <div>
      <Link href="/folha" className="text-sm text-blue-700 hover:underline">
        ← Folha de pagamento
      </Link>
      <PageHeader
        title={e.name}
        description={`${e.role || "Sem cargo"} · admissão ${formatDate(e.admissionDate)} · salário ${formatCurrency(e.salary)}${
          e.active ? "" : ` · desligado${e.dismissalDate ? ` em ${formatDate(e.dismissalDate)}` : ""}`
        }`}
      />
      {e.user ? (
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          👤 Usuário do sistema: <strong>{e.user.name}</strong> · {e.user.email}
        </p>
      ) : null}
      {ok ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{ok.slice(0, 300)}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Férias — períodos aquisitivos"
              description="A cada 12 meses de trabalho o funcionário ganha 30 dias, que precisam ser gozados nos 12 meses seguintes; depois disso, pagos em dobro (art. 137 da CLT)."
            />
            <Table>
              <Thead>
                <Tr>
                  <Th>Período aquisitivo</Th>
                  <Th>Gozar até</Th>
                  <Th className="text-right">Saldo</Th>
                  <Th>Iniciar até</Th>
                  <Th>Situação</Th>
                </Tr>
              </Thead>
              <tbody>
                {periodos.map((p) => (
                  <Tr key={p.inicio.toISOString()}>
                    <Td>
                      {formatDate(p.inicio)} a {formatDate(p.fim)}
                    </Td>
                    <Td>{formatDate(p.concessivoFim)}</Td>
                    <Td className="text-right tabular-nums">{p.saldo} dias</Td>
                    <Td>
                      {p.saldo > 0 && p.situacao !== "EM_AQUISICAO" ? (
                        <>
                          {formatDate(p.iniciarAte)}
                          <span className="block text-xs text-slate-400">avisar até {formatDate(p.avisarAte)}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <Badge tone={TOM_SITUACAO[p.situacao]}>{ROTULO_SITUACAO[p.situacao]}</Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <p className="px-5 py-3 text-xs text-slate-400">
              Férias tiradas antes de usar o sistema: lance-as abaixo sem gerar conta a pagar, para o saldo ficar certo.
            </p>
          </Card>

          <Card>
            <CardHeader title="Férias lançadas" />
            {e.vacations.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Nenhuma férias lançada.</p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Gozo</Th>
                    <Th>Período aquisitivo</Th>
                    <Th className="text-right">Líquido</Th>
                    <Th>Pagamento</Th>
                    <Th />
                  </Tr>
                </Thead>
                <tbody>
                  {e.vacations.map((v) => (
                    <Tr key={v.id}>
                      <Td>
                        {formatDate(v.gozoInicio)} a {formatDate(v.gozoFim)}
                        <span className="block text-xs text-slate-400">
                          {v.dias} dias{v.abonoDias ? ` + ${v.abonoDias} vendidos` : ""}
                          {v.reciboNome ? (
                            <>
                              {" · "}
                              <a href={`/folha/arquivo/ferias/${v.id}`} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                                recibo
                              </a>
                            </>
                          ) : null}
                        </span>
                      </Td>
                      <Td>
                        {formatDate(v.aquisitivoInicio)} a {formatDate(v.aquisitivoFim)}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {formatCurrency(v.valorLiquido)}
                        {v.valorBruto ? (
                          <span className="block text-xs text-slate-400">bruto {formatCurrency(v.valorBruto)}</span>
                        ) : null}
                      </Td>
                      <Td>
                        até {formatDate(v.pagamentoAte)}
                        <span className="block">{seloConta(v.payableId)}</span>
                      </Td>
                      <Td className="text-right">
                        {podeGerir ? (
                          <span className="flex flex-col items-end gap-1.5">
                            <AnexarRecibo id={v.id} temRecibo={!!v.reciboNome} />
                            <ExcluirLancamento tipo="ferias" id={v.id} />
                          </span>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {rescisao ? (
            <Card>
              <CardHeader title="Rescisão" description={ROTULO_TIPO_RESCISAO[rescisao.tipo as TipoRescisao] ?? rescisao.tipo} />
              <div className="space-y-1 px-5 py-4 text-sm text-slate-700">
                <p>
                  Desligamento em <strong>{formatDate(rescisao.dataDesligamento)}</strong>
                  {rescisao.dataAviso ? ` · aviso em ${formatDate(rescisao.dataAviso)}` : ""} · aviso prévio{" "}
                  {(ROTULO_AVISO[rescisao.avisoPrevio as AvisoPrevio] ?? rescisao.avisoPrevio).toLowerCase()}
                </p>
                <p>
                  Líquido {formatCurrency(rescisao.valorLiquido)} {seloConta(rescisao.payableId)}
                  {rescisao.multaFgts ? (
                    <>
                      {" "}
                      · multa do FGTS {formatCurrency(rescisao.multaFgts)} {seloConta(rescisao.multaPayableId)}
                    </>
                  ) : null}
                </p>
                <p>
                  Pagamento até <strong>{formatDate(rescisao.pagamentoAte)}</strong> (10 dias do término)
                  {rescisao.arquivoNome ? (
                    <>
                      {" · "}
                      <a href={`/folha/arquivo/rescisao/${rescisao.id}`} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                        TRCT
                      </a>
                    </>
                  ) : null}
                </p>
                {rescisao.notes ? <p className="text-slate-500">{rescisao.notes}</p> : null}
                {podeGerir ? (
                  <div className="pt-2 text-right">
                    <ExcluirLancamento tipo="rescisao" id={rescisao.id} />
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
        </div>

        {podeGerir ? (
          <div className="space-y-4 print:hidden">
            <Card>
              <CardHeader title="Lançar férias" />
              <div className="p-5">
                <FeriasForm employeeId={e.id} salario={e.salary} periodos={opcoes} />
              </div>
            </Card>
            {!rescisao && e.active ? (
              <Card>
                <CardHeader title="Rescisão" description="Desliga o funcionário e lança as verbas a pagar." />
                <div className="p-5">
                  <RescisaoForm
                    employeeId={e.id}
                    salario={e.salary}
                    admissao={toDateInputValue(e.admissionDate)}
                    ferias={e.vacations.map((v) => ({
                      aquisitivoInicio: toDateInputValue(v.aquisitivoInicio),
                      gozoInicio: toDateInputValue(v.gozoInicio),
                      dias: v.dias,
                      abonoDias: v.abonoDias,
                    }))}
                  />
                </div>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="Dados do funcionário" />
              <div className="p-5">
                <EditarFuncionario
                  usuarios={usuarios}
                  e={{
                    userId: e.userId,
                    id: e.id,
                    name: e.name,
                    role: e.role,
                    cpf: e.cpf,
                    pixKey: e.pixKey,
                    salary: e.salary,
                    admissionDate: toDateInputValue(e.admissionDate),
                    notes: e.notes,
                  }}
                />
              </div>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
