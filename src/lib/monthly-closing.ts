import "server-only";
import { prisma } from "@/lib/prisma";
import { getProfitLossStatement } from "@/lib/reports";
import { getCompany, ensureCompanyBeneficiary } from "@/lib/company";

/**
 * Fechamento mensal (estilo Agrasty, SEM a cobertura de saldo devedor dos
 * sócios). Ao fechar um mês:
 *  1. O resultado (L/P) do mês é transferido para o CAPITAL DA EMPRESA
 *     (beneficiário isCompany): lucro → aporte, prejuízo → retirada. São
 *     transações de capital PURAS (sem caixa) — o dinheiro já está nas contas;
 *     o que muda é a classificação (resultado → capital). No Lucro/Prejuízo o
 *     mês passa a mostrar R$ 0 (reports.ts lança o "fechamento" de −resultado),
 *     e na equação patrimonial o capital sobe pelo mesmo valor — o Check 2
 *     continua batendo pois os DOIS lados usam o MESMO valor gravado.
 *  2. Pró-labore (Etapa B da Agrasty): cada beneficiário marcado
 *     (includeInMonthlyClosing) com proLabore > 0 recebe um APORTE do valor,
 *     com RETIRADA espelho na empresa (net zero no capital total).
 *  3. O mês fica TRAVADO: lançamentos com data dentro de mês fechado são
 *     bloqueados (assertMonthOpen).
 * Reabrir estorna tudo (apaga as transações do fechamento e o registro).
 */

const LIFETIME_MONTHS = 600;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  // Último dia do mês, meio-dia UTC (data dos lançamentos do fechamento).
  const lastDay = new Date(Date.UTC(year, month, 0, 12));
  return { start, end, lastDay };
}

export function monthLabelBR(year: number, month: number) {
  return `${String(month).padStart(2, "0")}/${year}`;
}

/**
 * Resultado (L/P) do mês pela MESMA fonte do extrato de Lucro/Prejuízo: soma
 * dos lançamentos do P&L com data dentro do mês (excluindo lançamentos de
 * fechamento). Assim o mês fechado exibe exatamente R$ 0 no extrato.
 */
export async function getMonthResult(year: number, month: number): Promise<number> {
  const { start, end } = monthBounds(year, month);
  const pl = await getProfitLossStatement(LIFETIME_MONTHS);
  return round2(
    pl.entries
      .filter((e) => e.kind !== "FECHAMENTO" && e.date >= start && e.date < end)
      .reduce((s, e) => s + e.value, 0),
  );
}

export async function getClosedMonths() {
  return prisma.monthlyClosing.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }] });
}

export async function isMonthClosed(date: Date): Promise<boolean> {
  const found = await prisma.monthlyClosing.findUnique({
    where: {
      year_month: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 },
    },
    select: { id: true },
  });
  return !!found;
}

/**
 * Trava: lança erro amigável se a data cair em um mês já fechado. Usada nas
 * ações financeiras em que o usuário escolhe a data do lançamento.
 */
export async function assertMonthOpen(date: Date): Promise<void> {
  if (await isMonthClosed(date)) {
    const label = monthLabelBR(date.getUTCFullYear(), date.getUTCMonth() + 1);
    throw new Error(
      `O mês ${label} já foi fechado. Reabra o mês em Financeiro → Fechamento Mensal para lançar nessa data.`,
    );
  }
}

/** Fecha o mês (year, month 1-12). Devolve o registro criado. */
export async function closeMonth(year: number, month: number, userName: string | null) {
  const now = new Date();
  const currentKey = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  const targetKey = year * 12 + month;
  if (!(month >= 1 && month <= 12)) throw new Error("Mês inválido.");
  if (targetKey >= currentKey) {
    throw new Error("Só é possível fechar meses já encerrados (anteriores ao mês atual).");
  }

  const existing = await prisma.monthlyClosing.findUnique({
    where: { year_month: { year, month } },
  });
  if (existing) throw new Error(`O mês ${monthLabelBR(year, month)} já está fechado.`);

  // Fecha em ordem: o mês precisa ser posterior ao último fechamento.
  const latest = await prisma.monthlyClosing.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  if (latest && targetKey <= latest.year * 12 + latest.month) {
    throw new Error(
      `Feche os meses em ordem: o último fechado é ${monthLabelBR(latest.year, latest.month)}.`,
    );
  }

  await getCompany();
  const company = await ensureCompanyBeneficiary();
  if (!company) throw new Error("Configure a empresa em Parâmetros antes de fechar o mês.");

  const result = await getMonthResult(year, month);
  const { lastDay } = monthBounds(year, month);
  const label = monthLabelBR(year, month);

  // Pró-labore: beneficiários marcados (fora a empresa), com valor definido.
  const beneficiarios = await prisma.capitalBeneficiary.findMany({
    where: { includeInMonthlyClosing: true, active: true, isCompany: false, proLabore: { gt: 0 } },
    select: { id: true, name: true, proLabore: true },
  });

  return prisma.$transaction(async (tx) => {
    const closing = await tx.monthlyClosing.create({
      data: {
        year,
        month,
        result,
        closedBy: userName || null,
        snapshot: {
          resultado: result,
          proLabore: beneficiarios.map((b) => ({ name: b.name, amount: b.proLabore })),
        },
      },
    });

    // 1) Zeragem do L/P → capital da empresa (lucro=aporte, prejuízo=retirada).
    if (Math.abs(result) >= 0.01) {
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: company.id,
          kind: result > 0 ? "APORTE" : "RETIRADA",
          amount: Math.abs(result),
          date: lastDay,
          description: `${result > 0 ? "Lucro" : "Prejuízo"} computado no mês ${label} — fechamento mensal`,
          monthlyClosingId: closing.id,
        },
      });
    }

    // 2) Etapa B — pró-labore (SEM a Etapa A de cobertura de saldo devedor).
    for (const b of beneficiarios) {
      const amount = round2(b.proLabore);
      if (amount <= 0) continue;
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: b.id,
          kind: "APORTE",
          amount,
          date: lastDay,
          description: `Pró-labore ${label} — fechamento mensal`,
          monthlyClosingId: closing.id,
        },
      });
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: company.id,
          kind: "RETIRADA",
          amount,
          date: lastDay,
          description: `Pró-labore ${label} — ${b.name} (contrapartida empresa)`,
          monthlyClosingId: closing.id,
        },
      });
    }

    return closing;
  });
}

/** Reabre o mês: estorna as transações do fechamento e apaga o registro. */
export async function reopenMonth(year: number, month: number) {
  const closing = await prisma.monthlyClosing.findUnique({
    where: { year_month: { year, month } },
  });
  if (!closing) throw new Error(`O mês ${monthLabelBR(year, month)} não está fechado.`);

  // Reabre em ordem inversa: só o fechamento mais recente pode ser reaberto.
  const latest = await prisma.monthlyClosing.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  if (latest && latest.id !== closing.id) {
    throw new Error(
      `Reabra primeiro o mês mais recente (${monthLabelBR(latest.year, latest.month)}).`,
    );
  }

  await prisma.$transaction([
    prisma.capitalTransaction.deleteMany({ where: { monthlyClosingId: closing.id } }),
    prisma.monthlyClosing.delete({ where: { id: closing.id } }),
  ]);
}
