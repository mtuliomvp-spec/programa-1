"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { resolveSupplierByName } from "@/lib/finance";
import { structuralCenterId } from "@/lib/structural";
import { parseDateInput } from "@/lib/format";
import { applyCompetencia, ensureRecurringGenerated } from "@/lib/recurring";
import {
  CASF_DESCRIPTION,
  CASF_SUPPLIER,
  CASF_BENEFICIARIO_NOME,
  CASF_BENEFICIARIO_BUSCA,
  CASF_DAY_OF_MONTH,
  CASF_START_DATE,
  CASF_AMOUNT,
  CASF_FIRST_DOC,
  CASF_NOTES,
} from "./data";

export type ImportResult = {
  ok: boolean;
  recurringCreated: boolean;
  firstTitleCreated: boolean;
  beneficiaryName: string;
  generated: number;
  error?: string;
};

/** Sem acentos e minúsculo, para casar nomes digitados de formas diferentes. */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Cadastra a recorrência do plano CASF — vencimento dia 05, fluxo Capital do
 * Marco Antonio, competência do mês anterior na descrição — e lança o título
 * do boleto de 05/08/2026 (R$ 3.370,17, doc 285819). Idempotente: recorrência
 * já existente (mesma descrição) e título de agosto já lançado não duplicam.
 * Só cria título PENDENTE — não exige caixa aberto nem farol verde.
 */
export async function importPlanoCasfAction(): Promise<ImportResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return {
      ok: false,
      recurringCreated: false,
      firstTitleCreated: false,
      beneficiaryName: "",
      generated: 0,
      error: e instanceof Error ? e.message : "Sem permissão.",
    };
  }

  // Beneficiário do capital: acha o Marco Antonio já cadastrado (busca sem
  // acento/maiúscula) ou cria com o nome completo do boleto.
  const beneficiarios = await prisma.capitalBeneficiary.findMany({
    select: { id: true, name: true },
  });
  let beneficiario = beneficiarios.find((b) => normalize(b.name).includes(CASF_BENEFICIARIO_BUSCA));
  if (!beneficiario) {
    beneficiario = await prisma.capitalBeneficiary.create({
      data: { name: CASF_BENEFICIARIO_NOME },
      select: { id: true, name: true },
    });
  }

  const supplierId = await resolveSupplierByName(CASF_SUPPLIER);
  const startDate = parseDateInput(CASF_START_DATE);
  // Recorrências do Capital geram títulos no centro Administrativo com
  // categoria OUTROS (mesma regra do motor em src/lib/recurring.ts).
  const center = await structuralCenterId("ADMINISTRATIVO");

  // Recorrência: reaproveita pela descrição (o marcador {competencia} é estável).
  let recurringCreated = false;
  let entry = await prisma.recurringEntry.findFirst({
    where: { kind: "PAGAR", description: { equals: CASF_DESCRIPTION, mode: "insensitive" } },
    select: { id: true },
  });
  if (!entry) {
    entry = await prisma.recurringEntry.create({
      data: {
        kind: "PAGAR",
        description: CASF_DESCRIPTION,
        amount: CASF_AMOUNT,
        structuralKey: "CAPITAL",
        capitalBeneficiaryId: beneficiario.id,
        dayOfMonth: CASF_DAY_OF_MONTH,
        categoryPagar: "OUTROS",
        supplierId,
        startDate,
        notes: CASF_NOTES,
      },
      select: { id: true },
    });
    recurringCreated = true;
  }

  // Boleto de 05/08/2026: o motor mensal pode já ter gerado o título de
  // agosto — nesse caso só completa o nº do documento; senão lança aqui.
  let firstTitleCreated = false;
  const existing = await prisma.payable.findFirst({
    where: {
      recurringId: entry.id,
      dueDate: { gte: new Date("2026-08-01T00:00:00Z"), lt: new Date("2026-09-01T00:00:00Z") },
    },
    select: { id: true, documentNumber: true },
  });
  if (!existing) {
    await prisma.payable.create({
      data: {
        costCenterId: center,
        description: applyCompetencia(CASF_DESCRIPTION, startDate),
        category: "OUTROS",
        documentNumber: CASF_FIRST_DOC,
        amount: CASF_AMOUNT,
        dueDate: startDate,
        status: "PENDENTE",
        supplierId,
        capitalBeneficiaryId: beneficiario.id,
        recurringId: entry.id,
        notes: CASF_NOTES,
      },
    });
    firstTitleCreated = true;
  } else if (!existing.documentNumber) {
    await prisma.payable.update({
      where: { id: existing.id },
      data: { documentNumber: CASF_FIRST_DOC },
    });
  }

  // Puxa também as próximas ocorrências já no horizonte (ex.: 05/09).
  const generated = await ensureRecurringGenerated(45);

  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/fornecedores");
  revalidatePath("/capital");
  revalidatePath("/");
  return {
    ok: true,
    recurringCreated,
    firstTitleCreated,
    beneficiaryName: beneficiario.name,
    generated,
  };
}
