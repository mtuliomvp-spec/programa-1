/**
 * Fatura do cartão SANTANDER UNIQUE VISA (final 7574) — titular Marco Tulio.
 * Vencimento 04/08/2026 · total R$ 14.870,98 · débito automático em conta.
 *
 * Lançamentos transcritos da fatura (compras internacionais somadas com o IOF
 * da própria linha). Todos entram como ADMINISTRATIVO; o fluxo de cada um
 * (Veículos/Capital) é ajustado depois, dentro do título.
 */
export type FaturaRow = {
  /** Data da compra como na fatura (dd/mm). */
  d: string;
  desc: string;
  /** Parcela x/y quando for compra parcelada. */
  parcela: string | null;
  /** Cartão (final) e portador. */
  card: string;
  amount: number;
};

export const CARTAO_NOME = "Fatura cartão Santander Unique Visa (final 7574)";
export const CARTAO_FORNECEDOR = "Santander — Cartão Unique Visa";
export const CARTAO_CATEGORIA = "Cartão de crédito";
export const CARTAO_DIA_VENCIMENTO = 4;
export const CARTAO_PRIMEIRO_VENCIMENTO = "2026-08-04";
export const CARTAO_TOTAL = 14870.98;
export const CARTAO_NOTES =
  "Débito automático em conta no vencimento. A cada mês, abrir o título e digitar os lançamentos da fatura (cada um no seu fluxo).";

export const FATURA_ROWS: FaturaRow[] = [
  // ── Cartão 7574 — MARCO T M V PEREIRA ─────────────────────────────────────
  { d: "23/10", desc: "AZUL SEGUROS", parcela: "10/10", card: "7574 Marco", amount: 687.44 },
  { d: "02/12", desc: "MP*PALACIODOSCOL", parcela: "08/12", card: "7574 Marco", amount: 208.29 },
  { d: "15/06", desc: "POTIGUAR COHAFUMA", parcela: "02/03", card: "7574 Marco", amount: 190.48 },
  { d: "06/07", desc: "SCP ESSENCIAL - JUL/26", parcela: null, card: "7574 Marco", amount: 10.5 },
  { d: "20/07", desc: "DL *UBERRIDES", parcela: null, card: "7574 Marco", amount: 12.92 },

  // ── Cartão 9792 — MARCI R V PEREIRA ───────────────────────────────────────
  { d: "13/07", desc: "EC*PLETHORA", parcela: null, card: "9792 Marci", amount: 985.0 },

  // ── Cartão 8205 — MARCO T M V PEREIRA ─────────────────────────────────────
  { d: "15/04", desc: "JIM COM SOURIE ODONTOLOGI", parcela: "04/06", card: "8205 Marco", amount: 728.16 },
  { d: "06/05", desc: "AGENCIA DE VIAGENS", parcela: "03/10", card: "8205 Marco", amount: 315.87 },
  { d: "11/06", desc: "MATEUS SUPERMERCA", parcela: "02/02", card: "8205 Marco", amount: 439.67 },
  { d: "25/06", desc: "MATEUS SUPERMERCA", parcela: "02/02", card: "8205 Marco", amount: 299.55 },
  { d: "22/07", desc: "MATEUS SUPERMERCA", parcela: "01/02", card: "8205 Marco", amount: 580.21 },
  { d: "01/07", desc: "LOVABLE (US$ 125,71 + IOF)", parcela: null, card: "8205 Marco", amount: 713.89 },
  { d: "02/07", desc: "LOVABLE (US$ 125,43 + IOF)", parcela: null, card: "8205 Marco", amount: 714.83 },
  { d: "03/07", desc: "LOVABLE (US$ 20,99 + IOF)", parcela: null, card: "8205 Marco", amount: 119.61 },
  { d: "03/07", desc: "LOVABLE (US$ 124,57 + IOF)", parcela: null, card: "8205 Marco", amount: 709.87 },
  { d: "06/07", desc: "LOVABLE (US$ 52,55 + IOF)", parcela: null, card: "8205 Marco", amount: 298.14 },
  { d: "06/07", desc: "LOVABLE (US$ 62,38 + IOF)", parcela: null, card: "8205 Marco", amount: 353.91 },
  { d: "07/07", desc: "NETFLIX COM", parcela: null, card: "8205 Marco", amount: 44.9 },
  { d: "07/07", desc: "LOVABLE (US$ 62,74 + IOF)", parcela: null, card: "8205 Marco", amount: 355.64 },
  { d: "09/07", desc: "LOVABLE (US$ 124,77 + IOF)", parcela: null, card: "8205 Marco", amount: 705.62 },
  { d: "10/07", desc: "LOVABLE (US$ 20,84 + IOF)", parcela: null, card: "8205 Marco", amount: 117.35 },
  { d: "11/07", desc: "ANTHROPIC (US$ 48,55 + IOF)", parcela: null, card: "8205 Marco", amount: 273.38 },
  { d: "13/07", desc: "LOVABLE (US$ 52,02 + IOF)", parcela: null, card: "8205 Marco", amount: 291.55 },
  { d: "14/07", desc: "LOVABLE (US$ 62,52 + IOF)", parcela: null, card: "8205 Marco", amount: 351.04 },
  { d: "15/07", desc: "LOVABLE (US$ 62,72 + IOF)", parcela: null, card: "8205 Marco", amount: 349.14 },
  { d: "17/07", desc: "LOVABLE (US$ 20,84 + IOF)", parcela: null, card: "8205 Marco", amount: 116.54 },
  { d: "20/07", desc: "LOVABLE (US$ 52,09 + IOF)", parcela: null, card: "8205 Marco", amount: 292.44 },
  { d: "25/07", desc: "PB ADMINISTRADORA", parcela: null, card: "8205 Marco", amount: 8.0 },
  { d: "25/07", desc: "APPLE COM/BILL", parcela: null, card: "8205 Marco", amount: 19.9 },
  { d: "25/07", desc: "LOVABLE (US$ 20,96 + IOF)", parcela: null, card: "8205 Marco", amount: 116.82 },

  // ── Cartão 4456 — MARCO TULIO FILHO ───────────────────────────────────────
  { d: "27/06", desc: "MATEUS SUPERMERCADOS S", parcela: null, card: "4456 Marco Tulio Filho", amount: 10.29 },
  { d: "28/06", desc: "MIX MATEUS", parcela: null, card: "4456 Marco Tulio Filho", amount: 62.15 },
  { d: "28/06", desc: "LUCIVALDODALUZDA", parcela: null, card: "4456 Marco Tulio Filho", amount: 25.0 },
  { d: "02/07", desc: "EMPORIO PTA AREIA", parcela: null, card: "4456 Marco Tulio Filho", amount: 753.56 },
  { d: "02/07", desc: "MATEUS SUPERMERCADOS S", parcela: null, card: "4456 Marco Tulio Filho", amount: 200.0 },
  { d: "03/07", desc: "PBADMINISTRADORA", parcela: null, card: "4456 Marco Tulio Filho", amount: 8.0 },
  { d: "08/07", desc: "REI DO MATE HSD", parcela: null, card: "4456 Marco Tulio Filho", amount: 15.9 },
  { d: "08/07", desc: "VISION ESTACIONAMENTO", parcela: null, card: "4456 Marco Tulio Filho", amount: 15.0 },
  { d: "09/07", desc: "EMPORIO PTA AREIA", parcela: null, card: "4456 Marco Tulio Filho", amount: 869.36 },
  { d: "14/07", desc: "D PARK", parcela: null, card: "4456 Marco Tulio Filho", amount: 13.0 },
  { d: "16/07", desc: "EMPORIO PTA AREIA", parcela: null, card: "4456 Marco Tulio Filho", amount: 766.82 },
  { d: "22/07", desc: "EMPORIO PTA AREIA", parcela: null, card: "4456 Marco Tulio Filho", amount: 642.74 },
  { d: "24/07", desc: "POSTO CARONE", parcela: null, card: "4456 Marco Tulio Filho", amount: 20.0 },
  { d: "24/07", desc: "HIPER MATEUS", parcela: null, card: "4456 Marco Tulio Filho", amount: 350.29 },
  { d: "25/07", desc: "CHURRASCO DO MANCHA", parcela: null, card: "4456 Marco Tulio Filho", amount: 20.0 },

  // ── Cartão 8703 — GABRIEL A V PEREIRA ─────────────────────────────────────
  { d: "07/07", desc: "UBER *TRIP (US$ 10,94 + IOF)", parcela: null, card: "8703 Gabriel", amount: 62.02 },
  { d: "07/07", desc: "UBER *TRIP (US$ 7,95 + IOF)", parcela: null, card: "8703 Gabriel", amount: 45.06 },
  { d: "07/07", desc: "UBER *TRIP (US$ 12,94 + IOF)", parcela: null, card: "8703 Gabriel", amount: 73.35 },
  { d: "07/07", desc: "UBER *TRIP (US$ 22,93 + IOF)", parcela: null, card: "8703 Gabriel", amount: 129.98 },
  { d: "07/07", desc: "UBER *TRIP (US$ 9,95 + IOF)", parcela: null, card: "8703 Gabriel", amount: 56.4 },
  { d: "07/07", desc: "UBER *TRIP (US$ 4,94 + IOF)", parcela: null, card: "8703 Gabriel", amount: 28.0 },
  { d: "09/07", desc: "UBER *TRIP (US$ 43,93 + IOF)", parcela: null, card: "8703 Gabriel", amount: 248.44 },
  { d: "09/07", desc: "UBER *TRIP (US$ 7,95 + IOF)", parcela: null, card: "8703 Gabriel", amount: 44.96 },
];

/** Descrição do lançamento como vai aparecer dentro do título. */
export function rowDescription(r: FaturaRow): string {
  return `${r.d} ${r.desc}${r.parcela ? ` — parc. ${r.parcela}` : ""} · cartão ${r.card}`;
}

/**
 * Fluxo definido pelo Marco: TODA a fatura vai para o Capital, dividida por
 * sócio — Lovable/Anthropic → Agrasty Construções; cartão da Marci (9792) →
 * Marcelo Matos Viana Pereira Jr; todo o resto (supermercados, parcelamentos,
 * assinaturas, cartões adicionais Gabriel e Marco Túlio Filho) → Marco Túlio.
 */
export type BeneficiaryKey = "AGRASTY" | "MARCELO" | "MARCO";

export const BENEFICIARIES: Record<
  BeneficiaryKey,
  { createName: string; searchKeys: string[] }
> = {
  AGRASTY: { createName: "Agrasty Construções", searchKeys: ["agrasty"] },
  MARCELO: {
    createName: "Marcelo Matos Viana Pereira Jr",
    searchKeys: ["marcelo matos"],
  },
  MARCO: { createName: "Marco Tulio Marao Viana Pereira", searchKeys: ["marco tulio"] },
};

export function rowBeneficiary(r: FaturaRow): BeneficiaryKey {
  const d = r.desc.toUpperCase();
  if (d.startsWith("LOVABLE") || d.startsWith("ANTHROPIC")) return "AGRASTY";
  if (r.card.startsWith("9792")) return "MARCELO";
  return "MARCO";
}
