"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { hasModuleAccess } from "@/lib/permissions";
import { assertCan } from "@/lib/guards";
import { createManualPayable } from "@/lib/finance";
import { formatRequestNumber, parseDateInput } from "@/lib/format";

export type ComprasFormState = { error?: string; success?: string };

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

async function requireCompras() {
  const user = await getSessionUser();
  if (!user || !hasModuleAccess(user, "compras")) throw new Error("Acesso negado");
  return user;
}

const createSchema = z.object({
  description: z.string().min(1, "Descreva o que precisa ser comprado"),
  details: z.string().optional(),
  estimatedAmount: z.coerce.number().min(0).optional(),
  dueDate: z.string().optional(),
  documentNumber: z.string().optional(),
  supplierId: z.string().optional(),
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
  vehicleId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
});

export async function createRequestAction(
  _prev: ComprasFormState,
  formData: FormData,
): Promise<ComprasFormState> {
  let user;
  try {
    user = await requireCompras();
    await assertCan("compras", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem acesso ao módulo de compras." };
  }
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  // Anexo opcional (foto, PDF, orçamento…): o Zod não valida File, então lemos
  // direto do formData e gravamos os bytes no próprio banco.
  const file = formData.get("file");
  let attachment:
    | { filename: string; mimeType: string; size: number; data: Uint8Array<ArrayBuffer> }
    | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_BYTES) return { error: "Arquivo muito grande (máximo 15 MB)." };
    const data = new Uint8Array(await file.arrayBuffer());
    attachment = {
      filename: file.name || "anexo",
      mimeType: file.type || "application/octet-stream",
      size: data.byteLength,
      data,
    };
  }

  // Numeração por ano: 0001/2026, reiniciando a cada ano.
  const year = new Date().getFullYear();
  await prisma.$transaction(async (tx) => {
    const last = await tx.purchaseRequest.aggregate({ where: { year }, _max: { seq: true } });
    const seq = (last._max.seq ?? 0) + 1;
    const flow = parsed.data.structuralKey || "ADMINISTRATIVO";
    const created = await tx.purchaseRequest.create({
      data: {
        description: parsed.data.description,
        details: parsed.data.details || null,
        estimatedAmount: parsed.data.estimatedAmount || null,
        dueDate: parsed.data.dueDate ? parseDateInput(parsed.data.dueDate) : null,
        documentNumber: parsed.data.documentNumber?.trim() || null,
        supplierId: parsed.data.supplierId || null,
        structuralKey: flow,
        // Guarda o destino conforme o fluxo escolhido (leva até a conta a pagar).
        vehicleId: flow === "VEICULOS" ? parsed.data.vehicleId || null : null,
        capitalBeneficiaryId: flow === "CAPITAL" ? parsed.data.capitalBeneficiaryId || null : null,
        requestedBy: user.name,
        year,
        seq,
      },
    });
    if (attachment) {
      await tx.purchaseRequestAttachment.create({
        data: { purchaseRequestId: created.id, description: "Anexo", ...attachment },
      });
    }
  });
  revalidatePath("/compras");
  return { success: "Solicitação registrada. Aguardando aprovação." };
}

export async function decideRequestAction(id: string, approve: boolean, notes?: string) {
  const user = await assertCan("compras", "aprovar");
  await prisma.purchaseRequest.update({
    where: { id, status: "PENDENTE" },
    data: {
      status: approve ? "APROVADA" : "REJEITADA",
      decidedBy: user.name,
      decidedAt: new Date(),
      decisionNotes: notes || null,
    },
  });
  revalidatePath("/compras");
}

export async function cancelRequestAction(id: string) {
  await requireCompras();
  await assertCan("compras", "criar");
  await prisma.purchaseRequest.update({
    where: { id, status: "PENDENTE" },
    data: { status: "CANCELADA" },
  });
  revalidatePath("/compras");
}

const concludeSchema = z.object({
  requestId: z.string().min(1),
  finalAmount: z.coerce.number().positive("Informe o valor pago/combinado"),
  category: z.enum(["COMPRA_PECA", "DESPESA_OPERACIONAL", "COMBUSTIVEL", "OUTROS"]),
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
  vehicleId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
  supplierId: z.string().optional(),
});

/** Marca a compra como concluída e lança a conta a pagar correspondente. */
export async function concludeRequestAction(
  _prev: ComprasFormState,
  formData: FormData,
): Promise<ComprasFormState> {
  try {
    await requireCompras();
    await assertCan("compras", "aprovar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem acesso ao módulo de compras." };
  }
  const parsed = concludeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const data = parsed.data;

  try {
    const request = await prisma.purchaseRequest.findUniqueOrThrow({
      where: { id: data.requestId },
    });
    if (request.status !== "APROVADA") throw new Error("Somente aprovadas podem ser concluídas");

    const flowKey = (data.structuralKey || request.structuralKey || "ADMINISTRATIVO") as
      | "CAPITAL"
      | "VEICULOS"
      | "ADMINISTRATIVO";
    // Destino do lançamento conforme o fluxo (o do formulário, ou o já guardado
    // na solicitação). No Capital o beneficiário é obrigatório.
    const vehicleId = flowKey === "VEICULOS" ? data.vehicleId || request.vehicleId || null : null;
    const capitalBeneficiaryId =
      flowKey === "CAPITAL" ? data.capitalBeneficiaryId || request.capitalBeneficiaryId || null : null;
    if (flowKey === "CAPITAL" && !capitalBeneficiaryId) {
      return { error: "Escolha o beneficiário do capital." };
    }

    // Usa o mesmo lançamento das contas manuais: cria a conta a pagar e, quando
    // há veículo, o custo do veículo; quando há beneficiário, a retirada de capital.
    const payable = await createManualPayable({
      description: `Compra ${formatRequestNumber(request.seq, request.year)}: ${request.description}`,
      category: data.category,
      documentNumber: request.documentNumber,
      amount: data.finalAmount,
      dueDate: request.dueDate ?? new Date(),
      // Fornecedor escolhido na conclusão (ou o sugerido na solicitação).
      supplierId: data.supplierId || request.supplierId,
      structuralKey: flowKey,
      vehicleId,
      capitalBeneficiaryId,
      notes: request.details,
      alreadyPaid: false,
    });

    await prisma.purchaseRequest.update({
      where: { id: request.id },
      data: { status: "CONCLUIDA", finalAmount: data.finalAmount, payableId: payable.id },
    });
  } catch {
    return { error: "Não foi possível concluir a solicitação." };
  }
  revalidatePath("/compras");
  revalidatePath("/financeiro/a-pagar");
  return { success: "Compra concluída e lançada no financeiro." };
}
