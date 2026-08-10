"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { resolveSupplierByName } from "@/lib/finance";
import { resolveDespesaCategory } from "@/lib/categories";
import { structuralCenterId } from "@/lib/structural";
import { parseDateInput } from "@/lib/format";
import { syncCardInvoiceDerived } from "@/lib/card-invoice";
import { resolveBeneficiaryIds } from "@/lib/card-flow";
import {
  FATURA_ROWS,
  rowDescription,
  rowBeneficiary,
  CARTAO_NOME,
  CARTAO_FORNECEDOR,
  CARTAO_CATEGORIA,
  CARTAO_DIA_VENCIMENTO,
  CARTAO_PRIMEIRO_VENCIMENTO,
  CARTAO_NOTES,
} from "./data";

export type ImportResult = {
  ok: boolean;
  recurringCreated: boolean;
  payableCreated: boolean;
  itemsCreated: number;
  itemsUpdated: number;
  error?: string;
};

/**
 * Cria a rotina do cartão Santander Unique Visa (final 7574):
 *  1. recorrência mensal (dia 4) marcada como fatura de cartão — só para
 *     registrar o dia do pagamento; valor-base 0;
 *  2. o título de 04/08/2026 com os 53 lançamentos transcritos da fatura, cada
 *     um já no fluxo CAPITAL do sócio definido (Lovable/Anthropic → Agrasty
 *     Construções; cartão 9792 → Marcelo; resto → Marco Túlio);
 *  3. valor do título sincronizado com a soma (R$ 14.870,98).
 * Idempotente: recorrência/título existentes são reaproveitados; lançamentos
 * antigos ainda em Administrativo recebem o mapeamento; os demais não mudam.
 */
export async function importCartaoSantanderAction(): Promise<ImportResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return {
      ok: false,
      recurringCreated: false,
      payableCreated: false,
      itemsCreated: 0,
      itemsUpdated: 0,
      error: e instanceof Error ? e.message : "Sem permissão.",
    };
  }

  const supplierId = await resolveSupplierByName(CARTAO_FORNECEDOR);
  const cat = await resolveDespesaCategory(CARTAO_CATEGORIA);
  const beneficiaryIds = await resolveBeneficiaryIds();
  const center = await structuralCenterId("ADMINISTRATIVO");
  const dueDate = parseDateInput(CARTAO_PRIMEIRO_VENCIMENTO);

  // 1) Recorrência (reaproveita pelo nome).
  let recurringCreated = false;
  let entry = await prisma.recurringEntry.findFirst({
    where: { kind: "PAGAR", description: { equals: CARTAO_NOME, mode: "insensitive" } },
    select: { id: true },
  });
  if (!entry) {
    entry = await prisma.recurringEntry.create({
      data: {
        kind: "PAGAR",
        description: CARTAO_NOME,
        amount: 0,
        structuralKey: "ADMINISTRATIVO",
        dayOfMonth: CARTAO_DIA_VENCIMENTO,
        cardInvoice: true,
        categoryPagar: cat.category,
        categoryLabel: cat.label,
        supplierId,
        startDate: dueDate,
        notes: CARTAO_NOTES,
      },
      select: { id: true },
    });
    recurringCreated = true;
  }

  // 2) Título de agosto/2026 (o gerador automático pode já ter criado um com
  //    valor 0 — nesse caso é reaproveitado).
  let payableCreated = false;
  let payable = await prisma.payable.findFirst({
    where: {
      recurringId: entry.id,
      dueDate: { gte: new Date("2026-08-01T00:00:00Z"), lt: new Date("2026-09-01T00:00:00Z") },
    },
    select: { id: true, _count: { select: { cardItems: true } } },
  });
  if (!payable) {
    const created = await prisma.payable.create({
      data: {
        costCenterId: center,
        description: CARTAO_NOME,
        category: cat.category,
        categoryLabel: cat.label,
        amount: 0,
        dueDate,
        status: "PENDENTE",
        supplierId,
        recurringId: entry.id,
        cardInvoice: true,
        notes: CARTAO_NOTES,
      },
      select: { id: true },
    });
    payable = { id: created.id, _count: { cardItems: 0 } };
    payableCreated = true;
  } else {
    // Garante a marcação de fatura mesmo num título gerado antes do import.
    await prisma.payable.update({ where: { id: payable.id }, data: { cardInvoice: true } });
  }

  // 3) Lançamentos — cada um já no fluxo CAPITAL com o sócio definido pelo
  //    Marco (Lovable/Anthropic → Agrasty; cartão 9792 → Marcelo; resto →
  //    Marco Túlio). Título vazio: cria tudo. Título com lançamentos de uma
  //    rodada anterior (Administrativo): aplica o mapeamento neles.
  let itemsCreated = 0;
  let itemsUpdated = 0;
  if (payable._count.cardItems === 0) {
    await prisma.cardInvoiceItem.createMany({
      data: FATURA_ROWS.map((r) => ({
        payableId: payable.id,
        description: rowDescription(r),
        amount: r.amount,
        structuralKey: "CAPITAL",
        capitalBeneficiaryId: beneficiaryIds[rowBeneficiary(r)],
      })),
    });
    itemsCreated = FATURA_ROWS.length;
  } else {
    const byDescription = new Map(FATURA_ROWS.map((r) => [rowDescription(r), rowBeneficiary(r)]));
    const existing = await prisma.cardInvoiceItem.findMany({
      where: { payableId: payable.id, structuralKey: "ADMINISTRATIVO" },
      select: { id: true, description: true },
    });
    for (const item of existing) {
      const key = byDescription.get(item.description);
      if (!key) continue;
      await prisma.cardInvoiceItem.update({
        where: { id: item.id },
        data: { structuralKey: "CAPITAL", capitalBeneficiaryId: beneficiaryIds[key], vehicleId: null },
      });
      itemsUpdated += 1;
    }
  }
  await syncCardInvoiceDerived(payable.id);

  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/fornecedores");
  revalidatePath("/capital");
  revalidatePath("/");
  return { ok: true, recurringCreated, payableCreated, itemsCreated, itemsUpdated };
}
