import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Financeiras do simulador da vitrine.
 *
 * A taxa que vale é a NEGOCIADA PELA LOJA (`monthlyRate`); a do Banco Central
 * (`bcbMonthlyRate`) entra como referência automática quando a loja ainda não
 * cadastrou a sua. Financeira sem nenhuma das duas fica fora do simulador —
 * anunciar parcela sem taxa seria inventar número.
 */

export type ShowroomRate = {
  id: string;
  name: string;
  monthlyRate: number;
  /** De onde veio a taxa exibida. */
  source: "LOJA" | "BCB";
  bcbReferenceDate: Date | null;
  maxInstallments: number;
  minDownPercent: number;
};

export async function listFinancingRates() {
  return prisma.financingRate.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

/** Financeiras que o cliente vê na vitrine (ativas e com taxa). */
export async function showroomRates(): Promise<ShowroomRate[]> {
  const rows = await prisma.financingRate.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows
    .map((r): ShowroomRate | null => {
      const daLoja = r.monthlyRate && r.monthlyRate > 0 ? r.monthlyRate : null;
      const doBc = r.bcbMonthlyRate && r.bcbMonthlyRate > 0 ? r.bcbMonthlyRate : null;
      const taxa = daLoja ?? doBc;
      if (!taxa) return null;
      return {
        id: r.id,
        name: r.name,
        monthlyRate: taxa,
        source: daLoja ? "LOJA" : "BCB",
        bcbReferenceDate: daLoja ? null : r.bcbReferenceDate,
        maxInstallments: r.maxInstallments,
        minDownPercent: r.minDownPercent,
      };
    })
    .filter((r): r is ShowroomRate => r !== null);
}
