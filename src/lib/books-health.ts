import "server-only";
import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances, NEUTRAL_ACCOUNT_NAME } from "@/lib/accounts";
import { getPatrimonialStats } from "@/lib/patrimonial";
import { getProfitLossStatement } from "@/lib/reports";

/**
 * "Farol" de integridade do financeiro, no estilo Agrasty. Dois checks que
 * ficam VERDES quando tudo está consistente e VERMELHOS quando há divergência
 * — e, quando vermelho, o sistema bloqueia novos lançamentos (assertBooksBalanced).
 *
 *  1) Saldos totais (Contas × Caixa geral × Extrato) convergentes.
 *     - Contas: soma dos saldos das contas financeiras (getAccountsWithBalances).
 *     - Caixa geral: mesma base (equação patrimonial → saldoCaixa).
 *     - Extrato: o caixa "cheio", incluindo dinheiro recebido/pago que foi
 *       baixado SEM uma conta financeira. Se todo dinheiro está atribuído a uma
 *       conta (comportamento normal do sistema), os três batem → verde. Sobrar
 *       dinheiro sem conta → vermelho, com a lista do que corrigir.
 *       Créditos que não passam pelo caixa (ex.: "Entrada em troca") são
 *       ignorados de propósito para não gerar falso vermelho.
 *
 *  2) Lucro/Prejuízo correto: o extrato de Lucro/Prejuízo soma exatamente ao
 *     total exibido (consistência interna do resultado).
 */

const TOLERANCE = 0.01;
const LIFETIME_MONTHS = 600; // janela grande o suficiente p/ todo o histórico

export type UnattributedItem = { tipo: "entrada" | "saida"; descricao: string; valor: number };

export type BooksHealth = {
  check1: {
    ok: boolean;
    contasTotal: number;
    caixaGeral: number;
    extrato: number;
    baixasSemConta: number;
    bancoNeutro: number;
    itens: UnattributedItem[];
  };
  check2: {
    ok: boolean;
    total: number;
    somaExtrato: number;
    diff: number;
  };
  allOk: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getBooksHealth(): Promise<BooksHealth> {
  const [accounts, pat, pl, recSemConta, paySemConta] = await Promise.all([
    getAccountsWithBalances(),
    getPatrimonialStats(),
    getProfitLossStatement(LIFETIME_MONTHS),
    // Dinheiro recebido/pago SEM conta financeira. Transações internas da troca
    // já passam pelo Banco Neutro, então não aparecem aqui (têm conta).
    prisma.receivable.findMany({
      where: { status: "RECEBIDO", accountId: null },
      select: { description: true, amount: true },
    }),
    prisma.payable.findMany({
      where: { status: "PAGO", accountId: null },
      select: { description: true, amount: true },
    }),
  ]);

  // ----- Check 1 -----
  const contasTotal = round2(accounts.reduce((s, a) => s + a.balance, 0));
  const caixaGeral = round2(pat.saldoCaixa);
  const recTotal = recSemConta.reduce((s, r) => s + r.amount, 0);
  const payTotal = paySemConta.reduce((s, p) => s + p.amount, 0);
  const baixasSemConta = round2(recTotal - payTotal);
  const extrato = round2(contasTotal + baixasSemConta);
  const bancoNeutro = round2(
    accounts.filter((a) => a.name === NEUTRAL_ACCOUNT_NAME).reduce((s, a) => s + a.balance, 0),
  );
  const itens: UnattributedItem[] = [
    ...recSemConta.map((r) => ({ tipo: "entrada" as const, descricao: r.description, valor: r.amount })),
    ...paySemConta.map((p) => ({ tipo: "saida" as const, descricao: p.description, valor: p.amount })),
  ];
  const check1Ok =
    Math.abs(baixasSemConta) <= TOLERANCE &&
    Math.abs(caixaGeral - contasTotal) <= TOLERANCE &&
    Math.abs(bancoNeutro) <= TOLERANCE;

  // ----- Check 2 -----
  const somaExtrato = round2(pl.entries.reduce((s, e) => s + e.value, 0));
  const total = round2(pl.lucroLiquido);
  const check2Diff = round2(somaExtrato - total);
  const check2Ok = Math.abs(check2Diff) <= TOLERANCE;

  return {
    check1: { ok: check1Ok, contasTotal, caixaGeral, extrato, baixasSemConta, bancoNeutro, itens },
    check2: { ok: check2Ok, total, somaExtrato, diff: check2Diff },
    allOk: check1Ok && check2Ok,
  };
}

/**
 * Trava de segurança: lança se os saldos estiverem divergentes. Deve ser
 * chamada no início de toda ação que CRIA/BAIXA um lançamento financeiro.
 * Ações de correção (estorno, exclusão, editar conta) NÃO devem chamar, para
 * o usuário sempre conseguir sair de um estado vermelho.
 */
export async function assertBooksBalanced(): Promise<void> {
  let health: BooksHealth;
  try {
    health = await getBooksHealth();
  } catch {
    // Falha ao calcular o farol NÃO deve travar o sistema (fail-open).
    return;
  }
  if (health.allOk) return;
  const partes: string[] = [];
  if (!health.check1.ok) partes.push("saldos das contas × caixa × extrato");
  if (!health.check2.ok) partes.push("Lucro/Prejuízo");
  throw new Error(
    `Lançamento bloqueado: o financeiro está divergente (${partes.join(" e ")}). ` +
      `Corrija em "Contas e caixas" antes de fazer novos lançamentos.`,
  );
}
