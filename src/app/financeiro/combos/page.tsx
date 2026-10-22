import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAction, userCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import DeleteComboButton from "./DeleteComboButton";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import NewComboForm from "./NewComboForm";
import SolicitarSaque from "./SolicitarSaque";
import { disponivelParaSaque } from "@/lib/saque";
import { hasModuleAccess, isAdminRole } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const statusInfo = {
  ABERTO: { label: "Aberto", tone: "info" as const },
  SOLICITADO: { label: "Aguardando pagamento", tone: "warning" as const },
  PAGO: { label: "Pago", tone: "success" as const },
  CANCELADO: { label: "Cancelado", tone: "danger" as const },
};

export default async function CombosPage() {
  await requireAction("combos", "visualizar");
  const canManage = await userCan("combos", "criar");
  const sessionUser = await getSessionUser();
  const isAdmin = isAdminRole(sessionUser?.role);
  // Saque: só para quem tem a permissão E está ligado a um beneficiário do
  // capital — o saque sai do capital dele, não de qualquer um.
  const saque =
    sessionUser && (await userCan("combos", "saque")) ? await disponivelParaSaque(sessionUser.id) : null;
  const combos = await prisma.paymentCombo.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      user: { select: { name: true } },
      payables: { select: { amount: true, status: true, capitalBeneficiaryId: true } },
    },
  });
  // Líquido de cada combo: parte do total pode cobrir o saldo devedor de
  // capital do beneficiário (vira aporte). Pago: o abatimento gravado na baixa;
  // em aberto/solicitado: a mesma previsão do borderô.
  const { abatimentoDoCombo } = await import("@/lib/combo-capital");
  const abatimentos = new Map(
    await Promise.all(
      combos.map(async (c) => {
        if (c.status === "PAGO") return [c.id, c.capitalAbatement ?? 0] as const;
        if (c.status === "CANCELADO") return [c.id, 0] as const;
        const r = await abatimentoDoCombo({
          userId: c.userId,
          payFull: c.payFull,
          payables: c.payables.filter((p) => p.status !== "PAGO"),
        });
        return [c.id, r.abate] as const;
      }),
    ),
  );

  return (
    <div>
      <PageHeader
        title="Combos de pagamento"
        description="Junte vários títulos a pagar num combo e quite todos de uma vez, com um borderô."
      />

      {canManage || saque ? (
        <Card className="mb-4">
          <div className="space-y-3 p-4">
            {canManage ? <NewComboForm /> : null}
            {saque ? (
              <SolicitarSaque
                disponivel={saque.disponivel}
                livre={saque.livre}
                pendente={saque.pendente}
                beneficiario={saque.beneficiaryName}
                verExtrato={
                  !!sessionUser &&
                  (hasModuleAccess(sessionUser, "meu_capital") || hasModuleAccess(sessionUser, "administrativo"))
                }
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Combos" description="Abertos e solicitados aparecem primeiro" />
        {combos.length === 0 ? (
          <EmptyState title="Nenhum combo ainda" description="Crie um combo e adicione títulos a pagar nele." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Nome</Th>
                <Th>Beneficiário</Th>
                <Th className="text-right">Títulos</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <tbody>
              {combos.map((c) => {
                const total = c.payables
                  .filter((p) => c.status === "PAGO" || p.status !== "PAGO")
                  .reduce((s, p) => s + p.amount, 0);
                const abate = abatimentos.get(c.id) ?? 0;
                const info = statusInfo[c.status];
                return (
                  <Tr key={c.id}>
                    <Td className="font-medium text-slate-900">
                      <Link
                        href={`/financeiro/combos/${c.id}`}
                        className={`text-blue-700 hover:underline ${c.status === "CANCELADO" ? "text-slate-400 line-through" : ""}`}
                      >
                        {c.name}
                      </Link>
                      {c.tipo === "SAQUE" ? (
                        <span className="ml-2 align-middle">
                          <Badge tone="success">💸 Saque</Badge>
                        </span>
                      ) : null}
                      <span className="block text-xs font-normal text-slate-400">criado em {formatDate(c.createdAt)}</span>
                    </Td>
                    <Td>{c.user?.name || "—"}</Td>
                    <Td className="text-right tabular-nums">{c.payables.length}</Td>
                    <Td className="text-right tabular-nums">
                      {abate > 0.005 ? (
                        <>
                          <span className="font-semibold text-slate-900">{formatCurrency(total - abate)}</span>
                          <span className="block text-xs font-normal text-slate-500">
                            {c.status === "PAGO" ? "líquido pago" : "líquido"} · total {formatCurrency(total)} −{" "}
                            {formatCurrency(abate)} saldo devedor
                          </span>
                        </>
                      ) : (
                        formatCurrency(total)
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Badge tone={info.tone}>{info.label}</Badge>
                        {isAdmin && c.status === "CANCELADO" ? (
                          <DeleteComboButton comboId={c.id} comboName={c.name} />
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
