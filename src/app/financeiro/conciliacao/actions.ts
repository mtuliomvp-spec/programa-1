"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseOfx } from "@/lib/ofx";
import { getDefaultAccountId } from "@/lib/accounts";

/**
 * Conciliação bancária: importa o extrato OFX, casa cada transação do
 * banco com uma conta do sistema (pelo valor e proximidade de data) e,
 * ao confirmar, marca as contas como conciliadas — dando baixa nas que
 * ainda estavam pendentes.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MATCH_WINDOW_DAYS = 7;

export type BankTxn = {
  fitId: string;
  date: string;
  amount: number;
  memo: string;
};

export type MatchCandidate = {
  kind: "payable" | "receivable";
  id: string;
  description: string;
  amount: number;
  date: string;
  settled: boolean; // já estava pago/recebido
};

export type MatchRow = {
  txn: BankTxn;
  status: "ja_conciliado" | "casou" | "sem_match";
  match?: MatchCandidate;
};

export type ReconcileResult = { rows?: MatchRow[]; error?: string };

function centsEqual(a: number, b: number) {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= 1;
}

function dayDiff(a: Date, isoB: string) {
  return Math.abs(a.getTime() - new Date(`${isoB}T12:00:00Z`).getTime()) / DAY_MS;
}

export async function parseAndMatchAction(formData: FormData): Promise<ReconcileResult> {
  const file = formData.get("ofx");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o arquivo OFX exportado do seu banco." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "Arquivo muito grande (máximo 5 MB)." };
  }

  const content = await file.text();
  const txns = parseOfx(content);
  if (txns.length === 0) {
    return { error: "Nenhuma transação encontrada no arquivo. Confirme se é um OFX válido." };
  }

  const dates = txns.map((t) => new Date(`${t.date}T12:00:00Z`).getTime());
  const rangeStart = new Date(Math.min(...dates) - MATCH_WINDOW_DAYS * DAY_MS);
  const rangeEnd = new Date(Math.max(...dates) + MATCH_WINDOW_DAYS * DAY_MS);

  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany({
      where: { dueDate: { gte: rangeStart, lte: rangeEnd } },
      select: {
        id: true,
        description: true,
        amount: true,
        dueDate: true,
        paymentDate: true,
        status: true,
        reconciledAt: true,
        bankRef: true,
      },
    }),
    prisma.receivable.findMany({
      where: { dueDate: { gte: rangeStart, lte: rangeEnd } },
      select: {
        id: true,
        description: true,
        amount: true,
        dueDate: true,
        receivedDate: true,
        status: true,
        reconciledAt: true,
        bankRef: true,
      },
    }),
  ]);

  const reconciledRefs = new Set(
    [...payables, ...receivables].map((r) => r.bankRef).filter(Boolean) as string[],
  );
  const used = new Set<string>();
  const rows: MatchRow[] = [];

  for (const txn of txns.sort((a, b) => a.date.localeCompare(b.date))) {
    if (reconciledRefs.has(txn.fitId)) {
      rows.push({ txn, status: "ja_conciliado" });
      continue;
    }

    const isOut = txn.amount < 0;
    const target = Math.abs(txn.amount);

    const candidates = (isOut ? payables : receivables)
      .filter((c) => !used.has(c.id) && !c.reconciledAt && centsEqual(c.amount, target))
      .map((c) => {
        const settledDate = isOut
          ? (c as { paymentDate?: Date | null }).paymentDate
          : (c as { receivedDate?: Date | null }).receivedDate;
        const refDate = settledDate ?? c.dueDate;
        return { c, diff: dayDiff(refDate, txn.date), settled: Boolean(settledDate) };
      })
      .filter((x) => x.diff <= MATCH_WINDOW_DAYS)
      .sort((a, b) => Number(b.settled) - Number(a.settled) || a.diff - b.diff);

    const best = candidates[0];
    if (best) {
      used.add(best.c.id);
      rows.push({
        txn,
        status: "casou",
        match: {
          kind: isOut ? "payable" : "receivable",
          id: best.c.id,
          description: best.c.description,
          amount: best.c.amount,
          date: best.c.dueDate.toISOString().slice(0, 10),
          settled: best.settled,
        },
      });
    } else {
      rows.push({ txn, status: "sem_match" });
    }
  }

  return { rows };
}

export async function confirmMatchesAction(
  matches: { kind: "payable" | "receivable"; id: string; fitId: string; date: string }[],
  accountId?: string,
): Promise<{ done: number }> {
  const account = accountId || (await getDefaultAccountId());
  let done = 0;
  for (const m of matches.slice(0, 500)) {
    const when = new Date(`${m.date}T12:00:00Z`);
    if (m.kind === "payable") {
      await prisma.payable.update({
        where: { id: m.id },
        data: {
          reconciledAt: new Date(),
          bankRef: m.fitId,
          status: "PAGO",
          paymentDate: { set: when },
          accountId: account,
        },
      });
    } else {
      await prisma.receivable.update({
        where: { id: m.id },
        data: {
          reconciledAt: new Date(),
          bankRef: m.fitId,
          status: "RECEBIDO",
          receivedDate: { set: when },
          accountId: account,
        },
      });
    }
    done++;
  }
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
  return { done };
}

export async function createFromBankTxnAction(
  txn: BankTxn,
  accountId?: string,
): Promise<{ ok: boolean }> {
  const account = accountId || (await getDefaultAccountId());
  const when = new Date(`${txn.date}T12:00:00Z`);
  if (txn.amount < 0) {
    await prisma.payable.create({
      data: {
        description: txn.memo.slice(0, 180),
        category: "OUTROS",
        amount: Math.abs(txn.amount),
        dueDate: when,
        paymentDate: when,
        status: "PAGO",
        reconciledAt: new Date(),
        bankRef: txn.fitId,
        accountId: account,
        notes: "Criado pela conciliação bancária",
      },
    });
  } else {
    await prisma.receivable.create({
      data: {
        description: txn.memo.slice(0, 180),
        category: "OUTROS",
        amount: txn.amount,
        dueDate: when,
        receivedDate: when,
        status: "RECEBIDO",
        reconciledAt: new Date(),
        bankRef: txn.fitId,
        accountId: account,
        notes: "Criado pela conciliação bancária",
      },
    });
  }
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/livro-caixa");
  return { ok: true };
}
