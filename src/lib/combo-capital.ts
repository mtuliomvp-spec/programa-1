import "server-only";
import { prisma } from "@/lib/prisma";
import { freeCapitalOf } from "@/lib/investments";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type AbatimentoDoCombo = {
  /** Quanto do borderô cobre o saldo devedor (0 = sai tudo em dinheiro). */
  abate: number;
  beneficiaryId: string | null;
  beneficiaryName: string | null;
  /** Saldo devedor LIVRE do beneficiário, para os textos de tela. */
  debt: number;
};

/**
 * Quanto um combo vai abater do saldo devedor de capital de quem o montou.
 *
 * Existe em um lugar só porque três telas precisam da MESMA resposta: a ficha
 * do combo (que promete o abatimento), a baixa (que o executa) e a leitura do
 * comprovante (que confere o valor que saiu do banco). Quando cada uma fazia a
 * sua conta, a ficha prometia um abatimento maior do que a baixa fazia, e a
 * conferência acusava "desconto?" no que era abatimento.
 *
 * Regras (as mesmas da baixa):
 *  - combo marcado como "valor integral" (payFull) não abate nada;
 *  - só abate até o saldo devedor LIVRE do beneficiário;
 *  - a base é o que de fato SAI para ele: título do fluxo Capital dele já vira
 *    RETIRADA na baixa, e abater em cima disso anularia a própria retirada.
 */
export async function abatimentoDoCombo(combo: {
  userId: string | null;
  payFull: boolean;
  payables: { amount: number; capitalBeneficiaryId: string | null }[];
}): Promise<AbatimentoDoCombo> {
  const vazio: AbatimentoDoCombo = { abate: 0, beneficiaryId: null, beneficiaryName: null, debt: 0 };
  if (!combo.userId) return vazio;
  const beneficiary = await prisma.capitalBeneficiary.findUnique({
    where: { userId: combo.userId },
    select: { id: true, name: true },
  });
  if (!beneficiary) return vazio;
  const free = await freeCapitalOf(beneficiary.id);
  const debt = Math.max(0, round2(-free));
  if (combo.payFull || debt <= 0.005) {
    return { abate: 0, beneficiaryId: beneficiary.id, beneficiaryName: beneficiary.name, debt };
  }
  const baseAbativel = round2(
    combo.payables
      .filter((p) => p.capitalBeneficiaryId !== beneficiary.id)
      .reduce((s, p) => s + p.amount, 0),
  );
  return {
    abate: round2(Math.min(baseAbativel, debt)),
    beneficiaryId: beneficiary.id,
    beneficiaryName: beneficiary.name,
    debt,
  };
}
