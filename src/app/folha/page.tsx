import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { matchesSearch, inValueRange } from "@/lib/search";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import { userCan } from "@/lib/guards";
import EmployeeForm from "./EmployeeForm";
import EmployeeRowActions from "./EmployeeRowActions";
import GeneratePayrollButton from "./GeneratePayrollButton";

export const dynamic = "force-dynamic";

const statusTone = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const statusLabel = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;

export default async function FolhaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string; max?: string }>;
}) {
  const { q: qParam, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const canManage = await userCan("administrativo", "folha");
  const now = new Date();
  const competencia = `${String(now.getUTCMonth() + 1).padStart(2, "0")}/${now.getUTCFullYear()}`;

  const [allEmployees, payrollItems] = await Promise.all([
    prisma.employee.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.payable.findMany({
      where: { category: "SALARIO", employeeId: { not: null }, description: { contains: competencia } },
      orderBy: { description: "asc" },
    }),
  ]);

  const employees = allEmployees.filter(
    (e) =>
      matchesSearch(q, e.name, e.cpf, e.role, e.pixKey, e.salary, formatCurrency(e.salary)) &&
      inValueRange(e.salary, min, max),
  );
  const active = employees.filter((e) => e.active);
  const monthlyTotal = active.reduce((s, e) => s + e.salary, 0);
  const payrollTotal = payrollItems.reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <PageHeader
        title="Folha de pagamento"
        description={`${active.length} funcionário(s) ativo(s) · folha mensal estimada: ${formatCurrency(monthlyTotal)}`}
        action={canManage ? <GeneratePayrollButton /> : undefined}
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
        <StatCard label="Folha mensal (salários)" value={formatCurrency(monthlyTotal)} />
        <StatCard
          label={`Folha gerada (${competencia})`}
          value={payrollItems.length > 0 ? formatCurrency(payrollTotal) : "—"}
          hint={payrollItems.length > 0 ? `${payrollItems.length} lançamento(s)` : "clique em Gerar folha do mês"}
        />
      </div>

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
                    <Th>Situação</Th>
                    <Th />
                  </Tr>
                </Thead>
                <tbody>
                  {employees.map((e) => (
                    <Tr key={e.id} className={!e.active ? "opacity-60" : undefined}>
                      <Td className="font-medium text-slate-900">
                        {e.name}
                        {e.cpf ? <span className="ml-1.5 text-xs text-slate-400">{e.cpf}</span> : null}
                      </Td>
                      <Td>{e.role || "—"}</Td>
                      <Td className="max-w-[160px] truncate">{e.pixKey || "—"}</Td>
                      <Td className="text-right tabular-nums">{formatCurrency(e.salary)}</Td>
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
              description="Salários lançados como contas a pagar (vencimento dia 5 do mês seguinte)"
            />
            {payrollItems.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">
                Folha ainda não gerada para este mês. Use o botão &quot;Gerar folha do mês&quot;.
              </p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Descrição</Th>
                    <Th>Vencimento</Th>
                    <Th className="text-right">Valor</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {payrollItems.map((p) => {
                    const effective = effectivePayableStatus(p.status, p.dueDate);
                    return (
                      <Tr key={p.id}>
                        <Td className="font-medium text-slate-900">{p.description}</Td>
                        <Td>{formatDate(p.dueDate)}</Td>
                        <Td className="text-right tabular-nums">{formatCurrency(p.amount)}</Td>
                        <Td>
                          <Badge tone={statusTone[effective]}>{statusLabel[effective]}</Badge>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
            <p className="px-5 py-3 text-xs text-slate-400">
              A baixa dos salários é feita em Contas a pagar (ou pela Conciliação bancária).
              Adiantamentos e comissões podem ser lançados manualmente com a categoria Salário/Comissão.
            </p>
          </Card>
        </div>

        {canManage ? (
          <Card className="h-fit print:hidden">
            <CardHeader title="Novo funcionário" />
            <div className="p-5">
              <EmployeeForm />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
