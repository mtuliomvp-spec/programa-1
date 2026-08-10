/**
 * Recorrências de impostos da MVP Veiculos (guias mensais, vencimento dia 20,
 * antecipado para o último dia útil). Valores-base = últimas guias recebidas —
 * o valor real varia mês a mês, então cada título gerado deve ser conferido
 * com a guia antes da baixa.
 *
 * Primeira ocorrência: 20/07/2026 (competência 06/2026), lançada junto com a
 * importação. As seguintes são geradas pelo motor de recorrências.
 */
export type ImpostoRow = {
  key: string;
  /** Descrição da recorrência ({competencia} vira o mês anterior ao vencimento). */
  description: string;
  supplier: string;
  categoryLabel: string;
  /** Valor-base da recorrência (última guia conhecida). */
  amount: number;
  /** Nº do documento da guia de 20/07/2026 (quando conhecido). */
  firstDoc: string | null;
  /** Valor da guia de 20/07/2026 (quando conhecido; senão usa o valor-base). */
  firstAmount: number | null;
  notes: string;
};

export const IMPOSTOS_START_DATE = "2026-07-20";
export const IMPOSTOS_DAY_OF_MONTH = 20;

export const IMPOSTOS_ROWS: ImpostoRow[] = [
  {
    key: "das",
    description: "DAS — Simples Nacional — competência {competencia}",
    supplier: "Receita Federal — DAS (Simples Nacional)",
    categoryLabel: "Impostos",
    amount: 1235.47, // guia 04/2026 (venc. 20/05/2026) — valor varia com o faturamento
    firstDoc: null,
    firstAmount: null,
    notes:
      "Valor varia com o faturamento do mês — confira a guia DAS no portal do Simples Nacional e ajuste o título antes de pagar.",
  },
  {
    key: "fgts",
    description: "FGTS Digital — competência {competencia}",
    supplier: "Caixa Econômica Federal — FGTS Digital",
    categoryLabel: "Impostos",
    amount: 457.54, // guia 06/2026 (3 trabalhadores)
    firstDoc: "0126070247235154-9",
    firstAmount: 457.54,
    notes:
      "Valor varia com a folha — confira a guia GFD no FGTS Digital e ajuste o título antes de pagar.",
  },
  {
    key: "inss",
    description: "DARF INSS (segurados) — competência {competencia}",
    supplier: "Receita Federal — DARF INSS",
    categoryLabel: "Impostos",
    amount: 441.76, // guia 06/2026 (contr. descontada dos empregados)
    firstDoc: "07.16.26183.4999804-5",
    firstAmount: 441.76,
    notes:
      "Valor varia com a folha — confira o DARF (DCTFWeb) e ajuste o título antes de pagar.",
  },
];
