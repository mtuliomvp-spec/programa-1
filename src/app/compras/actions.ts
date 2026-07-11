"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { hasModuleAccess } from "@/lib/permissions";
import { getDefaultAccountId } from "@/lib/accounts";

export type ComprasFormState = { error?: string; success?: string };

async function requireCompras() {
  const user = await getSessionUser();
  if (!user || !hasModuleAccess(user, "compras")) throw new Error("Acesso negado");
  return user;
}

const createSchema = z.object({
  description: z.string().min(1, "Descreva o que precisa ser comprado"),
  details: z.string().optional(),
  estimatedAmount: z.coerce.number().min(0).optional(),
  supplierId: z.string().optional(),
});

export async function createRequestAction(
  _prev: ComprasFormState,
  formData: FormData,
): Promise<ComprasFormState> {
  let user;
  try {
    user = await requireCompras();
  } catch {
    return { error: "Sem acesso ao módulo de compras." };
  }
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  await prisma.purchaseRequest.create({
    data: {
      description: parsed.data.description,
      details: parsed.data.details || null,
      estimatedAmount: parsed.data.estimatedAmount || null,
      supplierId: parsed.data.supplierId || null,
      requestedBy: user.name,
    },
  });
  revalidatePath("/compras");
  return { success: "Solicitação registrada. Aguardando aprovação." };
}

export async function decideRequestAction(id: string, approve: boolean, notes?: string) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") throw new Error("Apenas administradores aprovam compras.");
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
  alreadyPaid: z.coerce.boolean().optional(),
});

/** Marca a compra como concluída e lança a conta a pagar correspondente. */
export async function concludeRequestAction(
  _prev: ComprasFormState,
  formData: FormData,
): Promise<ComprasFormState> {
  try {
    await requireCompras();
  } catch {
    return { error: "Sem acesso ao módulo de compras." };
  }
  const parsed = concludeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const request = await tx.purchaseRequest.findUniqueOrThrow({
        where: { id: data.requestId },
      });
      if (request.status !== "APROVADA") throw new Error("Somente aprovadas podem ser concluídas");

      const now = new Date();
      const paid = Boolean(data.alreadyPaid);
      const accountId = paid ? await getDefaultAccountId() : null;
      const payable = await tx.payable.create({
        data: {
          description: `Compra #${request.number}: ${request.description}`,
          category: data.category,
          amount: data.finalAmount,
          dueDate: now,
          paymentDate: paid ? now : null,
          status: paid ? "PAGO" : "PENDENTE",
          supplierId: request.supplierId,
          accountId,
          notes: request.details,
        },
      });

      await tx.purchaseRequest.update({
        where: { id: request.id },
        data: { status: "CONCLUIDA", finalAmount: data.finalAmount, payableId: payable.id },
      });
    });
  } catch {
    return { error: "Não foi possível concluir a solicitação." };
  }
  revalidatePath("/compras");
  revalidatePath("/financeiro/a-pagar");
  return { success: "Compra concluída e lançada no financeiro." };
}
