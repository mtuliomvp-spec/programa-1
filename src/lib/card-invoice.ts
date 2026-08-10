import "server-only";
import { prisma } from "@/lib/prisma";
import { timed } from "@/lib/perf";

/**
 * Fatura de cartão de crédito: o título (Payable com cardInvoice=true) é uma
 * linha só no Contas a pagar; os lançamentos individuais (CardInvoiceItem)
 * reproduzem a fatura e cada um aponta um fluxo:
 *
 *  - ADMINISTRATIVO → despesa comum (fica no valor do título);
 *  - VEICULOS + carro → vira custo do veículo (entra na margem do carro e é
 *    descontado das despesas do DRE para não contar duas vezes);
 *  - CAPITAL + sócio → vira RETIRADA do sócio na baixa do título (capital não
 *    é despesa; também é descontado do DRE).
 *
 * O valor do título é sempre a soma dos lançamentos (quando houver ao menos um).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Soma dos itens que NÃO são despesa (custo de veículo ou retirada de capital). */
export function cardNonExpenseAmount(items: { structuralKey: string; vehicleId: string | null; capitalBeneficiaryId: string | null; amount: number }[]): number {
  return round2(
    items
      .filter(
        (i) =>
          (i.structuralKey === "VEICULOS" && i.vehicleId) ||
          (i.structuralKey === "CAPITAL" && i.capitalBeneficiaryId),
      )
      .reduce((s, i) => s + i.amount, 0),
  );
}

/**
 * Sincroniza tudo o que deriva dos lançamentos de uma fatura:
 *  - valor do título = soma dos itens (quando houver itens);
 *  - custo do veículo (cria/atualiza/remove o VehicleCost 1:1 de cada item
 *    VEICULOS com carro — pós-venda quando o carro já foi vendido);
 *  - retirada de capital (cria/remove a transação 1:1 de cada item CAPITAL com
 *    sócio — só existe enquanto o título estiver PAGO, como nas demais
 *    retiradas: o capital se move junto com o dinheiro).
 *
 * Idempotente — pode ser chamada após qualquer mudança de item ou de status.
 */
export const syncCardInvoiceDerived = (...a: Parameters<typeof cardInvoiceDerived>) =>
  timed("fatura de cartão: sincronizar itens", () => cardInvoiceDerived(...a));

async function cardInvoiceDerived(payableId: string): Promise<void> {
  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
    select: {
      id: true,
      cardInvoice: true,
      status: true,
      amount: true,
      dueDate: true,
      paymentDate: true,
      cardItems: true,
    },
  });
  if (!payable?.cardInvoice) return;

  // Valor do título acompanha a fatura digitada.
  if (payable.cardItems.length > 0) {
    const total = round2(payable.cardItems.reduce((s, i) => s + i.amount, 0));
    if (Math.abs(total - payable.amount) > 0.004) {
      await prisma.payable.update({ where: { id: payableId }, data: { amount: total } });
    }
  }

  for (const item of payable.cardItems) {
    // Custo do veículo (existe desde o lançamento, como nos títulos comuns).
    const wantsCost = item.structuralKey === "VEICULOS" && !!item.vehicleId;
    const existingCost = await prisma.vehicleCost.findUnique({ where: { cardItemId: item.id } });
    if (wantsCost) {
      const vehicle = await prisma.vehicle.findUnique({
        where: { id: item.vehicleId! },
        select: { status: true },
      });
      const data = {
        vehicleId: item.vehicleId!,
        description: `Cartão de crédito: ${item.description}`,
        amount: item.amount,
        date: payable.dueDate,
        postSale: vehicle?.status === "VENDIDO",
      };
      if (existingCost) {
        await prisma.vehicleCost.update({ where: { id: existingCost.id }, data });
      } else {
        await prisma.vehicleCost.create({
          data: { ...data, category: "OUTROS", cardItemId: item.id },
        });
      }
    } else if (existingCost) {
      await prisma.vehicleCost.delete({ where: { id: existingCost.id } });
    }

    // Retirada do sócio: só com o título PAGO. Importante: SEM payableId — o
    // vínculo é pelo cardItemId. (Com payableId, o DRE excluiria o título
    // INTEIRO das despesas, e não apenas a parte do capital.)
    const wantsRetirada =
      item.structuralKey === "CAPITAL" && !!item.capitalBeneficiaryId && payable.status === "PAGO";
    const existingTx = await prisma.capitalTransaction.findUnique({ where: { cardItemId: item.id } });
    if (wantsRetirada) {
      const data = {
        beneficiaryId: item.capitalBeneficiaryId!,
        kind: "RETIRADA" as const,
        amount: item.amount,
        date: payable.paymentDate ?? payable.dueDate,
        description: `Cartão de crédito: ${item.description}`,
      };
      if (existingTx) {
        await prisma.capitalTransaction.update({ where: { id: existingTx.id }, data });
      } else {
        await prisma.capitalTransaction.create({ data: { ...data, cardItemId: item.id } });
      }
    } else if (existingTx) {
      await prisma.capitalTransaction.delete({ where: { id: existingTx.id } });
    }
  }
}
