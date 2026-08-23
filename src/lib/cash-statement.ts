import { prisma } from "@/lib/prisma";

/**
 * Extrato de caixa por conta para o Boletim de Caixa. Para cada conta (exceto o
 * Banco Neutro, que é conta de compensação), calcula o saldo anterior, as
 * entradas/saídas do intervalo e o saldo final — sempre a partir dos lançamentos
 * (baixas de Contas a receber = entrada, Contas a pagar = saída, transferências).
 */

export type StatementMovement = {
  id: string;
  date: string; // ISO
  kind: "entrada" | "saida";
  description: string;
  who: string;
  documentNumber: string | null;
  amount: number;
  saldo: number;
};

export type AccountStatement = {
  accountId: string;
  accountName: string;
  saldoAnterior: number;
  movimentos: StatementMovement[];
  totalIn: number;
  totalOut: number;
  saldoFinal: number;
};

export type CashStatement = {
  contas: AccountStatement[];
  consolidado: { saldoAnterior: number; totalIn: number; totalOut: number; saldoFinal: number };
};

const round2 = (n: number) => Math.round(n * 100) / 100;
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export async function buildCashStatement(start: Date, end: Date): Promise<CashStatement> {
  const startD = utcDay(start);
  const endExcl = addDays(utcDay(end), 1); // fim do dia final (exclusivo)

  const [accounts, paid, recv, transfers] = await Promise.all([
    prisma.financialAccount.findMany({
      // Fora as estruturais (Banco Neutro): é conta de compensação, não caixa.
      where: { structural: false },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, initialBalance: true },
    }),
    prisma.payable.findMany({
      where: { status: "PAGO", paymentDate: { lt: endExcl }, accountId: { not: null } },
      select: {
        id: true, accountId: true, paymentDate: true, amount: true, description: true,
        documentNumber: true, createdAt: true,
        supplier: { select: { name: true } },
        beneficiaryUser: { select: { name: true } },
        capitalBeneficiary: { select: { name: true } },
      },
    }),
    prisma.receivable.findMany({
      where: { status: "RECEBIDO", receivedDate: { lt: endExcl }, accountId: { not: null } },
      select: {
        id: true, accountId: true, receivedDate: true, amount: true, description: true, createdAt: true,
        customer: { select: { name: true } },
        capitalBeneficiary: { select: { name: true } },
      },
    }),
    prisma.accountTransfer.findMany({
      where: { date: { lt: endExcl } },
      include: { from: { select: { name: true } }, to: { select: { name: true } } },
    }),
  ]);

  type Raw = { id: string; date: Date; createdAt: Date; kind: "entrada" | "saida"; amount: number; description: string; who: string; documentNumber: string | null };

  const byAccount = new Map<string, Raw[]>();
  const push = (accountId: string | null, r: Raw) => {
    if (!accountId) return;
    const arr = byAccount.get(accountId) ?? [];
    arr.push(r);
    byAccount.set(accountId, arr);
  };

  for (const p of paid) {
    push(p.accountId, {
      id: `p_${p.id}`, date: p.paymentDate!, createdAt: p.createdAt, kind: "saida", amount: p.amount,
      description: p.description,
      who: p.supplier?.name || p.beneficiaryUser?.name || p.capitalBeneficiary?.name || "—",
      documentNumber: p.documentNumber ?? null,
    });
  }
  for (const r of recv) {
    push(r.accountId, {
      id: `r_${r.id}`, date: r.receivedDate!, createdAt: r.createdAt, kind: "entrada", amount: r.amount,
      description: r.description,
      who: r.customer?.name || r.capitalBeneficiary?.name || "—",
      documentNumber: null,
    });
  }
  for (const t of transfers) {
    push(t.fromId, {
      id: `tf_${t.id}`, date: t.date, createdAt: t.createdAt, kind: "saida", amount: t.amount,
      description: `Transferência para ${t.to?.name || "conta"}`, who: "Transferência", documentNumber: null,
    });
    push(t.toId, {
      id: `tt_${t.id}`, date: t.date, createdAt: t.createdAt, kind: "entrada", amount: t.amount,
      description: `Transferência de ${t.from?.name || "conta"}`, who: "Transferência", documentNumber: null,
    });
  }

  const contas: AccountStatement[] = [];
  for (const acc of accounts) {
    const raw = (byAccount.get(acc.id) ?? []).sort(
      (a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
    );
    const priorSigned = raw
      .filter((m) => m.date < startD)
      .reduce((s, m) => s + (m.kind === "entrada" ? m.amount : -m.amount), 0);
    const saldoAnterior = round2(acc.initialBalance + priorSigned);
    const inRange = raw.filter((m) => m.date >= startD && m.date < endExcl);

    // Conta totalmente vazia (sem saldo de abertura, sem histórico, sem movimento
    // no período): omite para não poluir o boletim.
    if (acc.initialBalance === 0 && raw.length === 0) continue;

    let running = saldoAnterior;
    const movimentos: StatementMovement[] = inRange.map((m) => {
      running = round2(running + (m.kind === "entrada" ? m.amount : -m.amount));
      return {
        id: m.id, date: m.date.toISOString(), kind: m.kind, description: m.description,
        who: m.who, documentNumber: m.documentNumber, amount: m.amount, saldo: running,
      };
    });
    const totalIn = round2(inRange.filter((m) => m.kind === "entrada").reduce((s, m) => s + m.amount, 0));
    const totalOut = round2(inRange.filter((m) => m.kind === "saida").reduce((s, m) => s + m.amount, 0));
    contas.push({
      accountId: acc.id, accountName: acc.name, saldoAnterior, movimentos, totalIn, totalOut,
      saldoFinal: round2(saldoAnterior + totalIn - totalOut),
    });
  }

  const consolidado = {
    saldoAnterior: round2(contas.reduce((s, c) => s + c.saldoAnterior, 0)),
    totalIn: round2(contas.reduce((s, c) => s + c.totalIn, 0)),
    totalOut: round2(contas.reduce((s, c) => s + c.totalOut, 0)),
    saldoFinal: round2(contas.reduce((s, c) => s + c.saldoFinal, 0)),
  };
  return { contas, consolidado };
}
