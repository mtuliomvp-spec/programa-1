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

/**
 * "Banco Neutro": conta usada para as transações INTERNAS do sistema que não
 * passam pelo caixa de verdade (ex.: a entrada da troca e a compra do veículo
 * recebido em troca — uma quita a outra). Cada operação lança um par que se
 * anula, então o Banco Neutro sempre fica com saldo ZERO. Assim nenhum
 * lançamento fica "sem conta" e o saldo das contas bate com o livro caixa.
 * Encontra a conta pelo nome; cria se ainda não existir.
 */
export const NEUTRAL_ACCOUNT_NAME = "Banco Neutro";

export async function getNeutralAccountId(): Promise<string> {
  const existing = await prisma.financialAccount.findFirst({
    where: { name: NEUTRAL_ACCOUNT_NAME },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.financialAccount.create({
    data: {
      name: NEUTRAL_ACCOUNT_NAME,
      type: "OUTRO",
      initialBalance: 0,
      notes: "Conta de compensação para transações internas (troca). Deve ficar sempre em zero.",
    },
    select: { id: true },
  });
  return created.id;
}

// Usada nos seletores de baixa (a-pagar/a-receber/estoque/conciliação): exclui
// contas de Aplicação — o dinheiro delas só entra/sai pelo fluxo de aplicação.
export async function getActiveAccounts() {
  return prisma.financialAccount.findMany({
    where: { active: true, isInvestment: false },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, isDefault: true },
  });
}

/**
 * Contas comuns para os seletores de baixa/transferência: exclui as contas de
 * Aplicação (o dinheiro delas só entra/sai pelas operações de aplicação, que
 * mantêm a razão do capital por sócio batendo com o saldo).
 */
export async function getSelectableAccounts() {
  return prisma.financialAccount.findMany({
    where: { active: true, isInvestment: false },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, isDefault: true },
  });
}

export async function getInvestmentAccounts() {
  return prisma.financialAccount.findMany({
    where: { active: true, isInvestment: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export type AccountWithBalance = {
  id: string;
  name: string;
  type: "CAIXA" | "BANCO" | "POUPANCA" | "FINANCEIRA" | "OUTRO";
  bankName: string | null;
  agency: string | null;
  accountNumber: string | null;
  isDefault: boolean;
  isInvestment: boolean;
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
      isInvestment: account.isInvestment,
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
