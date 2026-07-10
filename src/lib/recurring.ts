import { prisma } from "@/lib/prisma";

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

export async function ensureRecurringGenerated(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const entries = await prisma.recurringEntry.findMany({
    where: {
      active: true,
      startDate: { lt: monthEnd },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
    },
    include: {
      payables: { where: { dueDate: { gte: monthStart, lt: monthEnd } }, select: { id: true } },
      receivables: { where: { dueDate: { gte: monthStart, lt: monthEnd } }, select: { id: true } },
    },
  });

  let created = 0;
  for (const entry of entries) {
    const dueDate = currentMonthDue(entry.dayOfMonth);
    if (entry.kind === "PAGAR" && entry.payables.length === 0) {
      await prisma.payable.create({
        data: {
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
      created++;
    } else if (entry.kind === "RECEBER" && entry.receivables.length === 0) {
      await prisma.receivable.create({
        data: {
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
      created++;
    }
  }
  return created;
}
