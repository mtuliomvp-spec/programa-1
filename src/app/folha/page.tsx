import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { alertasDaFolha } from "@/lib/folha-alertas";
import { usuariosParaFuncionario } from "@/lib/usuarios-funcionarios";
import { periodoEmAberto, periodosAquisitivos, ROTULO_SITUACAO, TOM_SITUACAO } from "@/lib/ferias";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { matchesSearch, inValueRange } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import { userCan } from "@/lib/guards";
import EmployeeForm from "./EmployeeForm";
import EmployeeRowActions from "./EmployeeRowActions";
import GeneratePayrollButton from "./GeneratePayrollButton";
import SalarioToggle from "./SalarioToggle";
import AjustarSalario from "./AjustarSalario";
import ImportarHolerite from "./ImportarHolerite";
import PassarRecorrencia from "./PassarRecorrencia";
import VincularVale from "./VincularVale";
import {
  competenciaDe,
  competenciaValida,
  liquidoDoHolerite,
  nomeCasa,
  normalizarNome,
  salariosDaCompetencia,
  somaMeses,
  vencimentoDoSalario,
} from "@/lib/folha";

export const dynamic = "force-dynamic";

const statusTone = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const statusLabel = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;

export default async function FolhaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string; max?: string; comp?: string }>;
}) {
  const { q: qParam, min, max, comp } = await searchParams;
  const q = (qParam || "").trim();
  const canManage = await userCan("administrativo", "folha");
  const now = new Date();
  // Até o dia 10 o que está na mesa é a folha do mês anterior (o holerite
  // chega e o salário vence no dia 5); depois, a do mês corrente.
  const competencia = competenciaValida(comp)
    ? comp
    : competenciaDe(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (now.getUTCDate() <= 10 ? 1 : 0), 1, 12)));

  const [allEmployees, salarios, recorrencias] = await Promise.all([
    prisma.employee.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        vacations: { select: { aquisitivoInicio: true, dias: true, abonoDias: true } },
        user: { select: { email: true } },
      },
    }),
    salariosDaCompetencia(competencia),
    // Salários que ainda estão como recorrência no Contas a pagar.
    canManage
      ? prisma.recurringEntry.findMany({
          where: {
            active: true,
            kind: "PAGAR",
            OR: [{ categoryPagar: "SALARIO" }, { description: { contains: "salári", mode: "insensitive" } }],
          },
          select: { id: true, description: true, amount: true, dayOfMonth: true },
          orderBy: { description: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const employees = allEmployees.filter(
    (e) =>
      matchesSearch(q, e.name, e.cpf, e.role, e.pixKey, e.salary, formatCurrency(e.salary)) &&
      inValueRange(e.salary, min, max),
  );
  const active = employees.filter((e) => e.active);
  const monthlyTotal = active.filter((e) => e.recebeSalario).reduce((s, e) => s + e.salary, 0);
  // Linhas da folha: quem recebe salário (ativo) e quem já tem título na competência.
  const linhasFolha = allEmployees.filter((e) => salarios.has(e.id) || (e.active && e.recebeSalario));
  const soComissao = allEmployees.filter((e) => e.active && !e.recebeSalario && !salarios.has(e.id));
  const folhaTotal = [...salarios.values()].reduce((s, x) => s + x.total, 0);
  const folhaAPagar = [...salarios.values()].reduce((s, x) => s + x.aPagar, 0);
  const sugestaoDe = (descricao: string) => {
    const ativos = allEmployees.filter((e) => e.active);
    const cheio = ativos.find((e) => nomeCasa(e.name, descricao));
    if (cheio) return cheio.id;
    const palavras = new Set(normalizarNome(descricao));
    const porNome = ativos.filter((e) => palavras.has(normalizarNome(e.name)[0] ?? ""));
    return porNome.length === 1 ? porNome[0].id : null;
  };
  const [alertas, usuarios] = await Promise.all([
    alertasDaFolha(now),
    canManage ? usuariosParaFuncionario() : Promise.resolve([]),
  ]);
  const feriasDe = (e: (typeof employees)[number]) =>
    e.active ? periodoEmAberto(periodosAquisitivos(e.admissionDate, e.vacations, now, e.dismissalDate)) : null;

  return (
    <div>
      <PageHeader
        title="Folha de pagamento"
        description={`${active.length} funcionário(s) ativo(s) · folha mensal estimada: ${formatCurrency(monthlyTotal)}`}
        action={canManage ? <ImportarHolerite competenciaPadrao={competencia} /> : undefined}
      />

      <ReportToolbar
        basePath="/folha"
        printTitle="Folha de pagamento"
        q={q}
        placeholder="Buscar (nome, CPF, cargo, PIX, salário...)"
        value
        min={min}
        max={max}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Funcionários ativos" value={String(active.length)} />
        <StatCard label="Folha mensal (salários do cadastro)" value={formatCurrency(monthlyTotal)} />
        <StatCard
          label={`Folha de ${competencia} — a pagar`}
          value={salarios.size > 0 ? formatCurrency(folhaAPagar) : "—"}
          hint={salarios.size > 0 ? `de ${formatCurrency(folhaTotal)} (${salarios.size} salário(s))` : "folha ainda não gerada"}
        />
      </div>

      {alertas.length ? (
        <Card className="mb-4 border-l-4 border-l-amber-400">
          <CardHeader title="Férias e rescisões" description="O que pede atenção agora." />
          <ul className="divide-y divide-slate-100">
            {alertas.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm hover:bg-slate-50">
                  <span>
                    <span className="font-medium text-slate-800">{a.titulo}</span>
                    <span className="block text-xs text-slate-500">{a.detalhe}</span>
                  </span>
                  <Badge tone={a.tom}>{a.selo}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Funcionários" />
            {employees.length === 0 ? (
              <EmptyState title="Nenhum funcionário" description="Cadastre o primeiro funcionário ao lado." />
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Nome</Th>
                    <Th>Cargo</Th>
                    <Th>PIX</Th>
                    <Th className="text-right">Salário</Th>
                    <Th>Férias</Th>
                    <Th>Situação</Th>
                    <Th />
                  </Tr>
                </Thead>
                <tbody>
                  {employees.map((e) => (
                    <Tr key={e.id} className={!e.active ? "opacity-60" : undefined}>
                      <Td className="font-medium text-slate-900">
                        <Link href={`/folha/${e.id}`} className="text-blue-700 hover:underline">
                          {e.name}
                        </Link>
                        {e.cpf ? <span className="ml-1.5 text-xs text-slate-400">{e.cpf}</span> : null}
                        {e.user ? (
                          <span className="block text-xs font-normal text-slate-400" title="Ligado ao usuário do sistema">
                            👤 {e.user.email}
                          </span>
                        ) : null}
                      </Td>
                      <Td>{e.role || "—"}</Td>
                      <Td className="max-w-[160px] truncate">{e.pixKey || "—"}</Td>
                      <Td className="text-right">
                        <span className={`tabular-nums ${e.recebeSalario ? "" : "text-slate-400 line-through"}`}>
                          {formatCurrency(e.salary)}
                        </span>
                        <span className="mt-1 flex justify-end">
                          {canManage ? (
                            <SalarioToggle id={e.id} on={e.recebeSalario} />
                          ) : !e.recebeSalario ? (
                            <span className="text-xs text-slate-500">Só comissão</span>
                          ) : null}
                        </span>
                      </Td>
                      <Td>
                        {(() => {
                          const f = feriasDe(e);
                          return f ? (
                            <Link href={`/folha/${e.id}`}>
                              <Badge tone={TOM_SITUACAO[f.situacao]}>{ROTULO_SITUACAO[f.situacao]}</Badge>
                              <span className="block text-xs text-slate-400">iniciar até {formatDate(f.iniciarAte)}</span>
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          );
                        })()}
                      </Td>
                      <Td>
                        <Badge tone={e.active ? "success" : "default"}>
                          {e.active ? "Ativo" : `Desligado${e.dismissalDate ? ` em ${formatDate(e.dismissalDate)}` : ""}`}
                        </Badge>
                      </Td>
                      <Td>
                        {canManage ? <EmployeeRowActions id={e.id} active={e.active} /> : null}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`Folha de ${competencia}`}
              description={`Salário = líquido do holerite · vence em ${formatDate(vencimentoDoSalario(competencia))} · vales e adiantamentos são pagamentos parciais do salário`}
              action={
                <span className="flex items-center gap-1 text-sm print:hidden">
                  <Link href={`/folha?comp=${somaMeses(competencia, -1)}`} className="whitespace-nowrap rounded px-2 py-1 text-blue-700 hover:bg-slate-100">
                    ‹ {somaMeses(competencia, -1)}
                  </Link>
                  <Link href={`/folha?comp=${somaMeses(competencia, 1)}`} className="whitespace-nowrap rounded px-2 py-1 text-blue-700 hover:bg-slate-100">
                    {somaMeses(competencia, 1)} ›
                  </Link>
                </span>
              }
            />
            {linhasFolha.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Nenhum funcionário recebe salário pela folha.</p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Funcionário</Th>
                    <Th className="text-right">Holerite</Th>
                    <Th className="text-right">Vales / pago</Th>
                    <Th className="text-right">A pagar</Th>
                    <Th>Status</Th>
                    <Th />
                  </Tr>
                </Thead>
                <tbody>
                  {linhasFolha.map((e) => {
                    const s = salarios.get(e.id);
                    // O que falta pagar: o próprio salário ou, se ele já foi pago, o vale
                    // em aberto que vence primeiro (ex.: boleto do fornecedor).
                    const emAberto = s
                      ? [s.titulo, ...s.partes].filter((x) => x.status !== "PAGO").sort((a, b) => +a.dueDate - +b.dueDate)[0]
                      : undefined;
                    const status = s
                      ? s.aPagar <= 0.009 || !emAberto
                        ? "PAGO"
                        : effectivePayableStatus(emAberto.status, emAberto.dueDate)
                      : null;
                    return (
                      <Tr key={e.id}>
                        <Td className="font-medium text-slate-900">
                          <Link href={`/folha/${e.id}`} className="text-blue-700 hover:underline">
                            {e.name}
                          </Link>
                          {s?.titulo.notes?.includes("Holerite ") ? (
                            <span className="block text-xs font-normal text-emerald-700">✓ holerite lançado</span>
                          ) : s ? (
                            <span className="block text-xs font-normal text-amber-700">salário do cadastro — falta o holerite</span>
                          ) : null}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {(() => {
                            if (!s) return "—";
                            // O holerite manda: se os títulos (salário + vales) não somam o
                            // líquido dele, a diferença aparece para vincular o vale que falta.
                            const liq = liquidoDoHolerite(s.titulo.notes);
                            const dif = liq === null ? 0 : Math.round((liq - s.total) * 100) / 100;
                            return (
                              <>
                                {formatCurrency(liq ?? s.total)}
                                {Math.abs(dif) > 0.009 ? (
                                  <span className="block text-xs font-medium text-amber-700">
                                    {dif > 0
                                      ? `faltam ${formatCurrency(dif)} — vincule o vale`
                                      : `pago ${formatCurrency(-dif)} a mais`}
                                  </span>
                                ) : null}
                              </>
                            );
                          })()}
                        </Td>
                        <Td className="text-right tabular-nums">
                          {s && s.pago > 0 ? formatCurrency(s.pago) : "—"}
                          {s && s.partes.length ? (
                            <span className="block text-xs text-slate-400">
                              {s.partes.length} vale(s){s.partes.some((p) => p.status !== "PAGO") ? " · há vale a confirmar" : ""}
                            </span>
                          ) : null}
                        </Td>
                        <Td className="text-right font-semibold tabular-nums">{s ? formatCurrency(s.aPagar) : "—"}</Td>
                        <Td>
                          {status ? (
                            <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>
                          ) : (
                            <span className="text-xs text-slate-400">não gerado</span>
                          )}
                        </Td>
                        <Td className="text-right">
                          <span className="flex flex-col items-end gap-1">
                            {canManage ? <AjustarSalario employeeId={e.id} competencia={competencia} valor={s ? s.total : null} /> : null}
                            {canManage && s ? <VincularVale employeeId={e.id} competencia={competencia} /> : null}
                            {s && emAberto && emAberto.id !== s.titulo.id ? (
                              <Link href={`/financeiro/a-pagar/${emAberto.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                                Vale a pagar em {formatDate(emAberto.dueDate)} →
                              </Link>
                            ) : null}
                            {s && s.titulo.status !== "PAGO" ? (
                              <Link href={`/financeiro/a-pagar/${s.titulo.id}`} className="text-xs font-medium text-blue-700 hover:underline">
                                Pagar / dar vale →
                              </Link>
                            ) : s ? (
                              <Link href={`/financeiro/a-pagar/${s.titulo.id}`} className="text-xs text-slate-500 hover:underline">
                                Ver título →
                              </Link>
                            ) : null}
                          </span>
                        </Td>
                      </Tr>
                    );
                  })}
                  {salarios.size ? (
                    <Tr>
                      <Td className="font-semibold">Total</Td>
                      <Td className="text-right font-semibold tabular-nums">{formatCurrency(folhaTotal)}</Td>
                      <Td className="text-right tabular-nums">
                        {formatCurrency([...salarios.values()].reduce((t, x) => t + x.pago, 0))}
                      </Td>
                      <Td className="text-right font-semibold tabular-nums">{formatCurrency(folhaAPagar)}</Td>
                      <Td>{null}</Td>
                      <Td>{null}</Td>
                    </Tr>
                  ) : null}
                </tbody>
              </Table>
            )}
            {soComissao.length ? (
              <p className="px-5 pt-3 text-xs text-slate-500">
                Só comissão (fora da folha de salário): {soComissao.map((e) => e.name).join(", ")}. Férias e 13º continuam
                na ficha de cada um.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 print:hidden">
              <p className="max-w-xl text-xs text-slate-400">
                Gere a folha para lançar o salário do cadastro; quando o contador mandar o holerite, importe o PDF (ou
                ajuste o líquido à mão). Vale ou adiantamento: em &quot;Pagar / dar vale&quot;, use o pagamento parcial —
                o saldo fica a pagar.
              </p>
              {canManage ? <GeneratePayrollButton competencia={competencia} /> : null}
            </div>
          </Card>

          {recorrencias.length ? (
            <Card className="border-l-4 border-l-amber-400">
              <CardHeader
                title="Salários ainda lançados como recorrência"
                description="Agora a folha cuida dos salários. Passe cada recorrência para a folha — ela é encerrada e os títulos dela entram na folha, sem lançar em dobro."
              />
              <ul className="divide-y divide-slate-100">
                {recorrencias.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>
                      <span className="font-medium text-slate-800">{r.description}</span>
                      <span className="block text-xs text-slate-500">
                        {formatCurrency(r.amount)} · todo dia {r.dayOfMonth}
                      </span>
                    </span>
                    <PassarRecorrencia
                      recurringId={r.id}
                      sugestao={sugestaoDe(r.description)}
                      funcionarios={allEmployees.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name }))}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {canManage ? (
          <Card className="h-fit print:hidden">
            <CardHeader title="Novo funcionário" />
            <div className="p-5">
              <EmployeeForm usuarios={usuarios} />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
