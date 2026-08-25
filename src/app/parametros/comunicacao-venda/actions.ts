"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

const schema = z.object({
  sicoveFornecedor: z.string().optional(),
  sicoveComunicado: z.coerce.number().min(0).optional(),
  sicoveCancelamento: z.coerce.number().min(0).optional(),
  sicoveVencimentoDia: z.coerce.number().int().min(1).max(31).optional(),
});

export type SicoveFormState = { error?: string; success?: string };

/**
 * Configuração da cobrança da comunicação de venda. Sem fornecedor ou sem
 * valor, o lançamento automático fica desligado — anexar o comprovante só
 * guarda o documento, como antes.
 */
export async function saveSicoveAction(
  _prev: SicoveFormState,
  formData: FormData,
): Promise<SicoveFormState> {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) {
    return { error: "Apenas administradores podem alterar os parâmetros." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const d = parsed.data;

  const data = {
    sicoveFornecedor: d.sicoveFornecedor?.trim() || null,
    sicoveComunicado: d.sicoveComunicado && d.sicoveComunicado > 0 ? d.sicoveComunicado : null,
    sicoveCancelamento:
      d.sicoveCancelamento && d.sicoveCancelamento > 0 ? d.sicoveCancelamento : null,
    sicoveVencimentoDia: d.sicoveVencimentoDia || null,
  };

  const existing = await prisma.companySettings.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.companySettings.update({ where: { id: existing.id }, data });
  } else {
    await prisma.companySettings.create({ data });
  }

  revalidatePath("/parametros/comunicacao-venda");
  revalidatePath("/parametros");
  return { success: "Configuração salva." };
}
