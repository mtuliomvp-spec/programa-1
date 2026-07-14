"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { PersonFormState } from "@/components/PersonForm";

const schema = z.object({
  name: z.string().min(1, "Informe o nome"),
  document: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export async function createCustomerAction(_prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  await prisma.customer.create({
    data: {
      name: d.name,
      document: d.document || null,
      phone: d.phone || null,
      email: d.email || null,
      address: d.address || null,
      notes: d.notes || null,
    },
  });
  revalidatePath("/clientes");
  redirect("/clientes");
}

const updateSchema = schema.extend({ id: z.string().min(1) });

export async function updateCustomerAction(_prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  await prisma.customer.update({
    where: { id: d.id },
    data: {
      name: d.name,
      document: d.document || null,
      phone: d.phone || null,
      email: d.email || null,
      address: d.address || null,
      notes: d.notes || null,
    },
  });
  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function deleteCustomerAction(id: string) {
  const salesCount = await prisma.sale.count({ where: { customerId: id } });
  if (salesCount > 0) {
    throw new Error("Não é possível excluir um cliente com vendas registradas.");
  }
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/clientes");
}

/** Cadastro rápido de cliente a partir de outra tela (ex.: sinal no caixa). */
export async function quickCreateCustomerAction(input: {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
}): Promise<{ ok: true; id: string; name: string; existed: boolean } | { ok: false; error: string }> {
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Informe o nome do cliente." };

  const document = input.document?.trim() || null;
  if (document) {
    const existing = await prisma.customer.findFirst({ where: { document } });
    if (existing) return { ok: true, id: existing.id, name: existing.name, existed: true };
  }

  const customer = await prisma.customer.create({
    data: {
      name,
      document,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
    },
  });
  revalidatePath("/clientes");
  return { ok: true, id: customer.id, name: customer.name, existed: false };
}
