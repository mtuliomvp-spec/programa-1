"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { resolveSupplierByName } from "@/lib/finance";
import { structuralCenterId } from "@/lib/structural";
import { parseDateInput } from "@/lib/format";
import { buildRentSchedule, type RentContractParams } from "@/lib/rent-contract";

export type RentContractResult = { ok: boolean; error?: string; created?: number };

/**
 * Gera no Contas a pagar os títulos de um contrato de locação: a caução + os
 * aluguéis (com desconto/carência já refletidos no valor e registrados na
 * observação). Todos PENDENTE. É o "gerar" após o preview.
 */
export async function createRentContractAction(
  locador: string,
  params: RentContractParams,
): Promise<RentContractResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const nome = (locador || "").trim();
  if (!nome) return { ok: false, error: "Informe o locador (fornecedor)." };
  if (!params.primeiroVencimento) return { ok: false, error: "Informe o 1º vencimento." };

  const schedule = buildRentSchedule(params);
  if (schedule.parcelas.length === 0 && !schedule.caucao) {
    return { ok: false, error: "Nada a gerar — confira os parâmetros." };
  }

  try {
    const supplierId = await resolveSupplierByName(nome);
    const admCenterId = await structuralCenterId("ADMINISTRATIVO");

    const data: Prisma.PayableCreateManyInput[] = [];
    if (schedule.caucao) {
      data.push({
        description: `Caução (garantia locatícia) — ${nome}`,
        category: "OUTROS",
        categoryLabel: "Caução",
        amount: schedule.caucao.amount,
        dueDate: parseDateInput(schedule.caucao.date),
        status: "PENDENTE",
        supplierId,
        costCenterId: admCenterId,
        notes: "Garantia locatícia depositada no ato da assinatura (Cl. 4ª).",
      });
    }
    for (const l of schedule.parcelas) {
      data.push({
        description: `Aluguel ${l.competencia} — ${nome}${l.tipo === "CARENCIA" ? " (carência)" : ""}`,
        category: "DESPESA_OPERACIONAL",
        categoryLabel: "Aluguel",
        amount: l.valorPagar,
        dueDate: parseDateInput(l.dueDate),
        status: "PENDENTE",
        supplierId,
        costCenterId: admCenterId,
        notes: l.observacao,
      });
    }

    await prisma.payable.createMany({ data });
    revalidatePath("/financeiro/a-pagar");
    revalidatePath("/financeiro/fluxo-caixa");
    revalidatePath("/");
    return { ok: true, created: data.length };
  } catch {
    return { ok: false, error: "Não foi possível gerar os títulos." };
  }
}
