/**
 * Fluxos estruturais (as "obras estruturais" do Agrasty). Todo lançamento
 * financeiro passa por um deles. Este arquivo é puro (sem prisma) para poder
 * ser usado tanto em componentes de cliente quanto no servidor.
 */
export const STRUCTURAL_FLOWS = [
  { key: "VEICULOS", name: "Veículos", notes: "Compra, custos e venda de veículos" },
  { key: "PECAS", name: "Peças", notes: "Compra e venda de peças do almoxarifado" },
  { key: "ADMINISTRATIVO", name: "Administrativo", notes: "Despesas e receitas administrativas" },
  { key: "CAPITAL", name: "Capital", notes: "Aportes, retiradas e pró-labore" },
] as const;

export type StructuralKey = (typeof STRUCTURAL_FLOWS)[number]["key"];

export const STRUCTURAL_KEYS = STRUCTURAL_FLOWS.map((f) => f.key) as StructuralKey[];

/**
 * As mesmas chaves em forma de tupla literal, para `z.enum(...)`. Existe porque
 * cada formulário repetia a lista à mão nos schemas — quando o fluxo Peças
 * nasceu, escolhê-lo derrubava o envio com "Dados inválidos". Use sempre esta.
 */
export const STRUCTURAL_KEY_VALUES = [
  "VEICULOS",
  "PECAS",
  "ADMINISTRATIVO",
  "CAPITAL",
] as const satisfies readonly StructuralKey[];

export function isStructuralKey(value: unknown): value is StructuralKey {
  return typeof value === "string" && (STRUCTURAL_KEYS as string[]).includes(value);
}

/**
 * Fluxo que VALE de fato para um lançamento: "Veículos" só existe com um
 * veículo indicado — sem carro, o gasto/receita é da loja e entra como
 * Administrativo. Chave inválida ou vazia também cai em Administrativo.
 */
export function effectiveStructuralKey(
  key: unknown,
  vehicleId: string | null | undefined,
): StructuralKey {
  const flow = isStructuralKey(key) ? key : "ADMINISTRATIVO";
  return flow === "VEICULOS" && !vehicleId ? "ADMINISTRATIVO" : flow;
}
