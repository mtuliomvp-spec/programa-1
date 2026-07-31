"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import type { CategoriaKind } from "@prisma/client";

type Result = { ok: boolean; error?: string };

function revalidate() {
  revalidatePath("/financeiro/categorias");
  revalidatePath("/financeiro/a-pagar/novo");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/recorrentes/novo");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/recorrentes");
}

/** Cadastra uma nova categoria custom (sempre → OUTROS na lógica). */
export async function createCategoryAction(name: string, kind: CategoriaKind): Promise<Result> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const clean = (name || "").trim();
  if (!clean) return { ok: false, error: "Informe o nome da categoria." };
  if (kind !== "DESPESA" && kind !== "RECEITA") return { ok: false, error: "Tipo inválido." };

  const exists = await prisma.launchCategory.findFirst({
    where: { kind, name: { equals: clean, mode: "insensitive" } },
    select: { id: true },
  });
  if (exists) return { ok: false, error: "Já existe uma categoria com esse nome." };

  await prisma.launchCategory.create({ data: { name: clean, kind, system: false, code: null } });
  revalidate();
  return { ok: true };
}

/**
 * Renomeia a categoria e propaga o novo nome para TODOS os lançamentos que usam
 * o rótulo antigo (a pagar, a receber, recorrências) — sem tocar em valores.
 */
export async function renameCategoryAction(id: string, newName: string): Promise<Result> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const clean = (newName || "").trim();
  if (!clean) return { ok: false, error: "Informe o novo nome." };

  const cat = await prisma.launchCategory.findUnique({ where: { id } });
  if (!cat) return { ok: false, error: "Categoria não encontrada." };
  if (cat.name === clean) return { ok: true };

  const collision = await prisma.launchCategory.findFirst({
    where: { kind: cat.kind, name: { equals: clean, mode: "insensitive" }, id: { not: id } },
    select: { id: true },
  });
  if (collision) return { ok: false, error: "Já existe uma categoria com esse nome." };

  const oldName = cat.name;
  await prisma.$transaction(async (tx) => {
    await tx.launchCategory.update({ where: { id }, data: { name: clean } });
    if (cat.kind === "DESPESA") {
      await tx.payable.updateMany({ where: { categoryLabel: oldName }, data: { categoryLabel: clean } });
      await tx.recurringEntry.updateMany({
        where: { kind: "PAGAR", categoryLabel: oldName },
        data: { categoryLabel: clean },
      });
    } else {
      await tx.receivable.updateMany({ where: { categoryLabel: oldName }, data: { categoryLabel: clean } });
      await tx.recurringEntry.updateMany({
        where: { kind: "RECEBER", categoryLabel: oldName },
        data: { categoryLabel: clean },
      });
    }
  });
  revalidate();
  return { ok: true };
}

/** Exclui uma categoria custom. Categorias de sistema são protegidas. */
export async function deleteCategoryAction(id: string): Promise<Result> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const cat = await prisma.launchCategory.findUnique({ where: { id }, select: { system: true } });
  if (!cat) return { ok: false, error: "Categoria não encontrada." };
  if (cat.system) return { ok: false, error: "Categoria padrão do sistema — não pode ser excluída." };

  await prisma.launchCategory.delete({ where: { id } });
  revalidate();
  return { ok: true };
}
