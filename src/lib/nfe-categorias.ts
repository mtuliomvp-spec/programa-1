import { nameKey } from "@/lib/person-keys";

/**
 * Categorias possíveis para a despesa de uma nota fiscal, fechadas de
 * propósito: `resolveDespesaCategory` cria uma categoria nova quando não
 * conhece o rótulo, e um nome livre ("Autopeças", "Peças e pneus", "Peça
 * automotiva") encheria o cadastro de variações da mesma coisa.
 *
 * "Combustível" e "Documentação de veículo" já são categorias do sistema e
 * casam exatamente.
 *
 * Fica fora de `nfe-ai.ts` para o caminho do XML não arrastar o SDK da IA.
 */
export const CATEGORIAS = [
  "Peças",
  "Óleo e lubrificantes",
  "Pneus",
  "Serviço",
  "Combustível",
  "Documentação de veículo",
  "Despesa operacional",
  "Outros",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

/**
 * Fecha a categoria na lista: casa ignorando acento e maiúscula e cai em
 * "Peças" quando não reconhece. A checagem é feita aqui, e não no JSON Schema
 * da IA, porque `enum` com tipo anulável faz a API recusar o pedido (erro 400).
 */
export function normalizeCategoria(valor: string | null | undefined): Categoria {
  const key = nameKey(valor);
  return CATEGORIAS.find((c) => nameKey(c) === key) ?? "Peças";
}

/**
 * Palpite pelo texto dos itens, para o XML (que não traz categoria) não cair
 * sempre em "Peças". Fica sempre editável na solicitação.
 */
export function guessCategoria(descricoes: string[]): Categoria {
  const texto = nameKey(descricoes.join(" "));
  const tem = (...termos: string[]) => termos.some((t) => texto.includes(nameKey(t)));
  if (tem("pneu")) return "Pneus";
  if (tem("oleo", "lubrificante", "graxa")) return "Óleo e lubrificantes";
  if (tem("gasolina", "diesel", "etanol", "combustivel", "arla")) return "Combustível";
  if (tem("mao de obra", "servico", "instalacao", "lavagem", "higienizacao", "polimento")) {
    return "Serviço";
  }
  if (tem("licenciamento", "vistoria", "despachante", "transferencia", "detran")) {
    return "Documentação de veículo";
  }
  return "Peças";
}
