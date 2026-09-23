import "server-only";
import { prisma } from "@/lib/prisma";
import { freeCapitalOf } from "@/lib/investments";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type DisponivelParaSaque = {
  beneficiaryId: string;
  beneficiaryName: string;
  /** Capital livre hoje (capital − aplicado). */
  livre: number;
  /** Saques já pedidos e ainda não pagos — o dinheiro já está comprometido. */
  pendente: number;
  /** O que ainda pode ser pedido: livre − pendente (nunca negativo). */
  disponivel: number;
};

/**
 * Quanto um usuário pode pedir de saque do próprio capital.
 *
 * O limite é o capital LIVRE — o aplicado está preso em conta de Aplicação e
 * não sai por aqui. E desconta os saques já pedidos que ainda não foram pagos:
 * a retirada só nasce na baixa, então sem isso daria para pedir duas vezes o
 * mesmo dinheiro antes de o primeiro saque ser pago.
 *
 * `null` quando o usuário não está ligado a nenhum beneficiário do capital.
 */
export async function disponivelParaSaque(
  userId: string,
  ignorarComboId?: string,
): Promise<DisponivelParaSaque | null> {
  const beneficiary = await prisma.capitalBeneficiary.findUnique({
    where: { userId },
    select: { id: true, name: true, active: true },
  });
  if (!beneficiary || !beneficiary.active) return null;

  const [livre, pendentes] = await Promise.all([
    freeCapitalOf(beneficiary.id),
    prisma.payable.aggregate({
      where: {
        capitalBeneficiaryId: beneficiary.id,
        status: { not: "PAGO" },
        paymentCombo: {
          tipo: "SAQUE",
          status: { in: ["ABERTO", "SOLICITADO"] },
          ...(ignorarComboId ? { id: { not: ignorarComboId } } : {}),
        },
      },
      _sum: { amount: true },
    }),
  ]);
  const pendente = round2(pendentes._sum.amount ?? 0);
  return {
    beneficiaryId: beneficiary.id,
    beneficiaryName: beneficiary.name,
    livre: round2(livre),
    pendente,
    disponivel: Math.max(0, round2(livre - pendente)),
  };
}
