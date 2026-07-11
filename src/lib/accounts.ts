import { prisma } from "@/lib/prisma";

/**
 * Contas financeiras (caixas/bancos): saldo calculado a partir do saldo
 * inicial + recebimentos baixados − pagamentos baixados ± transferências.
 * Baixas sem conta explícita caem na conta padrão (isDefault).
 */

export async function getDefaultAccountId(): Promise<string | null> {
  const account = await prisma.financialAccount.findFirst({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  return account?.id ?? null;
}

export async function getActiveAccounts() {
  return prisma.financialAccount.findMany({
    where: { active: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, isDefault: true },
  });
}

export type AccountWithBalance = {
  id: string;
  name: string;
  type: "CAIXA" | "BANCO" | "POUPANCA" | "OUTRO";
  bankName: string | null;
  agency: string | null;
  accountNumber: string | null;
  isDefault: boolean;
  active: boolean;
  initialBalance: number;
  received: number;
  paid: number;
  transfersIn: number;
  transfersOut: number;
  balance: number;
};

export async function getAccountsWithBalances(): Promise<AccountWithBalance[]> {
  const [accounts, paid, received, transfers] = await Promise.all([
    prisma.financialAccount.findMany({
      orderBy: [{ active: "desc" }, { isDefault: "desc" }, { name: "asc" }],
    }),
    prisma.payable.groupBy({
      by: ["accountId"],
      where: { status: "PAGO", accountId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.receivable.groupBy({
      by: ["accountId"],
      where: { status: "RECEBIDO", accountId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.accountTransfer.findMany({ select: { fromId: true, toId: true, amount: true } }),
  ]);

  const paidBy = new Map(paid.map((p) => [p.accountId, p._sum.amount ?? 0]));
  const receivedBy = new Map(received.map((r) => [r.accountId, r._sum.amount ?? 0]));

  return accounts.map((account) => {
    const transfersIn = transfers
      .filter((t) => t.toId === account.id)
      .reduce((s, t) => s + t.amount, 0);
    const transfersOut = transfers
      .filter((t) => t.fromId === account.id)
      .reduce((s, t) => s + t.amount, 0);
    const receivedTotal = receivedBy.get(account.id) ?? 0;
    const paidTotal = paidBy.get(account.id) ?? 0;
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      bankName: account.bankName,
      agency: account.agency,
      accountNumber: account.accountNumber,
      isDefault: account.isDefault,
      active: account.active,
      initialBalance: account.initialBalance,
      received: receivedTotal,
      paid: paidTotal,
      transfersIn,
      transfersOut,
      balance:
        account.initialBalance + receivedTotal - paidTotal + transfersIn - transfersOut,
    };
  });
}
