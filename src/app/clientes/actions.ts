"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import {
  duplicateError,
  findCustomerByIdentity,
  findSupplierByIdentity,
} from "@/lib/person-dedupe";
import { docKey } from "@/lib/person-keys";
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
  // Também exposta como endpoint (arquivo "use server"): protege por conta própria.
  await assertCan("cadastros", "criar");
  const name = d.name?.trim();
  if (!name) return;
  const document = d.document?.trim() || null;
  // Reaproveita em silêncio: isto é efeito colateral de salvar um cliente,
  // então nunca pode recusar nem interromper o cadastro principal.
  const existing = await findSupplierByIdentity(name, document);
  if (existing) return;
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
  // Trava contra duplicata: mesmo nome (ignorando acento/pontuação) ou mesmo
  // CPF/CNPJ já cadastrado.
  const dup = await findCustomerByIdentity(d.name, d.document);
  if (dup) return { error: duplicateError("cliente", dup) };
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
  // Trava contra duplicata, ignorando o próprio cadastro (salvar sem mudar o
  // nome não pode dar erro).
  const dup = await findCustomerByIdentity(d.name, d.document, d.id);
  if (dup) return { error: duplicateError("cliente", dup) };
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
  // Reaproveita o equivalente (mesmo nome ou mesmo CPF/CNPJ) em vez de recusar:
  // aqui a intenção é "me dê este cliente selecionado".
  const existing = await findCustomerByIdentity(name, document);
  // Mesmo nome, mas CPF/CNPJ diferente: são pessoas diferentes. Recusa em vez
  // de selecionar o cadastro errado sem o usuário perceber.
  const existingKey = docKey(existing?.document);
  const inputKey = docKey(document);
  if (existing && existingKey && inputKey && existingKey !== inputKey) {
    return {
      ok: false,
      error: `Já existe o cliente «${existing.name}» com outro CPF/CNPJ. Diferencie o nome (ex.: acrescente a cidade ou o sobrenome).`,
    };
  }
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
