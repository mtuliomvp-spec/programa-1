/**
 * Fluxos estruturais (as "obras estruturais" do Agrasty). Todo lançamento
 * financeiro passa por um deles. Este arquivo é puro (sem prisma) para poder
 * ser usado tanto em componentes de cliente quanto no servidor.
 */
export const STRUCTURAL_FLOWS = [
  { key: "VEICULOS", name: "Veículos", notes: "Compra, custos e venda de veículos e peças" },
  { key: "ADMINISTRATIVO", name: "Administrativo", notes: "Despesas e receitas administrativas" },
  { key: "CAPITAL", name: "Capital", notes: "Aportes, retiradas e pró-labore" },
] as const;

export type StructuralKey = (typeof STRUCTURAL_FLOWS)[number]["key"];

export const STRUCTURAL_KEYS = STRUCTURAL_FLOWS.map((f) => f.key) as StructuralKey[];

export function isStructuralKey(value: unknown): value is StructuralKey {
  return typeof value === "string" && (STRUCTURAL_KEYS as string[]).includes(value);
}
