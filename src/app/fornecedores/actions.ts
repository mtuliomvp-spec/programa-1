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
  // Dados bancários (para a Ordem de Pagamento).
  bankName: z.string().optional(),
  bankAgency: z.string().optional(),
  bankAccount: z.string().optional(),
  bankAccountType: z.string().optional(),
  pixKey: z.string().optional(),
  // Replica o mesmo cadastro como cliente (a mesma pessoa pode comprar e vender).
  alsoCustomer: z.coerce.boolean().optional(),
});

/** Campos bancários normalizados (string vazia → null) para gravar no banco. */
function bankData(d: z.infer<typeof schema>) {
  return {
    bankName: d.bankName?.trim() || null,
    bankAgency: d.bankAgency?.trim() || null,
    bankAccount: d.bankAccount?.trim() || null,
    bankAccountType: d.bankAccountType?.trim() || null,
    pixKey: d.pixKey?.trim() || null,
  };
}

/**
 * Cria um cliente equivalente (mesma pessoa), sem duplicar se o documento já
 * existir. Devolve o id do cliente (existente ou recém-criado) para quem
 * precisar selecioná-lo em seguida; `null` quando não há nome.
 */
export async function replicateAsCustomer(d: {
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}): Promise<{ id: string } | null> {
  // Também exposta como endpoint (arquivo "use server"): protege por conta própria.
  await assertCan("cadastros", "criar");
  const name = d.name?.trim();
  if (!name) return null;
  const document = d.document?.trim() || null;
  if (document) {
    const existing = await prisma.customer.findFirst({ where: { document } });
    if (existing) return { id: existing.id };
  }
  const created = await prisma.customer.create({
    data: {
      name,
      document,
      phone: d.phone?.trim() || null,
      email: d.email?.trim() || null,
      address: d.address?.trim() || null,
      notes: d.notes?.trim() || null,
    },
  });
  revalidatePath("/clientes");
  return { id: created.id };
}

export async function createSupplierAction(_prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  try {
    await assertCan("cadastros", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
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
      ...bankData(d),
    },
  });
  if (d.alsoCustomer) await replicateAsCustomer(d);
  revalidatePath("/fornecedores");
  redirect("/fornecedores");
}

const updateSchema = schema.extend({ id: z.string().min(1) });

export async function updateSupplierAction(_prev: PersonFormState, formData: FormData): Promise<PersonFormState> {
  try {
    await assertCan("cadastros", "editar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
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
      ...bankData(d),
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
  alsoCustomer?: boolean;
}): Promise<
  | { ok: true; id: string; name: string; existed: boolean; customerId?: string }
  | { ok: false; error: string }
> {
  try {
    await assertCan("cadastros", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Informe o nome do fornecedor." };

  const document = input.document?.trim() || null;
  let result: { id: string; name: string; existed: boolean };
  if (document) {
    const existing = await prisma.supplier.findFirst({ where: { document } });
    if (existing) result = { id: existing.id, name: existing.name, existed: true };
    else result = { existed: false, ...(await createSupplier()) };
  } else {
    result = { existed: false, ...(await createSupplier()) };
  }

  async function createSupplier() {
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
    return { id: supplier.id, name: supplier.name };
  }

  const customerId = input.alsoCustomer ? (await replicateAsCustomer(input))?.id : undefined;
  return { ok: true, ...result, customerId };
}

export async function deleteSupplierAction(id: string) {
  await assertCan("cadastros", "excluir");
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { userId: true } });
  if (supplier?.userId) {
    throw new Error("Este fornecedor é um usuário do sistema. Gerencie-o na tela de Usuários.");
  }
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
