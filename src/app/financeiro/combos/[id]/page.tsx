import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAction, userCan } from "@/lib/guards";
import { getActiveAccounts } from "@/lib/accounts";
import { getCashboxState } from "@/lib/cashbox";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, LinkButton, Table, Td, Th, Thead, Tr } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";
import PrintButton from "@/components/PrintButton";
import ComboActions from "./ComboActions";
import AddTitlesToCombo, { RemoveFromCombo } from "./AddTitlesToCombo";

export const dynamic = "force-dynamic";

const statusInfo = {
  ABERTO: { label: "Aberto", tone: "info" as const },
  SOLICITADO: { label: "Aguardando pagamento", tone: "warning" as const },
  PAGO: { label: "Pago", tone: "success" as const },
  CANCELADO: { label: "Cancelado", tone: "default" as const },
};
const accountTypeLabel: Record<string, string> = { corrente: "Corrente", poupanca: "Poupança" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{value}</span>
    </div>
  );
}

export default async function ComboBorderoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAction("financeiro", "criar");
  const { id } = await params;

  const combo = await prisma.paymentCombo.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, document: true, phone: true, email: true, bankName: true, bankAgency: true, bankAccount: true, bankAccountType: true, pixKey: true } },
      account: { select: { name: true } },
      payables: {
        orderBy: { dueDate: "asc" },
        include: { supplier: { select: { name: true } }, beneficiaryUser: { select: { name: true } } },
      },
    },
  });
  if (!combo) notFound();

  const [company, accounts, cashbox, canPagar] = await Promise.all([
    getCompany(),
    getActiveAccounts(),
    getCashboxState(),
    userCan("financeiro", "pagar"),
  ]);
  const cashboxDate = cashbox.open && cashbox.session ? formatDate(cashbox.session.workDate) : null;

  const total = combo.payables.reduce((s, p) => s + p.amount, 0);
  const info = statusInfo[combo.status];
  const bene = combo.user;
  const bankType = bene?.bankAccountType ? accountTypeLabel[bene.bankAccountType] || bene.bankAccountType : null;
  const hasBankData = Boolean(bene && (bene.bankName || bene.bankAccount || bene.pixKey));

  // Títulos disponíveis para adicionar (só quando ABERTO): pendentes/atrasados,
  // não pagos e ainda sem combo.
  const available =
    combo.status === "ABERTO"
      ? (
          await prisma.payable.findMany({
            where: { status: { not: "PAGO" }, paymentComboId: null },
            orderBy: { dueDate: "asc" },
            include: { supplier: { select: { name: true } }, beneficiaryUser: { select: { name: true } } },
            take: 200,
          })
        ).map((p) => ({
          id: p.id,
          description: p.description,
          supplier: p.supplier?.name || p.beneficiaryUser?.name || "—",
          dueDate: p.dueDate.toISOString(),
          amount: p.amount,
        }))
      : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <LinkButton href="/financeiro/combos" variant="secondary">← Voltar</LinkButton>
        <PrintButton title={`Bordero ${combo.name}`} rootSelector="#bordero" />
      </div>

      <Card className="p-6 sm:p-8">
        <main id="bordero">
          <CompanyDocHeader
            company={company}
            right={
              <>
                <p className="font-bold">BORDERÔ DE PAGAMENTO</p>
                <p className="text-slate-500">{combo.name}</p>
                <p className="text-slate-500">{formatDate(combo.createdAt)}</p>
                <Badge tone={info.tone}>{info.label}</Badge>
              </>
            }
          />

          <section className="mb-4">
            <h2 className="mb-1 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Beneficiário</h2>
            <Row label="Nome" value={bene?.name || "—"} />
            <Row label="CPF/CNPJ" value={bene?.document || "—"} />
            <Row label="Telefone" value={bene?.phone || "—"} />
            {hasBankData ? (
              <>
                <Row label="Banco" value={bene?.bankName || "—"} />
                <Row label="Agência" value={bene?.bankAgency || "—"} />
                <Row label="Conta" value={bene?.bankAccount || "—"} />
                <Row label="Tipo" value={bankType || "—"} />
                <Row label="Chave PIX" value={bene?.pixKey || "—"} />
              </>
            ) : (
              <p className="py-1.5 text-sm text-amber-700">
                Dados bancários não cadastrados — informe na ficha do usuário (Usuários).
              </p>
            )}
          </section>

          <section className="mb-4">
            <h2 className="mb-1 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Títulos do combo</h2>
            {combo.payables.length === 0 ? (
              <p className="py-3 text-sm text-slate-500">Nenhum título neste combo ainda.</p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Descrição</Th>
                    <Th>Fornecedor</Th>
                    <Th>Vencimento</Th>
                    <Th className="text-right">Valor</Th>
                    {combo.status === "ABERTO" ? <Th /> : null}
                  </Tr>
                </Thead>
                <tbody>
                  {combo.payables.map((p) => (
                    <Tr key={p.id}>
                      <Td className="font-medium text-slate-900">{p.description}</Td>
                      <Td className="text-slate-600">{p.supplier?.name || p.beneficiaryUser?.name || "—"}</Td>
                      <Td className="whitespace-nowrap text-slate-600">{formatDate(p.dueDate)}</Td>
                      <Td className="text-right tabular-nums">{formatCurrency(p.amount)}</Td>
                      {combo.status === "ABERTO" ? (
                        <Td className="text-right">
                          <RemoveFromCombo payableId={p.id} />
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Total a pagar</span>
            <span className="text-2xl font-black text-slate-900">{formatCurrency(total)}</span>
          </div>
          {combo.status === "PAGO" ? (
            <p className="text-sm text-slate-500">
              Pago em {combo.paidAt ? formatDate(combo.paidAt) : "—"}
              {combo.account?.name ? ` · ${combo.account.name}` : ""}.
            </p>
          ) : null}
        </main>

        <ComboActions
          comboId={combo.id}
          status={combo.status}
          accounts={accounts}
          canPagar={canPagar}
          cashboxDate={cashboxDate}
        />
      </Card>

      {combo.status === "ABERTO" ? (
        <Card className="mt-4 print:hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Adicionar títulos</h2>
            <p className="mt-0.5 text-sm text-slate-500">Marque os títulos a pagar que entram neste combo.</p>
          </div>
          <div className="p-4">
            <AddTitlesToCombo comboId={combo.id} available={available} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
