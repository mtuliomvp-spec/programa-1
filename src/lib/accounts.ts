import { prisma } from "@/lib/prisma";
import { timed } from "@/lib/perf";

/**
 * Contas financeiras (caixas/bancos): saldo calculado a partir do saldo
 * inicial + recebimentos baixados − pagamentos baixados ± transferências.
 * Baixas sem conta explícita caem na conta padrão (isDefault).
 */

export async function getDefaultAccountId(): Promise<string | null> {
  const account = await prisma.financialAccount.findFirst({
    // Nunca o Banco Neutro: o fallback de quem não escolheu conta tem que ser
    // uma conta de verdade (o Neutro só entra por escolha explícita).
    where: { active: true, structural: false },
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
 *
 * É uma conta ESTRUTURAL: pertence ao sistema, não ao usuário. Nasce sozinha
 * (chave fixa `NEUTRO`), não pode ser desativada, excluída, transferida nem
 * virar conta padrão — as travas ficam nas actions de Contas. Identificar pela
 * CHAVE (e não pelo nome) é o que garante que renomear a conta não quebre o
 * farol nem o livro caixa.
 *
 * Ela APARECE nos seletores de baixa (pagar/receber), sempre por último e com o
 * rótulo "(compensação)": é onde se dá baixa no título que não passou por caixa
 * nenhum — a parcela que a financeira já descontou do repasse, o acerto que se
 * anulou com outro. Antes ela ficava escondida e essas baixas ficavam sem conta,
 * quebrando o Check 1 até alguém rodar a correção que joga tudo no Neutro.
 */
export const NEUTRAL_ACCOUNT_NAME = "Banco Neutro";
export const NEUTRAL_ACCOUNT_KEY = "NEUTRO";

const NEUTRAL_NOTES =
  "Conta estrutural do sistema: compensa as transações internas (troca, capital, acertos). Fica sempre em zero e não pode ser excluída.";

/**
 * Garante a existência da conta estrutural Banco Neutro (idempotente).
 * Instalações antigas têm a conta criada só pelo nome — nesse caso ela é
 * ADOTADA (ganha a chave), em vez de nascer uma segunda.
 */
export async function ensureNeutralAccount(): Promise<string> {
  const byKey = await prisma.financialAccount.findUnique({
    where: { key: NEUTRAL_ACCOUNT_KEY },
    select: { id: true },
  });
  if (byKey) return byKey.id;

  const byName = await prisma.financialAccount.findFirst({
    where: { name: NEUTRAL_ACCOUNT_NAME },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (byName) {
    await prisma.financialAccount.update({
      where: { id: byName.id },
      data: { key: NEUTRAL_ACCOUNT_KEY, structural: true, active: true, isDefault: false },
    });
    return byName.id;
  }

  const created = await prisma.financialAccount.create({
    data: {
      key: NEUTRAL_ACCOUNT_KEY,
      structural: true,
      name: NEUTRAL_ACCOUNT_NAME,
      type: "OUTRO",
      initialBalance: 0,
      notes: NEUTRAL_NOTES,
    },
    select: { id: true },
  });
  return created.id;
}

export const getNeutralAccountId = ensureNeutralAccount;

/**
 * Rótulo da conta nos seletores: o Banco Neutro sai marcado como conta de
 * compensação para ninguém pagar a conta de luz nele achando que é banco.
 */
export function accountPickerName(name: string, structural: boolean) {
  return structural ? `${name} (compensação)` : name;
}

/**
 * Contas para os seletores de BAIXA (a-pagar, a-receber, compras, combos,
 * estoque): exclui as de Aplicação — o dinheiro delas só entra/sai pelo fluxo
 * de aplicação — e inclui o Banco Neutro, sempre no fim da lista e marcado como
 * conta de compensação, para dar baixa no que não passou por caixa.
 */
export async function getActiveAccounts() {
  const accounts = await prisma.financialAccount.findMany({
    where: { active: true, isInvestment: false },
    // `structural` asc = as contas de verdade primeiro, o Neutro por último
    // (nunca é a opção pré-selecionada, que é sempre a primeira do select).
    orderBy: [{ structural: "asc" }, { isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, type: true, isDefault: true, structural: true },
  });
  return accounts.map(({ structural, ...a }) => ({
    ...a,
    name: accountPickerName(a.name, structural),
  }));
}

/**
 * Contas comuns para os seletores de baixa/transferência: exclui as contas de
 * Aplicação (o dinheiro delas só entra/sai pelas operações de aplicação, que
 * mantêm a razão do capital por sócio batendo com o saldo) e as estruturais.
 */
export async function getSelectableAccounts() {
  return prisma.financialAccount.findMany({
    where: { active: true, isInvestment: false, structural: false },
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
  /** Conta do sistema (Banco Neutro): protegida contra alteração/exclusão. */
  structural: boolean;
  type: "CAIXA" | "BANCO" | "POUPANCA" | "FINANCEIRA" | "OUTRO";
  bankName: string | null;
  agency: string | null;
  accountNumber: string | null;
  isDefault: boolean;
  isInvestment: boolean;
  /** Até quando a aplicação rende (só faz sentido com isInvestment). */
  investmentMaturity: Date | null;
  active: boolean;
  initialBalance: number;
  received: number;
  paid: number;
  transfersIn: number;
  transfersOut: number;
  balance: number;
};

export async function getAccountsWithBalances(): Promise<AccountWithBalance[]> {
  return timed("saldo das contas", accountsWithBalances);
}

async function accountsWithBalances(): Promise<AccountWithBalance[]> {
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
      structural: account.structural,
      type: account.type,
      bankName: account.bankName,
      agency: account.agency,
      accountNumber: account.accountNumber,
      isDefault: account.isDefault,
      isInvestment: account.isInvestment,
      investmentMaturity: account.investmentMaturity,
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
