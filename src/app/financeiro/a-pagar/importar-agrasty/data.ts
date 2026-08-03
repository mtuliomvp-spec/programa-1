// Títulos dos Pix de 31/07/2026 a lançar em Contas a pagar com saque no
// capital da Agrasty (fluxo Capital). doc = ID da transação Pix (E2E, único —
// garante a idempotência); supplier = recebedor do comprovante; payer = quem
// pagou de fato (vai nas observações, para orientar a baixa na conta certa).
export const AGRASTY_BENEFICIARY_NAME = "Agrasty";
export const AGRASTY_DUE_DATE = "2026-07-31";

export type AgrastyRow = {
  doc: string;
  supplier: string;
  amount: number;
  payer: string;
};

export const AGRASTY_ROWS: AgrastyRow[] = [
  { doc: "E9040088820260731235166800388763", supplier: "Ricardo David Costa Coelho", amount: 1333.0, payer: "MVP (Santander)" },
  { doc: "E0000000020260731233544884128975", supplier: "Antonio A C Nt", amount: 1104.0, payer: "MVP (Banco do Brasil)" },
  { doc: "E0000000020260731234124992271814", supplier: "Larissa C Guimaraes", amount: 1030.0, payer: "MVP (Banco do Brasil)" },
  { doc: "E0000000020260731233737979987704", supplier: "Eliton L S Andrade", amount: 1010.0, payer: "MVP (Banco do Brasil)" },
  { doc: "E60746948202607312320A3785gaqR08", supplier: "Daniel Oliveira Paiva", amount: 870.0, payer: "Marco Tulio (Bradesco)" },
  { doc: "E60746948202607312347C3785tKpuUI", supplier: "Emanoel de Jesus Assunção Marinho", amount: 805.0, payer: "MVP (Bradesco)" },
  { doc: "E60746948202607312349C3785cjjeio", supplier: "Wandson Holanda de Andrade", amount: 710.0, payer: "MVP (Bradesco)" },
  { doc: "E0000000020260731233907001577328", supplier: "Rafael Ferrais Souza", amount: 672.0, payer: "MVP (Banco do Brasil)" },
  { doc: "E0000000020260731232821655131408", supplier: "Emanoel de Jesus Assunção Marinho", amount: 631.0, payer: "Marco Tulio (Banco do Brasil)" },
  { doc: "E0000000020260731233248555239211", supplier: "Rafael Ferrais Souza", amount: 448.0, payer: "MVP (Banco do Brasil)" },
  { doc: "E0000000020260731232957636850193", supplier: "Emanoel de Jesus Assunção Marinho", amount: 274.0, payer: "Marco Tulio (Banco do Brasil)" },
  { doc: "E0000000020260731233414574926570", supplier: "Eliton L S Andrade", amount: 140.0, payer: "MVP (Banco do Brasil)" },
];
