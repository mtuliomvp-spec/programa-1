import "server-only";
import { prisma } from "@/lib/prisma";
import type { CategoriaPagar, CategoriaReceber, CategoriaKind } from "@prisma/client";

/**
 * Categorias de lançamento GERENCIÁVEIS (Financeiro › Categorias).
 *
 * O enum (`CategoriaPagar`/`CategoriaReceber`) continua sendo o "motor" da
 * lógica e dos relatórios. A categoria gerenciável é o RÓTULO de exibição
 * (`categoryLabel`) que mapeia para um enum via `code`; `code` null = custom,
 * que cai em `OUTROS`. Categorias `system` são as padrão protegidas (não podem
 * ser excluídas).
 */

export const CATEGORIA_PAGAR_LABEL: Record<CategoriaPagar, string> = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  DEVOLUCAO_CLIENTE: "Devolução ao cliente",
  OUTROS: "Outros",
};

export const CATEGORIA_RECEBER_LABEL: Record<CategoriaReceber, string> = {
  VENDA_VEICULO: "Venda de veículo",
  VENDA_PECA: "Venda de peças",
  RETORNO_FINANCEIRA: "Retorno de financiamento",
  OUTROS: "Outros",
};

/** Rótulo de exibição: usa o rótulo gerenciável, com fallback no enum. */
export function labelForPagar(label: string | null | undefined, category: CategoriaPagar): string {
  return (label && label.trim()) || CATEGORIA_PAGAR_LABEL[category];
}
export function labelForReceber(label: string | null | undefined, category: CategoriaReceber): string {
  return (label && label.trim()) || CATEGORIA_RECEBER_LABEL[category];
}

// Categorias padrão. `code` = enum mapeado; null = custom (→ OUTROS). São
// `system` (protegidas) quando têm code — exceto "Tráfego pago", que nasce como
// custom editável/excluível.
const DESPESA_DEFAULTS: { name: string; code: CategoriaPagar | null }[] = [
  { name: "Despesa operacional", code: "DESPESA_OPERACIONAL" },
  { name: "Comissão", code: "COMISSAO" },
  { name: "Salário", code: "SALARIO" },
  { name: "Combustível", code: "COMBUSTIVEL" },
  { name: "Outros", code: "OUTROS" },
  { name: "Tráfego pago", code: null },
];
const RECEITA_DEFAULTS: { name: string; code: CategoriaReceber | null }[] = [
  { name: "Venda de veículo", code: "VENDA_VEICULO" },
  { name: "Venda de peças", code: "VENDA_PECA" },
  { name: "Retorno de financiamento", code: "RETORNO_FINANCEIRA" },
  { name: "Outros", code: "OUTROS" },
];

// Nº de categorias `system` esperadas (defaults com code). Usado para pular o
// seed quando já existe.
const EXPECTED_SYSTEM =
  DESPESA_DEFAULTS.filter((c) => c.code).length + RECEITA_DEFAULTS.filter((c) => c.code).length;

let ensured = false;

/** Garante as categorias padrão (idempotente). Barato quando já semeado. */
export async function ensureDefaultCategories(): Promise<void> {
  if (ensured) return;
  const count = await prisma.launchCategory.count({ where: { system: true } });
  if (count >= EXPECTED_SYSTEM) {
    ensured = true;
    return;
  }
  const all: { name: string; kind: CategoriaKind; code: string | null }[] = [
    ...DESPESA_DEFAULTS.map((c) => ({ name: c.name, kind: "DESPESA" as const, code: c.code })),
    ...RECEITA_DEFAULTS.map((c) => ({ name: c.name, kind: "RECEITA" as const, code: c.code })),
  ];
  for (const c of all) {
    const system = c.code != null;
    await prisma.launchCategory.upsert({
      where: { name_kind: { name: c.name, kind: c.kind } },
      update: { system, code: c.code },
      create: { name: c.name, kind: c.kind, system, code: c.code },
    });
  }
  ensured = true;
}

export type CategoryRow = { id: string; name: string; system: boolean; code: string | null };

/** Lista as categorias de um tipo (sistema primeiro, depois alfabética). */
export async function listCategories(kind: CategoriaKind): Promise<CategoryRow[]> {
  await ensureDefaultCategories();
  const rows = await prisma.launchCategory.findMany({
    where: { kind },
    orderBy: [{ system: "desc" }, { name: "asc" }],
    select: { id: true, name: true, system: true, code: true },
  });
  return rows;
}

/** Só os nomes (para alimentar o CategoryInput). */
export async function listCategoryNames(kind: CategoriaKind): Promise<string[]> {
  return (await listCategories(kind)).map((c) => c.name);
}

/**
 * Resolve um nome digitado/escolhido para o rótulo canônico + enum de despesa.
 * Casa por nome (ignorando maiúsculas/acentos de caixa); se não existir, cria
 * uma categoria custom (→ OUTROS) para reaproveitar.
 */
export async function resolveDespesaCategory(
  name: string,
): Promise<{ label: string; category: CategoriaPagar }> {
  const label = (name || "").trim();
  if (!label) return { label: "Outros", category: "OUTROS" };
  const row = await prisma.launchCategory.findFirst({
    where: { kind: "DESPESA", name: { equals: label, mode: "insensitive" } },
    select: { name: true, code: true },
  });
  if (row) return { label: row.name, category: (row.code as CategoriaPagar) ?? "OUTROS" };
  await prisma.launchCategory.create({
    data: { name: label, kind: "DESPESA", system: false, code: null },
  });
  return { label, category: "OUTROS" };
}

/** Igual ao anterior, para categorias de RECEITA. */
export async function resolveReceitaCategory(
  name: string,
): Promise<{ label: string; category: CategoriaReceber }> {
  const label = (name || "").trim();
  if (!label) return { label: "Outros", category: "OUTROS" };
  const row = await prisma.launchCategory.findFirst({
    where: { kind: "RECEITA", name: { equals: label, mode: "insensitive" } },
    select: { name: true, code: true },
  });
  if (row) return { label: row.name, category: (row.code as CategoriaReceber) ?? "OUTROS" };
  await prisma.launchCategory.create({
    data: { name: label, kind: "RECEITA", system: false, code: null },
  });
  return { label, category: "OUTROS" };
}
