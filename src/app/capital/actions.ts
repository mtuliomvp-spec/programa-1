"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { structuralCenterId } from "@/lib/structural";
import { parseDateInput } from "@/lib/format";
import { getDefaultAccountId } from "@/lib/accounts";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
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

export async function deleteCapitalTransactionAction(id: string, beneficiaryId: string) {
  await assertCan("administrativo", "capital");
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.capitalTransaction.findUniqueOrThrow({ where: { id } });
    await tx.capitalTransaction.delete({ where: { id } });
    if (transaction.payableId) {
      await tx.payable.deleteMany({ where: { id: transaction.payableId } });
    }
    if (transaction.receivableId) {
      await tx.receivable.deleteMany({ where: { id: transaction.receivableId } });
    }
  });
  revalidatePath(`/capital/${beneficiaryId}`);
  revalidatePath("/capital");
  revalidatePath("/financeiro/livro-caixa");
}
