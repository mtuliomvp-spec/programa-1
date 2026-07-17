"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import type { PersonFormState } from "@/components/PersonForm";

const schema = z.object({
  name: z.string().min(1, "Informe o nome"),
  document: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  // Replica o mesmo cadastro como fornecedor (a mesma pessoa pode vender p/ nós).
  alsoSupplier: z.coerce.boolean().optional(),
});

/** Cria um fornecedor equivalente (mesma pessoa), sem duplicar se o documento já existir. */
export async function replicateAsSupplier(d: {
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}) {
  const name = d.name?.trim();
  if (!name) return;
  const document = d.document?.trim() || null;
  if (document) {
    const existing = await prisma.supplier.findFirst({ where: { document } });
    if (existing) return;
  }
  await prisma.supplier.create({
    data: {
      name,
      document,
      phone: d.phone?.trim() || null,
      email: d.email?.trim() || null,
      address: d.address?.trim() || null,
      notes: d.notes?.trim() || null,
    },
  });
  revalidatePath("/fornecedores");
}

export async function createCustomerAction(_prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  try {
    await assertCan("cadastros", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
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
  if (d.alsoSupplier) await replicateAsSupplier(d);
  revalidatePath("/clientes");
  redirect("/clientes");
}

const updateSchema = schema.extend({ id: z.string().min(1) });

export async function updateCustomerAction(_prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  try {
    await assertCan("cadastros", "editar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
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
  await assertCan("cadastros", "excluir");
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
  alsoSupplier?: boolean;
}): Promise<{ ok: true; id: string; name: string; existed: boolean } | { ok: false; error: string }> {
  try {
    await assertCan("cadastros", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Informe o nome do cliente." };

  const document = input.document?.trim() || null;
  let result: { id: string; name: string; existed: boolean };
  const existing = document ? await prisma.customer.findFirst({ where: { document } }) : null;
  if (existing) {
    result = { id: existing.id, name: existing.name, existed: true };
  } else {
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
    result = { id: customer.id, name: customer.name, existed: false };
  }

  if (input.alsoSupplier) await replicateAsSupplier(input);
  return { ok: true, ...result };
}
