import { formatCurrency } from "@/lib/format";

export type AcquisitionInfo = {
  acquisitionType: "A_VISTA" | "PARCELADO" | "FINANCIADO" | "CONSORCIO";
  purchasePrice: number;
  downPayment: number;
  installmentsCount: number;
  financerName: string | null;
  payoffAmount?: number;
  payoffTo?: string | null;
  debtsAmount?: number;
};

export const ACQUISITION_LABEL: Record<AcquisitionInfo["acquisitionType"], string> = {
  A_VISTA: "À vista",
  PARCELADO: "Parcelado",
  FINANCIADO: "Financiado",
  CONSORCIO: "Consórcio",
};

/**
 * Resumo legível das condições de pagamento da compra, para os documentos
 * impressos (ordem de compra e contrato).
 */
export function describeAcquisition(v: AcquisitionInfo): {
  forma: string;
  linhas: { label: string; value: string }[];
} {
  const forma = ACQUISITION_LABEL[v.acquisitionType];
  const payoff = v.payoffAmount ?? 0;
  const debts = v.debtsAmount ?? 0;
  const repasse = payoff > 0 || debts > 0;
  const liquido = Math.max(0, Math.round((v.purchasePrice - payoff - debts) * 100) / 100);

  const linhas: { label: string; value: string }[] = [
    { label: "Forma de pagamento", value: forma },
    { label: "Valor negociado", value: formatCurrency(v.purchasePrice) },
  ];

  // Repasse/troca: mostra a decomposição em credores.
  if (repasse) {
    if (payoff > 0) {
      linhas.push({
        label: `Quitação do financiamento${v.payoffTo ? ` (${v.payoffTo})` : ""}`,
        value: `− ${formatCurrency(payoff)}`,
      });
    }
    if (debts > 0) {
      linhas.push({ label: "Débitos do veículo", value: `− ${formatCurrency(debts)}` });
    }
    linhas.push({ label: "Líquido ao vendedor", value: formatCurrency(liquido) });
  }

  if (v.acquisitionType !== "A_VISTA") {
    const financiado = v.acquisitionType === "FINANCIADO" || v.acquisitionType === "CONSORCIO";
    const restante = Math.max(0, Math.round((liquido - v.downPayment) * 100) / 100);
    const count = Math.max(1, v.installmentsCount);
    const parcela = Math.round((restante / count) * 100) / 100;

    if (v.downPayment > 0) {
      linhas.push({ label: "Entrada", value: formatCurrency(v.downPayment) });
    }
    linhas.push({
      label: financiado ? "Financiamento" : "Parcelamento",
      value: `${count}× de ${formatCurrency(parcela)}`,
    });
    if (v.financerName) {
      linhas.push({
        label: v.acquisitionType === "CONSORCIO" ? "Administradora" : "Banco / financeira",
        value: v.financerName,
      });
    }
  }

  return { forma, linhas };
}
