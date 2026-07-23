import "server-only";
import { prisma } from "@/lib/prisma";
import { structuralCenterId } from "@/lib/structural";

/**
 * Motor das contas de APLICAÇÃO (investimento dos sócios).
 *
 * Uma conta Aplicação guarda capital dos sócios. O saldo dela é sempre
 * distribuído entre os beneficiários do Capital via `InvestmentAllocation`
 * (a "razão do capital aplicado"). Invariante central:
 *
 *    saldo(conta Aplicação) == Σ alocações da conta
 *
 * Toda operação aqui zera no LUCRO (é aporte/retirada/transferência de capital,
 * nunca receita/despesa) e mantém o dinheiro atribuído a uma conta — por isso o
 * farol de integridade (Check 1 e Check 2) não muda. Ver `books-health.ts`.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type BeneficiaryApplied = {
  beneficiaryId: string;
  name: string;
  applied: number;
};

/** Saldo aplicado de cada beneficiário numa conta Aplicação (só > 0). */
export async function appliedByBeneficiary(accountId: string): Promise<BeneficiaryApplied[]> {
  const grouped = await prisma.investmentAllocation.groupBy({
    by: ["beneficiaryId"],
    where: { accountId },
    _sum: { amount: true },
  });
  const ids = grouped.map((g) => g.beneficiaryId);
  const names = ids.length
    ? await prisma.capitalBeneficiary.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  return grouped
    .map((g) => ({
      beneficiaryId: g.beneficiaryId,
      name: nameById.get(g.beneficiaryId) ?? "—",
      applied: round2(g._sum.amount ?? 0),
    }))
    .filter((b) => Math.abs(b.applied) > 0.005)
    .sort((a, b) => b.applied - a.applied);
}

/** Total aplicado numa conta (soma de todas as alocações). */
export async function totalApplied(accountId: string): Promise<number> {
  const agg = await prisma.investmentAllocation.aggregate({
    where: { accountId },
    _sum: { amount: true },
  });
  return round2(agg._sum.amount ?? 0);
}

/** Saldo aplicado de UM beneficiário numa conta específica. */
export async function appliedOf(accountId: string, beneficiaryId: string): Promise<number> {
  const agg = await prisma.investmentAllocation.aggregate({
    where: { accountId, beneficiaryId },
    _sum: { amount: true },
  });
  return round2(agg._sum.amount ?? 0);
}

/** Total aplicado de um beneficiário somando TODAS as contas Aplicação. */
export async function appliedTotalOf(beneficiaryId: string): Promise<number> {
  const agg = await prisma.investmentAllocation.aggregate({
    where: { beneficiaryId },
    _sum: { amount: true },
  });
  return round2(agg._sum.amount ?? 0);
}

/** Capital total do sócio (aportes − retiradas). Pró-labore é despesa, não conta. */
export async function capitalBalanceOf(beneficiaryId: string): Promise<number> {
  const tx = await prisma.capitalTransaction.findMany({
    where: { beneficiaryId, kind: { in: ["APORTE", "RETIRADA"] } },
    select: { kind: true, amount: true },
  });
  const total = tx.reduce((s, t) => s + (t.kind === "APORTE" ? t.amount : -t.amount), 0);
  return round2(total);
}

/** Capital LIVRE = capital total − aplicado (o que o sócio pode sacar/aplicar). */
export async function freeCapitalOf(beneficiaryId: string): Promise<number> {
  const [capital, applied] = await Promise.all([
    capitalBalanceOf(beneficiaryId),
    appliedTotalOf(beneficiaryId),
  ]);
  return round2(capital - applied);
}

export type CapitalStatus = { capital: number; applied: number; free: number };

/**
 * Status do capital de TODOS os beneficiários de uma vez (sem N+1): capital
 * total (aportes − retiradas), aplicado (Σ alocações) e livre (capital −
 * aplicado). Usado para avisar, no movimento de caixa, quando um saque de um
 * sócio passa do capital livre dele (parte está aplicada).
 */
export async function capitalStatusByBeneficiary(): Promise<Map<string, CapitalStatus>> {
  const [tx, alloc] = await Promise.all([
    prisma.capitalTransaction.groupBy({
      by: ["beneficiaryId", "kind"],
      where: { kind: { in: ["APORTE", "RETIRADA"] } },
      _sum: { amount: true },
    }),
    prisma.investmentAllocation.groupBy({ by: ["beneficiaryId"], _sum: { amount: true } }),
  ]);
  const capitalById = new Map<string, number>();
  for (const t of tx) {
    const cur = capitalById.get(t.beneficiaryId) ?? 0;
    const v = t._sum.amount ?? 0;
    capitalById.set(t.beneficiaryId, cur + (t.kind === "APORTE" ? v : -v));
  }
  const appliedById = new Map(alloc.map((a) => [a.beneficiaryId, a._sum.amount ?? 0]));
  const ids = new Set([...capitalById.keys(), ...appliedById.keys()]);
  const out = new Map<string, CapitalStatus>();
  for (const id of ids) {
    const capital = round2(capitalById.get(id) ?? 0);
    const applied = round2(appliedById.get(id) ?? 0);
    out.set(id, { capital, applied, free: round2(capital - applied) });
  }
  return out;
}

export type Reconciliation = { balance: number; allocated: number; diff: number; ok: boolean };

/** Confere o invariante: saldo da conta == soma das alocações. */
export async function reconcileInvestmentAccount(accountId: string): Promise<Reconciliation> {
  const { getAccountsWithBalances } = await import("@/lib/accounts");
  const [accounts, allocated] = await Promise.all([
    getAccountsWithBalances(),
    totalApplied(accountId),
  ]);
  const balance = round2(accounts.find((a) => a.id === accountId)?.balance ?? 0);
  const diff = round2(balance - allocated);
  return { balance, allocated, diff, ok: Math.abs(diff) <= 0.01 };
}

// ---------------------------------------------------------------------------
// Operações (cada uma numa transação; mantêm o invariante por construção).
// ---------------------------------------------------------------------------

async function assertIsInvestment(tx: typeof prisma, accountId: string) {
  const acc = await tx.financialAccount.findUnique({
    where: { id: accountId },
    select: { id: true, isInvestment: true },
  });
  if (!acc || !acc.isInvestment) throw new Error("Conta de aplicação inválida.");
}

/**
 * Aplicar: o sócio passa a ter capital aplicado na conta.
 * - fonte "CAIXA": move dinheiro de uma conta comum para a Aplicação
 *   (transferência). O capital do sócio não muda, só vira aplicado. Exige que o
 *   sócio tenha capital livre suficiente.
 * - fonte "EXTERNO": aporte novo do sócio que entra direto na Aplicação
 *   (cria APORTE de capital + recebível na conta).
 */
export async function aplicar(input: {
  accountId: string;
  beneficiaryId: string;
  amount: number;
  date: Date;
  source: "CAIXA" | "EXTERNO";
  fromAccountId?: string; // obrigatório quando source = CAIXA
  description?: string | null;
}): Promise<void> {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("Informe um valor maior que zero.");

  const beneficiary = await prisma.capitalBeneficiary.findUniqueOrThrow({
    where: { id: input.beneficiaryId },
    select: { name: true },
  });

  if (input.source === "CAIXA") {
    const free = await freeCapitalOf(input.beneficiaryId);
    if (amount > free + 0.01) {
      throw new Error(
        `${beneficiary.name} tem apenas ${free.toFixed(2)} de capital livre para aplicar.`,
      );
    }
    if (!input.fromAccountId) throw new Error("Escolha a conta de origem do dinheiro.");
    if (input.fromAccountId === input.accountId)
      throw new Error("A origem e a conta de aplicação precisam ser diferentes.");
  }

  const capitalCenterId = await structuralCenterId("CAPITAL");

  await prisma.$transaction(async (tx) => {
    await assertIsInvestment(tx as unknown as typeof prisma, input.accountId);
    let transferId: string | null = null;
    let receivableId: string | null = null;

    if (input.source === "CAIXA") {
      const transfer = await tx.accountTransfer.create({
        data: {
          fromId: input.fromAccountId!,
          toId: input.accountId,
          amount,
          date: input.date,
          description: `Aplicação - ${beneficiary.name}`,
        },
      });
      transferId = transfer.id;
    } else {
      const receivable = await tx.receivable.create({
        data: {
          costCenterId: capitalCenterId,
          description: `Aporte aplicado - ${beneficiary.name}`,
          category: "OUTROS",
          amount,
          dueDate: input.date,
          receivedDate: input.date,
          status: "RECEBIDO",
          accountId: input.accountId,
          notes: input.description || null,
        },
      });
      receivableId = receivable.id;
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: input.beneficiaryId,
          kind: "APORTE",
          amount,
          date: input.date,
          description: `Aporte aplicado em conta de investimento`,
          receivableId,
        },
      });
    }

    await tx.investmentAllocation.create({
      data: {
        accountId: input.accountId,
        beneficiaryId: input.beneficiaryId,
        kind: "APLICAR",
        amount,
        date: input.date,
        description: input.description || null,
        transferId,
        receivableId,
      },
    });
  });
}

/**
 * Registrar rendimento (juros) da conta Aplicação. O rendimento é DOS SÓCIOS:
 * entra na conta e vira capital aplicado de cada um (não afeta o Lucro/Prejuízo).
 * `splits` divide o total do rendimento entre beneficiários.
 */
export async function registrarRendimento(input: {
  accountId: string;
  date: Date;
  splits: { beneficiaryId: string; amount: number }[];
  description?: string | null;
}): Promise<void> {
  const splits = input.splits
    .map((s) => ({ ...s, amount: round2(s.amount) }))
    .filter((s) => s.amount > 0);
  if (splits.length === 0) throw new Error("Informe ao menos um beneficiário com valor.");
  const total = round2(splits.reduce((s, x) => s + x.amount, 0));
  if (!(total > 0)) throw new Error("O rendimento precisa ser maior que zero.");

  const capitalCenterId = await structuralCenterId("CAPITAL");

  await prisma.$transaction(async (tx) => {
    await assertIsInvestment(tx as unknown as typeof prisma, input.accountId);
    // Uma entrada única de dinheiro na conta (o rendimento cheio).
    const receivable = await tx.receivable.create({
      data: {
        costCenterId: capitalCenterId,
        description: "Rendimento da aplicação",
        category: "OUTROS",
        amount: total,
        dueDate: input.date,
        receivedDate: input.date,
        status: "RECEBIDO",
        accountId: input.accountId,
        notes: input.description || null,
      },
    });
    // Cada sócio recebe sua parte como capital aplicado (APORTE + alocação).
    for (const s of splits) {
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: s.beneficiaryId,
          kind: "APORTE",
          amount: s.amount,
          date: input.date,
          description: "Rendimento da aplicação",
          receivableId: receivable.id,
        },
      });
      await tx.investmentAllocation.create({
        data: {
          accountId: input.accountId,
          beneficiaryId: s.beneficiaryId,
          kind: "RENDIMENTO",
          amount: s.amount,
          date: input.date,
          description: input.description || null,
          receivableId: receivable.id,
        },
      });
    }
  });
}

/**
 * Resgatar direto: o sócio tira capital aplicado saindo da PRÓPRIA conta
 * Aplicação (o dinheiro sai dessa conta). Reduz o capital do sócio.
 */
export async function resgatar(input: {
  accountId: string;
  beneficiaryId: string;
  amount: number;
  date: Date;
  description?: string | null;
}): Promise<void> {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("Informe um valor maior que zero.");

  const beneficiary = await prisma.capitalBeneficiary.findUniqueOrThrow({
    where: { id: input.beneficiaryId },
    select: { name: true },
  });
  const applied = await appliedOf(input.accountId, input.beneficiaryId);
  if (amount > applied + 0.01) {
    throw new Error(
      `${beneficiary.name} tem apenas ${applied.toFixed(2)} aplicado nesta conta.`,
    );
  }
  const capitalCenterId = await structuralCenterId("CAPITAL");

  await prisma.$transaction(async (tx) => {
    await assertIsInvestment(tx as unknown as typeof prisma, input.accountId);
    const payable = await tx.payable.create({
      data: {
        costCenterId: capitalCenterId,
        description: `Resgate da aplicação - ${beneficiary.name}`,
        category: "OUTROS",
        amount,
        dueDate: input.date,
        paymentDate: input.date,
        status: "PAGO",
        accountId: input.accountId,
        notes: input.description || null,
      },
    });
    await tx.capitalTransaction.create({
      data: {
        beneficiaryId: input.beneficiaryId,
        kind: "RETIRADA",
        amount,
        date: input.date,
        description: "Resgate da aplicação",
        payableId: payable.id,
      },
    });
    await tx.investmentAllocation.create({
      data: {
        accountId: input.accountId,
        beneficiaryId: input.beneficiaryId,
        kind: "RESGATAR",
        amount: -amount,
        date: input.date,
        description: input.description || null,
        payableId: payable.id,
      },
    });
  });
}

/**
 * Retirada com substituição: o sócio saca por OUTRA conta (ex.: Caixa), mas o
 * dinheiro dele está aplicado. Um substituto assume a fatia aplicada — o capital
 * livre do substituto vira aplicado. O saldo da Aplicação não muda.
 *
 * - Payable PAGO na conta escolhida + RETIRADA do sócio (capital −X).
 * - Alocação: −X (sócio) e +X (substituto), líquido zero na conta Aplicação.
 */
export async function retirarComSubstituicao(input: {
  accountId: string; // conta Aplicação onde está o dinheiro do sócio
  beneficiaryId: string; // quem saca
  substituteId: string; // quem assume a fatia aplicada
  amount: number;
  date: Date;
  payFromAccountId: string; // conta comum de onde sai o dinheiro
  description?: string | null;
}): Promise<void> {
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new Error("Informe um valor maior que zero.");
  if (input.substituteId === input.beneficiaryId)
    throw new Error("O substituto precisa ser outro beneficiário.");

  const [beneficiary, substitute] = await Promise.all([
    prisma.capitalBeneficiary.findUniqueOrThrow({
      where: { id: input.beneficiaryId },
      select: { name: true },
    }),
    prisma.capitalBeneficiary.findUniqueOrThrow({
      where: { id: input.substituteId },
      select: { name: true },
    }),
  ]);

  // O substituto assume só a fatia REALMENTE aplicada (não mais que o aplicado).
  // Se o saque passa do aplicado, o excedente deixa o capital do sócio negativo
  // (overdraw permitido) — o aplicado dele fica em 0, não negativo.
  const appliedFulano = await appliedOf(input.accountId, input.beneficiaryId);
  const swapAmount = round2(Math.min(amount, appliedFulano));
  const freeSubstitute = await freeCapitalOf(input.substituteId);
  if (swapAmount > freeSubstitute + 0.01) {
    throw new Error(
      `${substitute.name} tem apenas ${freeSubstitute.toFixed(2)} de capital livre para assumir a fatia de ${swapAmount.toFixed(2)}.`,
    );
  }
  const capitalCenterId = await structuralCenterId("CAPITAL");

  await prisma.$transaction(async (tx) => {
    await assertIsInvestment(tx as unknown as typeof prisma, input.accountId);
    const payable = await tx.payable.create({
      data: {
        costCenterId: capitalCenterId,
        description: `Retirada de capital - ${beneficiary.name}`,
        category: "OUTROS",
        amount,
        dueDate: input.date,
        paymentDate: input.date,
        status: "PAGO",
        accountId: input.payFromAccountId,
        notes: input.description || null,
      },
    });
    await tx.capitalTransaction.create({
      data: {
        beneficiaryId: input.beneficiaryId,
        kind: "RETIRADA",
        amount,
        date: input.date,
        description: `Retirada com substituição por ${substitute.name}`,
        payableId: payable.id,
      },
    });
    // Troca de dono da fatia aplicada (líquido zero na conta). Só a parte que
    // estava de fato aplicada muda de dono; o restante do saque é overdraw.
    if (swapAmount > 0) {
      await tx.investmentAllocation.create({
        data: {
          accountId: input.accountId,
          beneficiaryId: input.beneficiaryId,
          kind: "SUBSTITUICAO",
          amount: -swapAmount,
          date: input.date,
          description: `Fatia assumida por ${substitute.name}`,
          payableId: payable.id,
        },
      });
      await tx.investmentAllocation.create({
        data: {
          accountId: input.accountId,
          beneficiaryId: input.substituteId,
          kind: "SUBSTITUICAO",
          amount: swapAmount,
          date: input.date,
          description: `Assumiu a fatia de ${beneficiary.name}`,
          payableId: payable.id,
        },
      });
    }
  });
}
