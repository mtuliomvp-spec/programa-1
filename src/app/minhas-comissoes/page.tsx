import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";

export const dynamic = "force-dynamic";

const statusTone = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const statusLabel = { PENDENTE: "A receber", PAGO: "Recebida", ATRASADO: "Atrasada" } as const;

export default async function MinhasComissoesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const payables = await prisma.payable.findMany({
    where: { category: "COMISSAO", beneficiaryUserId: user.id },
    orderBy: { dueDate: "desc" },
    include: { account: { select: { name: true } } },
  });

  // Quando o usuário também é beneficiário do capital (sócio), traz as
  // movimentações para calcular o saldo investido dele. Prioriza o vínculo
  // explícito (userId); se não houver, cai para o beneficiário de mesmo nome
  // (caso do João Itapary, cadastrado no capital mas não vinculado ao login).
  const beneficiary =
    (await prisma.capitalBeneficiary.findUnique({
      where: { userId: user.id },
      include: { transactions: { select: { kind: true, amount: true } } },
    })) ??
    (await prisma.capitalBeneficiary.findFirst({
      where: { userId: null, name: { equals: user.name, mode: "insensitive" } },
      include: { transactions: { select: { kind: true, amount: true } } },
    }));
  const rows = payables.map((p) => ({ ...p, effective: effectivePayableStatus(p.status, p.dueDate) }));

  const totalReceber = rows.filter((r) => r.effective !== "PAGO").reduce((s, r) => s + r.amount, 0);
  const totalRecebido = rows.filter((r) => r.effective === "PAGO").reduce((s, r) => s + r.amount, 0);

  // Saldo de capital do beneficiário = aportes − retiradas (mesma conta da tela
  // de Capital). Só existe quando o usuário está vinculado a um beneficiário.
  const capitalSaldo = beneficiary
    ? beneficiary.transactions.reduce(
        (s, t) => s + (t.kind === "APORTE" ? t.amount : t.kind === "RETIRADA" ? -t.amount : 0),
        0,
      )
    : null;
  // Saldo total = saldo de capital + comissões ainda a receber.
  const saldoTotal = capitalSaldo != null ? capitalSaldo + totalReceber : null;

  return (
    <div>
      <PageHeader title="Minhas comissões" description={`Comissões de ${user.name}`} />

      <div
        className={`mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 ${
          capitalSaldo != null ? "lg:grid-cols-4" : ""
        }`}
      >
        <StatCard label="A receber" value={formatCurrency(totalReceber)} tone={totalReceber > 0 ? "warning" : "default"} />
        <StatCard label="Já recebido" value={formatCurrency(totalRecebido)} tone="positive" />
        {capitalSaldo != null ? (
          <StatCard
            label="Saldo de capital"
            value={formatCurrency(capitalSaldo)}
            tone={capitalSaldo >= 0 ? "positive" : "negative"}
            hint="aportes menos retiradas"
          />
        ) : null}
        {saldoTotal != null ? (
          <StatCard
            label="Saldo total"
            value={formatCurrency(saldoTotal)}
            tone={saldoTotal >= 0 ? "positive" : "negative"}
            hint="capital + comissões a receber"
          />
        ) : null}
      </div>

      <Card>
        <CardHeader title="Comissões" description="Somente as suas comissões de venda" />
        {rows.length === 0 ? (
          <EmptyState title="Você ainda não tem comissões" description="Quando uma venda gerar comissão para você, ela aparece aqui." />
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
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-slate-900">{r.description}</Td>
                  <Td className="whitespace-nowrap text-slate-600">{formatDate(r.dueDate)}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(r.amount)}</Td>
                  <Td>
                    <Badge tone={statusTone[r.effective]}>{statusLabel[r.effective]}</Badge>
                    {r.effective === "PAGO" && r.paymentDate ? (
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        pago em {formatDate(r.paymentDate)}
                        {r.account ? ` · ${r.account.name}` : ""}
                      </p>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
