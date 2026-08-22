"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { structuralCenterId } from "@/lib/structural";
import { parseDateInput } from "@/lib/format";
import { getDefaultAccountId, getNeutralAccountId } from "@/lib/accounts";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { markPayablePending, markReceivablePending } from "@/lib/finance";
import { assertCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import { linkBeneficiaryToUser, unlinkBeneficiary, renameLinkedPair } from "@/lib/capital-user-link";

const beneficiarySchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  proLabore: z.coerce.number().min(0).default(0),
  notes: z.string().optional(),
});

export type CapitalFormState = { error?: string };

export async function createBeneficiaryAction(
  _prev: CapitalFormState,
  formData: FormData,
): Promise<CapitalFormState> {
  try {
    await assertCan("administrativo", "capital");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = beneficiarySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const beneficiary = await prisma.capitalBeneficiary.create({
    data: {
      name: parsed.data.name,
      proLabore: parsed.data.proLabore,
      notes: parsed.data.notes || null,
    },
  });
  revalidatePath("/capital");
  redirect(`/capital/${beneficiary.id}`);
}

const transactionSchema = z.object({
  beneficiaryId: z.string().min(1),
  kind: z.enum(["APORTE", "RETIRADA", "PRO_LABORE"]),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  date: z.string().min(1),
  description: z.string().optional(),
});

export async function addCapitalTransactionAction(
  _prev: CapitalFormState,
  formData: FormData,
): Promise<CapitalFormState> {
  try {
    await assertCan("administrativo", "capital");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = transactionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const data = parsed.data;
  const date = parseDateInput(data.date);
  const accountId = await getDefaultAccountId();
  const capitalCenterId = await structuralCenterId("CAPITAL");

  try {
    await prisma.$transaction(async (tx) => {
      const beneficiary = await tx.capitalBeneficiary.findUniqueOrThrow({
        where: { id: data.beneficiaryId },
      });

      let payableId: string | null = null;
      let receivableId: string | null = null;

      if (data.kind === "APORTE") {
        const receivable = await tx.receivable.create({
          data: {
            costCenterId: capitalCenterId,
            description: `Aporte de capital - ${beneficiary.name}`,
            category: "OUTROS",
            amount: data.amount,
            dueDate: date,
            receivedDate: date,
            status: "RECEBIDO",
            accountId,
            notes: data.description || null,
          },
        });
        receivableId = receivable.id;
      } else {
        const payable = await tx.payable.create({
          data: {
            costCenterId: capitalCenterId,
            description:
              data.kind === "PRO_LABORE"
                ? `Pró-labore - ${beneficiary.name}`
                : `Retirada de capital - ${beneficiary.name}`,
            category: data.kind === "PRO_LABORE" ? "SALARIO" : "OUTROS",
            amount: data.amount,
            dueDate: date,
            paymentDate: date,
            status: "PAGO",
            accountId,
            notes: data.description || null,
          },
        });
        payableId = payable.id;
      }

      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: data.beneficiaryId,
          kind: data.kind,
          amount: data.amount,
          date,
          description: data.description || null,
          payableId,
          receivableId,
        },
      });
    });
  } catch {
    return { error: "Não foi possível registrar a movimentação." };
  }
  revalidatePath(`/capital/${data.beneficiaryId}`);
  revalidatePath("/capital");
  revalidatePath("/financeiro/livro-caixa");
  return {};
}

/** Edita o nome do beneficiário (sincroniza com o usuário vinculado, se houver). */
export async function renameBeneficiaryAction(
  beneficiaryId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("administrativo", "capital");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const clean = (name || "").trim();
  if (!clean) return { ok: false, error: "Informe o nome." };
  const beneficiary = await prisma.capitalBeneficiary.findUnique({
    where: { id: beneficiaryId },
    select: { isCompany: true },
  });
  if (!beneficiary) return { ok: false, error: "Beneficiário não encontrado." };
  if (beneficiary.isCompany) {
    return { ok: false, error: "O nome da empresa é definido nos Parâmetros da empresa." };
  }
  await renameLinkedPair({ beneficiaryId }, clean);
  revalidatePath(`/capital/${beneficiaryId}`);
  revalidatePath("/capital");
  revalidatePath("/usuarios");
  return { ok: true };
}

/** Vincula/desvincula o beneficiário a um usuário do sistema (somente admin). */
export async function linkBeneficiaryUserAction(
  beneficiaryId: string,
  userId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const actor = await getSessionUser();
  if (!actor || actor.role !== "ADMIN") {
    return { ok: false, error: "Apenas administradores podem vincular usuários." };
  }
  const beneficiary = await prisma.capitalBeneficiary.findUnique({
    where: { id: beneficiaryId },
    select: { isCompany: true },
  });
  if (!beneficiary) return { ok: false, error: "Beneficiário não encontrado." };
  if (beneficiary.isCompany) {
    return { ok: false, error: "O beneficiário da empresa não pode ser vinculado a um usuário." };
  }
  try {
    if (userId) await linkBeneficiaryToUser(beneficiaryId, userId);
    else await unlinkBeneficiary(beneficiaryId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível vincular." };
  }
  revalidatePath(`/capital/${beneficiaryId}`);
  revalidatePath("/capital");
  revalidatePath("/usuarios");
  return { ok: true };
}

/**
 * Atrela (ou desatrela) um beneficiário a um "responsável" (outro beneficiário).
 * Apenas agrupamento visual (ex.: cauções): não mexe em nenhum valor. Um nível
 * só — o responsável precisa ser top-level e o vinculado não pode ter filhos.
 */
export async function setBeneficiaryParentAction(
  beneficiaryId: string,
  parentId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("administrativo", "capital");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const target = await prisma.capitalBeneficiary.findUnique({
    where: { id: beneficiaryId },
    select: { id: true, isCompany: true, _count: { select: { children: true } } },
  });
  if (!target) return { ok: false, error: "Beneficiário não encontrado." };
  if (target.isCompany) return { ok: false, error: "A empresa não pode ser vinculada." };

  if (parentId) {
    if (parentId === beneficiaryId) return { ok: false, error: "Um beneficiário não pode ser responsável por si mesmo." };
    if (target._count.children > 0) {
      return { ok: false, error: "Este beneficiário já é responsável por outros — não pode virar vinculado." };
    }
    const parent = await prisma.capitalBeneficiary.findUnique({
      where: { id: parentId },
      select: { id: true, isCompany: true, parentId: true },
    });
    if (!parent) return { ok: false, error: "Responsável não encontrado." };
    if (parent.isCompany) return { ok: false, error: "A empresa não pode ser responsável." };
    if (parent.parentId) return { ok: false, error: "O responsável já está vinculado a outro — escolha um responsável de topo." };
  }

  await prisma.capitalBeneficiary.update({ where: { id: beneficiaryId }, data: { parentId: parentId || null } });
  revalidatePath("/capital");
  revalidatePath(`/capital/${beneficiaryId}`);
  if (parentId) revalidatePath(`/capital/${parentId}`);
  return { ok: true };
}

/** Edita o valor do pró-labore combinado do beneficiário (R$/mês). */
export async function setProLaboreAction(
  beneficiaryId: string,
  proLabore: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("administrativo", "capital");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!Number.isFinite(proLabore) || proLabore < 0) {
    return { ok: false, error: "Informe um valor válido (0 ou maior)." };
  }
  await prisma.capitalBeneficiary.update({
    where: { id: beneficiaryId },
    data: { proLabore: Math.round(proLabore * 100) / 100 },
  });
  revalidatePath(`/capital/${beneficiaryId}`);
  revalidatePath("/capital");
  revalidatePath("/financeiro/fechamento");
  return { ok: true };
}

/** Liga/desliga a participação do beneficiário na rotina do fechamento mensal. */
export async function toggleIncludeClosingAction(
  beneficiaryId: string,
  include: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("administrativo", "capital");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  await prisma.capitalBeneficiary.update({
    where: { id: beneficiaryId },
    data: { includeInMonthlyClosing: include },
  });
  revalidatePath(`/capital/${beneficiaryId}`);
  revalidatePath("/capital");
  revalidatePath("/financeiro/fechamento");
  return { ok: true };
}

/**
 * Retirada com substituição: o sócio saca por outra conta, mas o dinheiro dele
 * está aplicado numa conta Aplicação; um substituto assume a fatia aplicada.
 */
export async function withdrawWithSubstituteAction(
  _prev: CapitalFormState,
  formData: FormData,
): Promise<CapitalFormState> {
  const date = parseDateInput(String(formData.get("date") || ""));
  try {
    await assertCan("administrativo", "capital");
    await assertBooksBalanced();
    await assertCashboxOpen();
    const { assertMonthOpen } = await import("@/lib/monthly-closing");
    await assertMonthOpen(date);
    const { retirarComSubstituicao } = await import("@/lib/investments");
    await retirarComSubstituicao({
      accountId: String(formData.get("accountId") || ""),
      beneficiaryId: String(formData.get("beneficiaryId") || ""),
      substituteId: String(formData.get("substituteId") || ""),
      amount: Number(formData.get("amount") || 0),
      date,
      payFromAccountId: String(formData.get("payFromAccountId") || ""),
      description: String(formData.get("description") || "") || null,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível registrar a retirada." };
  }
  revalidatePath(`/capital/${String(formData.get("beneficiaryId") || "")}`);
  revalidatePath("/capital");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  return {};
}

export type ContabilizarResult = { ok: boolean; error?: string; message?: string };

/**
 * "Contabilizar" o saldo do sócio: zera o capital contra o fluxo
 * ADMINISTRATIVO, sem mover dinheiro real (par no Banco Neutro):
 *  - saldo NEGATIVO (devedor): APORTE no sócio do valor devido + DESPESA
 *    administrativa paga do mesmo valor — a loja absorve o saldo devedor.
 *  - saldo POSITIVO (credor): RETIRADA do sócio + RECEITA administrativa —
 *    o saldo credor é transferido ao resultado da loja.
 * Farol: no devedor o capital sobe X e a despesa derruba o L/P em X; no
 * credor o capital cai X e a receita sobe o L/P em X — equação e L/P andam
 * juntos, e o Banco Neutro fecha em zero (um pagável + um recebível iguais).
 */
export async function contabilizarCapitalAction(beneficiaryId: string): Promise<ContabilizarResult> {
  try {
    await assertCan("administrativo", "capital");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const { getCashboxWorkDate } = await import("@/lib/cashbox");
  const date = await getCashboxWorkDate();
  try {
    const { assertMonthOpen } = await import("@/lib/monthly-closing");
    await assertMonthOpen(date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mês fechado." };
  }

  const beneficiary = await prisma.capitalBeneficiary.findUnique({
    where: { id: beneficiaryId },
    select: { name: true, active: true },
  });
  if (!beneficiary) return { ok: false, error: "Sócio não encontrado." };

  const txs = await prisma.capitalTransaction.findMany({
    where: { beneficiaryId },
    select: { kind: true, amount: true },
  });
  const sum = (k: string) => txs.filter((t) => t.kind === k).reduce((s, t) => s + t.amount, 0);
  const saldo = Math.round((sum("APORTE") - sum("RETIRADA")) * 100) / 100;
  if (Math.abs(saldo) < 0.01) return { ok: false, error: "O saldo deste sócio já está zerado." };

  const [neutro, capitalCenter, adminCenter] = await Promise.all([
    getNeutralAccountId(),
    structuralCenterId("CAPITAL"),
    structuralCenterId("ADMINISTRATIVO"),
  ]);
  const valor = Math.abs(saldo);

  if (saldo < 0) {
    // Devedor: aporte no sócio + despesa administrativa (loja absorve).
    await prisma.$transaction(async (tx) => {
      const receivable = await tx.receivable.create({
        data: {
          costCenterId: capitalCenter,
          description: `Contabilização de capital — cobertura do saldo devedor de ${beneficiary.name}`,
          category: "OUTROS",
          amount: valor,
          dueDate: date,
          receivedDate: date,
          status: "RECEBIDO",
          accountId: neutro,
          capitalBeneficiaryId: beneficiaryId,
        },
      });
      // Vínculo na movimentação: exclui o aporte das "Outras receitas" do L/P
      // e permite o estorno completo pela tela de movimentações.
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId,
          kind: "APORTE",
          amount: valor,
          date,
          description: "Contabilização — saldo devedor absorvido pela loja",
          receivableId: receivable.id,
        },
      });
      await tx.payable.create({
        data: {
          costCenterId: adminCenter,
          description: `Contabilização de capital — saldo devedor de ${beneficiary.name} absorvido pela loja`,
          category: "OUTROS",
          categoryLabel: "Acerto de capital",
          amount: valor,
          dueDate: date,
          paymentDate: date,
          status: "PAGO",
          accountId: neutro,
        },
      });
    });
  } else {
    // Credor: retirada do sócio + receita administrativa (vai ao resultado).
    await prisma.$transaction(async (tx) => {
      const payable = await tx.payable.create({
        data: {
          costCenterId: capitalCenter,
          description: `Contabilização de capital — zeragem do saldo credor de ${beneficiary.name}`,
          category: "OUTROS",
          amount: valor,
          dueDate: date,
          paymentDate: date,
          status: "PAGO",
          accountId: neutro,
          capitalBeneficiaryId: beneficiaryId,
        },
      });
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId,
          kind: "RETIRADA",
          amount: valor,
          date,
          description: "Contabilização — saldo credor transferido à loja",
          payableId: payable.id,
        },
      });
      await tx.receivable.create({
        data: {
          costCenterId: adminCenter,
          description: `Contabilização de capital — saldo credor de ${beneficiary.name} transferido à loja`,
          category: "OUTROS",
          categoryLabel: "Acerto de capital",
          amount: valor,
          dueDate: date,
          receivedDate: date,
          status: "RECEBIDO",
          accountId: neutro,
        },
      });
    });
  }

  revalidatePath("/capital");
  revalidatePath(`/capital/${beneficiaryId}`);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/lucro-prejuizo");
  revalidatePath("/");
  return {
    ok: true,
    message:
      saldo < 0
        ? `Saldo devedor de ${beneficiary.name} zerado: a loja absorveu o valor como despesa (Acerto de capital), sem movimentar dinheiro.`
        : `Saldo credor de ${beneficiary.name} zerado: o valor foi transferido ao resultado da loja como receita (Acerto de capital), sem movimentar dinheiro.`,
  };
}

export async function deleteCapitalTransactionAction(id: string, beneficiaryId: string) {
  await assertCan("administrativo", "capital");

  const transaction = await prisma.capitalTransaction.findUniqueOrThrow({
    where: { id },
    select: { id: true, payableId: true, receivableId: true },
  });

  // Movimento DERIVADO de um título real do fluxo Capital — título lançado em
  // Contas a pagar/receber com beneficiário do capital e pago/recebido (inclusive
  // via conciliação bancária): NÃO apagar o título, senão ele some do sistema.
  // Reverte a baixa (markPayable/ReceivablePending) → o título volta a PENDENTE
  // em Contas a pagar/receber e o próprio sync remove este movimento de capital.
  // Só APAGA o título quando ele nasceu junto com o movimento (retirada / aporte
  // / pró-labore lançados direto no Capital, sem beneficiário no próprio título).
  if (transaction.payableId) {
    const pay = await prisma.payable.findUnique({
      where: { id: transaction.payableId },
      select: { capitalBeneficiaryId: true },
    });
    if (pay?.capitalBeneficiaryId) {
      await markPayablePending(transaction.payableId);
      // Limpa a marca de conciliação para o título reabrir "limpo" (pendente e
      // não conciliado), pronto para ser casado de novo no extrato.
      await prisma.payable.update({
        where: { id: transaction.payableId },
        data: { reconciledAt: null, bankRef: null },
      });
    } else {
      await prisma.$transaction([
        prisma.capitalTransaction.delete({ where: { id } }),
        prisma.payable.deleteMany({ where: { id: transaction.payableId } }),
      ]);
    }
  } else if (transaction.receivableId) {
    const rec = await prisma.receivable.findUnique({
      where: { id: transaction.receivableId },
      select: { capitalBeneficiaryId: true },
    });
    if (rec?.capitalBeneficiaryId) {
      await markReceivablePending(transaction.receivableId);
      await prisma.receivable.update({
        where: { id: transaction.receivableId },
        data: { reconciledAt: null, bankRef: null },
      });
    } else {
      await prisma.$transaction([
        prisma.capitalTransaction.delete({ where: { id } }),
        prisma.receivable.deleteMany({ where: { id: transaction.receivableId } }),
      ]);
    }
  } else {
    await prisma.capitalTransaction.delete({ where: { id } });
  }

  revalidatePath(`/capital/${beneficiaryId}`);
  revalidatePath("/capital");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/conciliacao");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
}
