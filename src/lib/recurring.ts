import { prisma } from "@/lib/prisma";
import { structuralCenterId } from "@/lib/structural";

/**
 * Geração idempotente dos lançamentos recorrentes do mês corrente.
 *
 * Chamada ao abrir as telas do financeiro: para cada recorrência ativa,
 * cria a conta a pagar/receber do mês se ainda não existir (a checagem é
 * pelo vínculo recurringId + vencimento dentro do mês). Assim não há
 * necessidade de job agendado e nada é gerado em duplicidade.
 */

function currentMonthDue(dayOfMonth: number): Date {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return new Date(Date.UTC(year, month, day, 12));
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Vencimentos "a cada N dias" desde startDate até hoje (com teto de segurança). */
function intervalDueDates(startDate: Date, everyDays: number, endDate: Date | null): Date[] {
  const CAP = 120; // nunca gera em massa, mesmo com startDate muito antigo
  const step = Math.max(1, Math.round(everyDays));
  const now = new Date();
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59));
  const out: Date[] = [];
  // Âncora no meio-dia UTC do dia de início.
  let due = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), 12));
  while (due <= todayEnd && (!endDate || due <= endDate) && out.length < CAP) {
    out.push(new Date(due));
    due = new Date(due.getTime() + step * 24 * 60 * 60 * 1000);
  }
  return out;
}

/** Gera as parcelas mensais dos consórcios ativos até o mês corrente
 * (com recuperação de meses passados), numeradas e sem duplicidade. */
export async function ensureConsortiumInstallments(): Promise<number> {
  const now = new Date();
  const consortiums = await prisma.consortium.findMany({
    where: { status: "ATIVO" },
    include: { payables: { select: { id: true } } },
  });

  let created = 0;
  for (const consortium of consortiums) {
    const existing = consortium.payables.length;
    const start = consortium.startDate;
    const monthsElapsed =
      (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - start.getUTCMonth());
    const target = Math.min(consortium.installmentsCount, Math.max(0, monthsElapsed) + 1);

    for (let i = existing; i < target; i++) {
      const year = start.getUTCFullYear();
      const month = start.getUTCMonth() + i;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const dueDate = new Date(Date.UTC(year, month, Math.min(consortium.dueDay, lastDay), 12));
      await prisma.payable.create({
        data: {
          costCenterId: await structuralCenterId("ADMINISTRATIVO"),
          description: `${consortium.name} - Parcela ${i + 1}/${consortium.installmentsCount}`,
          category: "OUTROS",
          amount: consortium.installmentValue,
          dueDate,
          status: "PENDENTE",
          consortiumId: consortium.id,
          notes: consortium.administrator ? `Administradora: ${consortium.administrator}` : null,
        },
      });
      created++;
    }
  }
  return created;
}

const isStructuralKey = (v: string | null): v is "VEICULOS" | "ADMINISTRATIVO" | "CAPITAL" =>
  v === "VEICULOS" || v === "ADMINISTRATIVO" || v === "CAPITAL";

export async function ensureRecurringGenerated(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  // Traz todos os vencimentos já gerados de cada recorrência (para não duplicar
  // tanto no modo mensal quanto no "a cada N dias").
  const entries = await prisma.recurringEntry.findMany({
    where: {
      active: true,
      startDate: { lt: monthEnd },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
    },
    include: {
      payables: { select: { dueDate: true } },
      receivables: { select: { dueDate: true } },
    },
  });

  let created = 0;
  for (const entry of entries) {
    const center = await structuralCenterId(
      isStructuralKey(entry.structuralKey) ? entry.structuralKey : "ADMINISTRATIVO",
    );
    const existingDays = new Set(
      [...entry.payables, ...entry.receivables].map((t) => dayKey(t.dueDate)),
    );

    // Datas de vencimento a garantir: mensal (só o mês corrente) ou por intervalo.
    const dueDates =
      entry.intervalDays && entry.intervalDays > 0
        ? intervalDueDates(entry.startDate, entry.intervalDays, entry.endDate)
        : [currentMonthDue(entry.dayOfMonth)];

    for (const dueDate of dueDates) {
      if (existingDays.has(dayKey(dueDate))) continue;
      if (entry.kind === "PAGAR") {
        await prisma.payable.create({
          data: {
            costCenterId: center,
            description: entry.description,
            category: entry.categoryPagar ?? "DESPESA_OPERACIONAL",
            amount: entry.amount,
            dueDate,
            status: "PENDENTE",
            supplierId: entry.supplierId,
            recurringId: entry.id,
            notes: entry.notes,
          },
        });
      } else {
        await prisma.receivable.create({
          data: {
            costCenterId: center,
            description: entry.description,
            category: entry.categoryReceber ?? "OUTROS",
            amount: entry.amount,
            dueDate,
            status: "PENDENTE",
            customerId: entry.customerId,
            recurringId: entry.id,
            notes: entry.notes,
          },
        });
      }
      existingDays.add(dayKey(dueDate));
      created++;
    }
  }
  return created;
}
