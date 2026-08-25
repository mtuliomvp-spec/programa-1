import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Regras de fluxo da fatura do cartão Santander (definidas pelo Marco):
 * TODA a fatura vai para o Capital, dividida por sócio —
 *  - Lovable / Anthropic → Agrasty Construções;
 *  - cartão adicional 9792 (Marci) → Marcelo Matos Viana Pereira Jr;
 *  - todo o resto (supermercados, parcelamentos, assinaturas, cartões
 *    adicionais Gabriel e Marco Túlio Filho) → Marco Túlio.
 * Usadas na importação da fatura em PDF por IA (Contas a pagar → editar o
 * título do cartão).
 */

export type BeneficiaryKey = "AGRASTY" | "MARCELO" | "MARCO";

export const BENEFICIARIES: Record<BeneficiaryKey, { createName: string; searchKeys: string[] }> = {
  AGRASTY: { createName: "Agrasty Construções", searchKeys: ["agrasty"] },
  MARCELO: { createName: "Marcelo Matos Viana Pereira Jr", searchKeys: ["marcelo matos"] },
  MARCO: { createName: "Marco Tulio Marao Viana Pereira", searchKeys: ["marco tulio"] },
};

/** Classifica um lançamento da fatura pelo texto e pelo final do cartão. */
export function classifyCardCharge(description: string, cardLast4: string | null | undefined): BeneficiaryKey {
  const d = description.toUpperCase();
  if (d.includes("LOVABLE") || d.includes("ANTHROPIC")) return "AGRASTY";
  if ((cardLast4 || "").trim() === "9792") return "MARCELO";
  return "MARCO";
}

const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Acha os beneficiários pelo nome ignorando acentos/caixa; cadastra se faltarem. */
export async function resolveBeneficiaryIds(): Promise<Record<BeneficiaryKey, string>> {
  const all = await prisma.capitalBeneficiary.findMany({ select: { id: true, name: true } });
  const out = {} as Record<BeneficiaryKey, string>;
  for (const key of Object.keys(BENEFICIARIES) as BeneficiaryKey[]) {
    const cfg = BENEFICIARIES[key];
    const found = all.find((b) => cfg.searchKeys.some((k) => normalize(b.name).includes(normalize(k))));
    if (found) out[key] = found.id;
    else {
      const created = await prisma.capitalBeneficiary.create({
        data: { name: cfg.createName },
        select: { id: true },
      });
      out[key] = created.id;
    }
  }
  return out;
}
