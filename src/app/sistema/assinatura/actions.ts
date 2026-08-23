"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { parseDateInput } from "@/lib/format";
import { getSubscription, SUBSCRIPTION_ID, SUBSCRIPTION_STATUS } from "@/lib/subscription";

export type SubscriptionFormState = { error?: string; success?: string };

/** Tela do dono da empresa: só administrador mexe no contrato do sistema. */
async function assertAdmin() {
  const user = await getSessionUser();
  if (!user) throw new Error("Sessão expirada. Faça login novamente.");
  if (user.role !== "ADMIN") throw new Error("Apenas o administrador acessa a assinatura.");
  return user;
}

const MAX_ANEXO = 10 * 1024 * 1024; // 10 MB

const contratoSchema = z.object({
  status: z.string().min(1),
  planName: z.string().min(1, "Informe o nome do plano"),
  monthlyAmount: z.coerce.number().min(0, "Valor inválido"),
  dueDay: z.coerce.number().int().min(1).max(31),
  nextChargeAt: z.string().optional(),
  startedAt: z.string().optional(),
  notes: z.string().optional(),
  providerName: z.string().optional(),
  providerDocument: z.string().optional(),
  providerAddress: z.string().optional(),
  providerEmail: z.string().optional(),
  providerPhone: z.string().optional(),
});

export async function saveSubscriptionAction(
  _prev: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = contratoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  if (!(d.status in SUBSCRIPTION_STATUS)) return { error: "Situação inválida." };

  await getSubscription();
  await prisma.subscription.update({
    where: { id: SUBSCRIPTION_ID },
    data: {
      status: d.status,
      planName: d.planName.trim(),
      monthlyAmount: d.monthlyAmount,
      dueDay: d.dueDay,
      nextChargeAt: d.nextChargeAt ? parseDateInput(d.nextChargeAt) : null,
      startedAt: d.startedAt ? parseDateInput(d.startedAt) : null,
      notes: d.notes?.trim() || null,
      providerName: d.providerName?.trim() || null,
      providerDocument: d.providerDocument?.trim() || null,
      providerAddress: d.providerAddress?.trim() || null,
      providerEmail: d.providerEmail?.trim() || null,
      providerPhone: d.providerPhone?.trim() || null,
    },
  });
  revalidatePath("/sistema/assinatura");
  revalidatePath("/sistema/assinatura/contrato");
  return { success: "Contrato atualizado." };
}

const pagamentoSchema = z.object({
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Informe a competência (mês/ano)"),
  paidAt: z.string().min(1, "Informe a data do pagamento"),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  method: z.string().optional(),
  notes: z.string().optional(),
});

/** Lança uma mensalidade paga, com o comprovante guardado na plataforma. */
export async function registerSubscriptionPaymentAction(
  _prev: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = pagamentoSchema.safeParse({
    competencia: formData.get("competencia"),
    paidAt: formData.get("paidAt"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  let proof: { filename: string; mimeType: string; size: number; data: Buffer } | null = null;
  const file = formData.get("proof");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ANEXO) return { error: "O comprovante passa de 10 MB." };
    proof = {
      filename: file.name || "comprovante",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
    };
  }

  const sub = await getSubscription();
  await prisma.subscriptionPayment.create({
    data: {
      subscriptionId: sub.id,
      competencia: d.competencia,
      paidAt: parseDateInput(d.paidAt),
      amount: d.amount,
      method: d.method?.trim() || null,
      notes: d.notes?.trim() || null,
      proofFilename: proof?.filename ?? null,
      proofMimeType: proof?.mimeType ?? null,
      proofSize: proof?.size ?? null,
      proofData: proof ? new Uint8Array(proof.data) : null,
    },
  });

  revalidatePath("/sistema/assinatura");
  return { success: "Pagamento registrado." };
}

export async function deleteSubscriptionPaymentAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  await prisma.subscriptionPayment.delete({ where: { id } });
  revalidatePath("/sistema/assinatura");
  return { ok: true };
}

/** Guarda a via assinada do contrato dentro do sistema. */
export async function uploadSignedContractAction(
  _prev: SubscriptionFormState,
  formData: FormData,
): Promise<SubscriptionFormState> {
  try {
    await assertAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo do contrato assinado." };
  if (file.size > MAX_ANEXO) return { error: "O arquivo passa de 10 MB." };

  const signedAt = (formData.get("signedAt") as string) || "";
  const notes = ((formData.get("notes") as string) || "").trim();

  const sub = await getSubscription();
  await prisma.subscriptionContract.create({
    data: {
      subscriptionId: sub.id,
      signedAt: signedAt ? parseDateInput(signedAt) : null,
      notes: notes || null,
      filename: file.name || "contrato-assinado",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      data: new Uint8Array(Buffer.from(await file.arrayBuffer())),
    },
  });

  revalidatePath("/sistema/assinatura");
  revalidatePath("/sistema/assinatura/contrato");
  return { success: "Contrato assinado anexado." };
}

export async function deleteSignedContractAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  await prisma.subscriptionContract.delete({ where: { id } });
  revalidatePath("/sistema/assinatura");
  revalidatePath("/sistema/assinatura/contrato");
  return { ok: true };
}
