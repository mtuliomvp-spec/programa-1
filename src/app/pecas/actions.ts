"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createPartWithPayable, addPartStockWithPayable, registerPartSale } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { parseDateInput } from "@/lib/format";

async function guard(): Promise<FormState | null> {
  try {
    await assertBooksBalanced();
    await assertCashboxOpen();
    return null;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
}

export type FormState = { error?: string };

const partSchema = z.object({
  code: z.string().min(1, "Informe o código"),
  name: z.string().min(1, "Informe o nome"),
  description: z.string().optional(),
  quantity: z.coerce.number().int().min(0).default(0),
  minQuantity: z.coerce.number().int().min(0).default(0),
  costPrice: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0),
  supplierId: z.string().optional(),
  alreadyPaid: z.coerce.boolean().optional(),
  dueDate: z.string().optional(),
});

export async function createPartAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = partSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const existing = await prisma.part.findUnique({ where: { code: d.code } });
  if (existing) return { error: "Já existe uma peça cadastrada com esse código." };

  let partId: string;
  try {
    const part = await createPartWithPayable({
      code: d.code,
      name: d.name,
      description: d.description || null,
      quantity: d.quantity,
      minQuantity: d.minQuantity,
      costPrice: d.costPrice,
      salePrice: d.salePrice,
      supplierId: d.supplierId || null,
      alreadyPaid: Boolean(d.alreadyPaid),
      dueDate: d.dueDate ? parseDateInput(d.dueDate) : null,
    });
    partId = part.id;
  } catch {
    return { error: "Não foi possível cadastrar a peça." };
  }

  revalidatePath("/pecas");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect(`/pecas/${partId}`);
}

const updateSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  minQuantity: z.coerce.number().int().min(0).default(0),
  costPrice: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0),
  supplierId: z.string().optional(),
});

export async function updatePartAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const existing = await prisma.part.findUnique({ where: { code: d.code } });
  if (existing && existing.id !== d.id) return { error: "Já existe outra peça cadastrada com esse código." };

  await prisma.part.update({
    where: { id: d.id },
    data: {
      code: d.code,
      name: d.name,
      description: d.description || null,
      minQuantity: d.minQuantity,
      costPrice: d.costPrice,
      salePrice: d.salePrice,
      supplierId: d.supplierId || null,
    },
  });
  revalidatePath("/pecas");
  revalidatePath(`/pecas/${d.id}`);
  redirect(`/pecas/${d.id}`);
}

const addStockSchema = z.object({
  partId: z.string().min(1),
  quantity: z.coerce.number().int().min(1, "Informe uma quantidade válida"),
  costPrice: z.coerce.number().min(0),
  supplierId: z.string().optional(),
  alreadyPaid: z.coerce.boolean().optional(),
  dueDate: z.string().optional(),
});

export async function addStockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = addStockSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  try {
    await addPartStockWithPayable({
      partId: d.partId,
      quantity: d.quantity,
      costPrice: d.costPrice,
      supplierId: d.supplierId || null,
      alreadyPaid: Boolean(d.alreadyPaid),
      dueDate: d.dueDate ? parseDateInput(d.dueDate) : null,
    });
  } catch {
    return { error: "Não foi possível registrar a entrada de estoque." };
  }

  revalidatePath("/pecas");
  revalidatePath(`/pecas/${d.partId}`);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect(`/pecas/${d.partId}`);
}

const sellSchema = z.object({
  partId: z.string().min(1),
  customerId: z.string().optional(),
  quantity: z.coerce.number().int().min(1, "Informe uma quantidade válida"),
  unitPrice: z.coerce.number().min(0),
  saleDate: z.string().min(1),
  paymentMethod: z.enum(["A_VISTA", "PARCELADO"]),
  installmentsCount: z.coerce.number().int().min(0).default(0),
  notes: z.string().optional(),
});

export async function sellPartAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = sellSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  let partId: string;
  try {
    const partSale = await registerPartSale({
      partId: d.partId,
      customerId: d.customerId || null,
      quantity: d.quantity,
      unitPrice: d.unitPrice,
      saleDate: parseDateInput(d.saleDate),
      paymentMethod: d.paymentMethod,
      installmentsCount: d.installmentsCount,
      notes: d.notes || null,
    });
    partId = partSale.partId;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível registrar a venda." };
  }

  revalidatePath("/pecas");
  revalidatePath(`/pecas/${partId}`);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/");
  redirect(`/pecas/${partId}`);
}

export async function deletePartAction(id: string) {
  const salesCount = await prisma.partSale.count({ where: { partId: id } });
  if (salesCount > 0) {
    throw new Error("Não é possível excluir uma peça com vendas registradas.");
  }
  await prisma.payable.deleteMany({ where: { partId: id } });
  await prisma.part.delete({ where: { id } });
  revalidatePath("/pecas");
  redirect("/pecas");
}
