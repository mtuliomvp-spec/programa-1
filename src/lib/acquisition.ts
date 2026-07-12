import { formatCurrency } from "@/lib/format";

export type AcquisitionInfo = {
  acquisitionType: "A_VISTA" | "PARCELADO" | "FINANCIADO" | "CONSORCIO";
  purchasePrice: number;
  downPayment: number;
  installmentsCount: number;
  financerName: string | null;
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
  const linhas: { label: string; value: string }[] = [
    { label: "Forma de pagamento", value: forma },
    { label: "Valor total da compra", value: formatCurrency(v.purchasePrice) },
  ];

  if (v.acquisitionType !== "A_VISTA") {
    const financiado = v.acquisitionType === "FINANCIADO" || v.acquisitionType === "CONSORCIO";
    const restante = Math.max(0, Math.round((v.purchasePrice - v.downPayment) * 100) / 100);
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
