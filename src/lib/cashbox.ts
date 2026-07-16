import "server-only";
import { prisma } from "@/lib/prisma";
import type { CashboxSession } from "@prisma/client";

/**
 * Controle global de abertura/fechamento de caixa (estilo Agrasty). Um único
 * estado para toda a loja: enquanto não houver uma sessão ABERTA, nenhum
 * lançamento financeiro é permitido. Sem conferência de valor — o saldo do
 * sistema é a verdade; o fechamento é só o registro de quem fechou e quando.
 */

export type CashboxState = { open: boolean; session: CashboxSession | null };

/** Estado atual = a sessão mais recente; ABERTO se ela existe e não foi fechada. */
export async function getCashboxState(): Promise<CashboxState> {
  const session = await prisma.cashboxSession.findFirst({ orderBy: { openedAt: "desc" } });
  return { open: !!session && session.closedAt == null, session };
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Abre OU reabre o caixa. Se já estiver aberto, não faz nada. Se a última sessão
 * estiver FECHADA e for do MESMO dia de trabalho, **reabre** aquela sessão (limpa
 * o fechamento) — como no Agrasty, sem duplicar o dia no histórico. Se for um dia
 * diferente (ou não houver sessão), cria uma sessão nova.
 */
export async function openCashbox(userName: string | null, workDate: Date): Promise<void> {
  const last = await prisma.cashboxSession.findFirst({ orderBy: { openedAt: "desc" } });
  if (last && last.closedAt == null) return; // já aberto
  if (last && last.closedAt != null && dayKey(last.workDate) === dayKey(workDate)) {
    // Reabre a sessão fechada do mesmo dia.
    await prisma.cashboxSession.update({
      where: { id: last.id },
      data: { closedAt: null, closedBy: null },
    });
    return;
  }
  await prisma.cashboxSession.create({
    data: { workDate, openedBy: userName || null },
  });
}

/** Fecha o caixa aberto (no-op se já estiver fechado). */
export async function closeCashbox(userName: string | null): Promise<void> {
  const session = await prisma.cashboxSession.findFirst({ orderBy: { openedAt: "desc" } });
  if (!session || session.closedAt != null) return;
  await prisma.cashboxSession.update({
    where: { id: session.id },
    data: { closedAt: new Date(), closedBy: userName || null },
  });
}

/**
 * Trava de lançamento: lança se o caixa estiver FECHADO. Chamada junto de
 * `assertBooksBalanced` no início de toda ação que cria/baixa lançamento.
 * Fail-open em erro de leitura (nunca travar o sistema por um bug de cálculo).
 */
export async function assertCashboxOpen(): Promise<void> {
  let open: boolean;
  try {
    open = (await getCashboxState()).open;
  } catch {
    return; // fail-open
  }
  if (!open) {
    throw new Error(
      'O caixa está fechado. Abra o caixa em "Contas e caixas" para fazer lançamentos.',
    );
  }
}
