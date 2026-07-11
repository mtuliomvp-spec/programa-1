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

export async function createSupplierAction(_prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  await prisma.supplier.create({
    data: {
      name: d.name,
      document: d.document || null,
      phone: d.phone || null,
      email: d.email || null,
      address: d.address || null,
      notes: d.notes || null,
    },
  });
  revalidatePath("/fornecedores");
  redirect("/fornecedores");
}

const updateSchema = schema.extend({ id: z.string().min(1) });

export async function updateSupplierAction(_prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  await prisma.supplier.update({
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
  revalidatePath("/fornecedores");
  redirect("/fornecedores");
}

/**
 * Cadastro rápido usado dentro do formulário de veículo: cria o fornecedor
 * e devolve id/nome para já deixá-lo selecionado. Se o CPF/CNPJ informado
 * já existir, reaproveita o cadastro em vez de duplicar.
 */
export async function quickCreateSupplierAction(input: {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
}): Promise<{ ok: true; id: string; name: string; existed: boolean } | { ok: false; error: string }> {
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Informe o nome do fornecedor." };

  const document = input.document?.trim() || null;
  if (document) {
    const existing = await prisma.supplier.findFirst({ where: { document } });
    if (existing) return { ok: true, id: existing.id, name: existing.name, existed: true };
  }

  const supplier = await prisma.supplier.create({
    data: {
      name,
      document,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
    },
  });
  revalidatePath("/fornecedores");
  return { ok: true, id: supplier.id, name: supplier.name, existed: false };
}

export async function deleteSupplierAction(id: string) {
  const [vehicleCount, partCount] = await Promise.all([
    prisma.vehicle.count({ where: { supplierId: id } }),
    prisma.part.count({ where: { supplierId: id } }),
  ]);
  if (vehicleCount > 0 || partCount > 0) {
    throw new Error("Não é possível excluir um fornecedor com veículos ou peças vinculados.");
  }
  await prisma.supplier.delete({ where: { id } });
  revalidatePath("/fornecedores");
}
