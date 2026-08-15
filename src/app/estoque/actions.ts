"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  addVehicleCostWithPayable,
  createVehicleWithPayable,
  deleteVehicleCost,
  detachVehicleCost,
  receiveVehicleAdvance,
} from "@/lib/finance";
import {
  chassiOrNull,
  renavamOrNull,
  normalizeChassi,
  normalizeRenavam,
  isChassiComplete,
} from "@/lib/vehicle-doc";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { assertCan, assertCanAny, canUseFormLookup } from "@/lib/guards";
import { parseDateInput } from "@/lib/format";
import { parseDebtItems } from "@/lib/vehicle-debts";
import { plateKey, plateIdentityKey, plateVariants } from "@/lib/plate";
import { structuralCenterId } from "@/lib/structural";

const advanceSchema = z.object({
  vehicleId: z.string().min(1),
  amount: z.coerce.number().min(0.01, "Informe o valor do sinal"),
  date: z.string().min(1),
  accountId: z.string().optional(),
  customerId: z.string().optional(),
});

export type AdvanceFormState = { error?: string; success?: string };

export async function receiveVehicleAdvanceAction(
  _prev: AdvanceFormState,
  formData: FormData,
): Promise<AdvanceFormState> {
  try {
    await assertCan("estoque", "editar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = advanceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  try {
    await receiveVehicleAdvance({
      vehicleId: d.vehicleId,
      amount: d.amount,
      date: parseDateInput(d.date),
      accountId: d.accountId || null,
      customerId: d.customerId || null,
    });
  } catch {
    return { error: "Não foi possível receber o sinal." };
  }
  revalidatePath(`/estoque/${d.vehicleId}`);
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/");
  return { success: "Sinal recebido." };
}

export async function deleteVehicleAdvanceAction(id: string, vehicleId: string) {
  await assertCan("estoque", "editar");
  // Só remove sinal ainda não vinculado a uma venda.
  await prisma.receivable.deleteMany({ where: { id, saleId: null, vehicleId } });
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}

const vehicleSchema = z.object({
  brand: z.string().min(1, "Informe a marca"),
  model: z.string().min(1, "Informe o modelo"),
  version: z.string().optional(),
  manufactureYear: z.coerce.number().int().min(1950).max(2100),
  modelYear: z.coerce.number().int().min(1950).max(2100),
  plate: z.string().min(1, "Informe a placa"),
  chassi: z.string().optional(),
  renavam: z.string().optional(),
  color: z.string().optional(),
  km: z.coerce.number().int().min(0).default(0),
  fuel: z.string().optional(),
  transmission: z.string().optional(),
  purchasePrice: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0),
  // Consignado: o carro é de um terceiro (o consignante = fornecedor). Não é
  // patrimônio comprado (purchasePrice fica 0); a loja deve `ownerRefundAmount`
  // ao dono quando o carro é vendido.
  consigned: z.coerce.boolean().optional(),
  ownerRefundAmount: z.coerce.number().min(0).optional(),
  entryDate: z.string().min(1),
  notes: z.string().optional(),
  supplierId: z.string().optional(),
  dueDate: z.string().optional(),
  acquisitionType: z.enum(["A_VISTA", "PARCELADO", "FINANCIADO", "CONSORCIO"]).optional(),
  downPayment: z.coerce.number().min(0).optional(),
  installmentsCount: z.coerce.number().int().min(1).max(120).optional(),
  financerName: z.string().optional(),
  payoffAmount: z.coerce.number().min(0).optional(),
  payoffTo: z.string().optional(),
  debtsAmount: z.coerce.number().min(0).optional(),
  // Detalhamento (JSON do formulário): cada linha vira uma conta a pagar.
  debtsItems: z
    .string()
    .optional()
    .transform((v) => parseDebtItems(v)),
});

export type VehicleFormState = { error?: string };

export async function createVehicleAction(
  _prevState: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  try {
    await assertCan("estoque", "criar");
    await assertBooksBalanced();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const raw = Object.fromEntries(formData.entries());
  const parsed = vehicleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;

  // Cadastrar o veículo cria só a ordem de compra (conta a pagar PENDENTE) —
  // não movimenta dinheiro, então não exige caixa aberto. O pagamento é dado
  // depois, em Contas a pagar, por uma conta financeira.

  // Só barra placa repetida entre fichas ATIVAS: um veículo já vendido pode
  // ser recomprado — vira uma nova ficha e o histórico antigo fica intacto.
  // Mercosul: a placa antiga e a nova (2º dígito virou letra) são o MESMO
  // carro — procurar só a grafia digitada deixaria cadastrar a segunda ficha.
  const existing = await prisma.vehicle.findFirst({
    where: { plate: { in: plateVariants(data.plate) }, status: { not: "VENDIDO" } },
    select: { plate: true },
  });
  if (existing) {
    return {
      error:
        existing.plate !== plateKey(data.plate)
          ? `Este carro já está no estoque com a placa ${existing.plate} (mesma placa em outra grafia — Mercosul). Edite a ficha existente para atualizar a placa.`
          : "Esta placa já está no estoque (veículo ativo). Veículos já vendidos podem ser recomprados normalmente.",
    };
  }

  // Chassi também é único entre fichas ATIVAS (índice parcial
  // vehicles_chassi_active_key). Sem esta checagem a colisão estourava no banco
  // e caía no catch genérico "Não foi possível salvar o veículo".
  const chassi = chassiOrNull(data.chassi);
  if (chassi) {
    const sameChassi = await prisma.vehicle.findFirst({
      where: { chassi, status: { not: "VENDIDO" } },
      select: { id: true },
    });
    if (sameChassi) return { error: "Já existe outro veículo ativo no estoque com esse chassi. Confira o número — ele identifica o carro." };
  }

  // Consignado: o veículo é de um terceiro. Exige o consignante (fornecedor) e o
  // valor a devolver; não é patrimônio comprado, então purchasePrice fica 0 (sem
  // conta de compra — a devolução ao dono só é apurada quando o carro é vendido).
  const consigned = Boolean(data.consigned);
  if (consigned) {
    if (!data.supplierId) {
      return { error: "Para um veículo consignado, informe o proprietário (consignante)." };
    }
    if (!data.ownerRefundAmount || data.ownerRefundAmount <= 0) {
      return { error: "Para um veículo consignado, informe o valor acertado com o proprietário." };
    }
    if ((data.payoffAmount ?? 0) + (data.debtsAmount ?? 0) > data.ownerRefundAmount) {
      return { error: "A quitação e os débitos não podem passar do valor acertado com o proprietário." };
    }
  }

  try {
    const vehicle = await createVehicleWithPayable({
      brand: data.brand,
      model: data.model,
      version: data.version || null,
      manufactureYear: data.manufactureYear,
      modelYear: data.modelYear,
      plate: data.plate.toUpperCase(),
      chassi: chassiOrNull(data.chassi),
      renavam: renavamOrNull(data.renavam),
      color: data.color || null,
      km: data.km,
      fuel: data.fuel || null,
      transmission: data.transmission || null,
      purchasePrice: consigned ? 0 : data.purchasePrice,
      salePrice: data.salePrice,
      entryDate: parseDateInput(data.entryDate),
      notes: data.notes || null,
      supplierId: data.supplierId || null,
      alreadyPaid: false,
      dueDate: data.dueDate ? parseDateInput(data.dueDate) : null,
      acquisitionType: consigned ? "A_VISTA" : data.acquisitionType ?? "A_VISTA",
      downPayment: consigned ? 0 : data.downPayment ?? 0,
      installmentsCount: consigned ? 1 : data.installmentsCount ?? 1,
      financerName: consigned ? null : data.financerName || null,
      // Consignado: quitação/débitos são descontados do valor acertado com o dono
      // e viram repasse (contas a pagar aos credores) no fechamento da venda.
      payoffAmount: data.payoffAmount ?? 0,
      payoffTo: data.payoffTo || null,
      debtsAmount: data.debtsAmount ?? 0,
      debtsItems: data.debtsItems,
      consigned,
      ownerRefundAmount: consigned ? data.ownerRefundAmount ?? 0 : 0,
    });
    revalidatePath("/estoque");
    revalidatePath("/financeiro/a-pagar");
    revalidatePath("/");
    redirect(`/estoque/${vehicle.id}`);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    return { error: "Não foi possível salvar o veículo. Tente novamente." };
  }
  return {};
}

const updateSchema = vehicleSchema.extend({ id: z.string().min(1) });

export async function updateVehicleAction(
  _prevState: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  try {
    await assertCan("estoque", "editar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const raw = Object.fromEntries(formData.entries());
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;

  // Mercosul: as duas grafias são o mesmo carro (ver src/lib/plate.ts).
  const existing = await prisma.vehicle.findFirst({
    where: {
      plate: { in: plateVariants(data.plate) },
      status: { not: "VENDIDO" },
      id: { not: data.id },
    },
  });
  if (existing) {
    return { error: "Já existe outro veículo ativo no estoque com essa placa." };
  }

  const chassi = chassiOrNull(data.chassi);
  if (chassi) {
    const sameChassi = await prisma.vehicle.findFirst({
      where: { chassi, status: { not: "VENDIDO" }, id: { not: data.id } },
      select: { id: true },
    });
    if (sameChassi) return { error: "Já existe outro veículo ativo no estoque com esse chassi. Confira o número — ele identifica o carro." };
  }

  const consigned = Boolean(data.consigned);
  if (consigned) {
    if (!data.supplierId) {
      return { error: "Para um veículo consignado, informe o proprietário (consignante)." };
    }
    if (!data.ownerRefundAmount || data.ownerRefundAmount <= 0) {
      return { error: "Para um veículo consignado, informe o valor acertado com o proprietário." };
    }
    if ((data.payoffAmount ?? 0) + (data.debtsAmount ?? 0) > data.ownerRefundAmount) {
      return { error: "A quitação e os débitos não podem passar do valor acertado com o proprietário." };
    }
  }

  try {
    await prisma.vehicle.update({
      where: { id: data.id },
      data: {
        brand: data.brand,
        model: data.model,
        version: data.version || null,
        manufactureYear: data.manufactureYear,
        modelYear: data.modelYear,
        plate: data.plate.toUpperCase(),
        chassi: chassiOrNull(data.chassi),
        renavam: renavamOrNull(data.renavam),
        color: data.color || null,
        km: data.km,
        fuel: data.fuel || null,
        transmission: data.transmission || null,
        purchasePrice: consigned ? 0 : data.purchasePrice,
        salePrice: data.salePrice,
        acquisitionType: consigned ? "A_VISTA" : data.acquisitionType ?? "A_VISTA",
        downPayment: consigned ? 0 : data.downPayment ?? 0,
        installmentsCount: consigned ? 1 : data.installmentsCount ?? 1,
        financerName: consigned ? null : data.financerName || null,
        payoffAmount: data.payoffAmount ?? 0,
        payoffTo: data.payoffTo || null,
        debtsAmount: data.debtsAmount ?? 0,
        debtsItems: data.debtsItems,
        entryDate: parseDateInput(data.entryDate),
        notes: data.notes || null,
        supplierId: data.supplierId || null,
        consigned,
        ownerRefundAmount: consigned ? data.ownerRefundAmount ?? 0 : 0,
      },
    });

    // Regenera as contas a pagar da compra conforme a forma de aquisição,
    // desde que nenhuma parcela da compra já tenha sido paga (senão mantém
    // o que existe para não bagunçar o que já foi liquidado).
    const { regenerateVehicleAcquisitionPayables } = await import("@/lib/finance");
    await regenerateVehicleAcquisitionPayables(data.id);

    revalidatePath("/estoque");
    revalidatePath(`/estoque/${data.id}`);
    revalidatePath("/financeiro/a-pagar");
    revalidatePath("/");
  } catch {
    return { error: "Não foi possível atualizar o veículo." };
  }
  redirect(`/estoque/${data.id}`);
}

export async function setVehicleStatusAction(id: string, status: "ESTOQUE" | "RESERVADO") {
  await assertCan("estoque", "editar");
  await prisma.vehicle.update({ where: { id }, data: { status } });
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${id}`);
  revalidatePath("/");
}

/**
 * Marca (ou desfaz) a conclusão da transferência de propriedade no DETRAN.
 *
 * Enquanto a data é nula, o carro vendido continua no nome do dono anterior —
 * é isso que o selo vermelho do estoque mostra. `date` nula desfaz a marcação
 * (para corrigir engano).
 */
export async function setSaleTransferDoneAction(
  saleId: string,
  date: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCanAny([
      ["estoque", "comunicacao"],
      ["estoque", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const sale = await prisma.sale.findUnique({ where: { id: saleId }, select: { vehicleId: true } });
  if (!sale) return { ok: false, error: "Venda não encontrada." };

  await prisma.sale.update({
    where: { id: saleId },
    data: { transferDoneAt: date ? parseDateInput(date) : null },
  });
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${sale.vehicleId}`);
  revalidatePath(`/vendas/${saleId}`);
  return { ok: true };
}

/**
 * Marca/desmarca MANUALMENTE que o veículo está em processo de transferência no
 * DETRAN — para casos antigos em que a taxa foi paga fora do sistema e não há
 * custo de "transferência" para acender o selo sozinho.
 */
export async function setVehicleTransferInProgressAction(
  vehicleId: string,
  inProgress: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCanAny([
      ["estoque", "comunicacao"],
      ["estoque", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!v) return { ok: false, error: "Veículo não encontrado." };
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { transferInProgress: inProgress } });
  revalidatePath("/estoque");
  revalidatePath(`/estoque/${vehicleId}`);
  return { ok: true };
}

export async function lookupPlateAction(plate: string) {
  // Consulta externa (paga) por placa — usada no cadastro de veículo e nos
  // formulários de venda. Liberada a quem cadastra/edita veículo ou registra/
  // pré-venda; senão recusa sem chamar o provedor.
  if (!(await canUseFormLookup())) {
    return { ok: false as const, error: "Você não tem permissão para consultar a placa." };
  }
  const { lookupPlate } = await import("@/lib/plate-lookup");
  return lookupPlate(plate);
}

export async function fetchVehicleDebtsAction(vehicleId: string) {
  await assertCan("estoque", "debitos");
  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
    select: { plate: true },
  });
  const { lookupVehicleDebts } = await import("@/lib/debts-lookup");
  return lookupVehicleDebts(vehicle.plate);
}

/**
 * Importa débitos consultados pela placa como CUSTO do veículo.
 *
 * Diferente do campo "Débitos do veículo" da compra/troca (ver
 * src/lib/vehicle-debts.ts): lá a dívida é do antigo dono e abate o que a loja
 * paga a ele; aqui o carro já é da loja e o débito venceu com ele no pátio —
 * IPVA do exercício seguinte, multa em test drive. É despesa da loja, então
 * vira VehicleCost e reduz a margem daquele carro. Os dois caminhos coexistem
 * de propósito.
 */
export async function importVehicleDebtsAction(
  vehicleId: string,
  debts: { category: "IPVA" | "MULTA" | "LICENCIAMENTO"; description: string; amount: number; dueDate: string }[],
): Promise<{ imported: number }> {
  await assertCan("estoque", "debitos");
  let imported = 0;
  for (const debt of debts.slice(0, 50)) {
    if (!debt.amount || debt.amount <= 0) continue;
    await addVehicleCostWithPayable({
      vehicleId,
      description: debt.description.slice(0, 180),
      category: debt.category,
      amount: debt.amount,
      date: new Date(),
      alreadyPaid: false,
      dueDate: parseDateInput(debt.dueDate),
      installments: 1,
      notes: "Importado da consulta de débitos (API Placas)",
    });
    imported++;
  }
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  return { imported };
}

const costSchema = z.object({
  vehicleId: z.string().min(1),
  description: z.string().min(1, "Descreva o custo"),
  category: z.enum([
    "PREPARACAO",
    "DOCUMENTACAO",
    "MECANICA",
    "FUNILARIA_PINTURA",
    "ESTETICA",
    "FRETE",
    "IPVA",
    "MULTA",
    "LICENCIAMENTO",
    "OUTROS",
  ]),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  date: z.string().min(1),
  alreadyPaid: z.coerce.boolean().optional(),
  dueDate: z.string().optional(),
  installments: z.coerce.number().int().min(1).max(60).optional(),
  // Pós-venda custeado pelo capital de um sócio (veículo já vendido): a despesa
  // vira aporte do sócio, baixada no Banco Neutro (sem mexer no caixa).
  capitalBeneficiaryId: z.string().optional(),
});

export type CostFormState = { error?: string; success?: boolean };

export async function addVehicleCostAction(
  _prevState: CostFormState,
  formData: FormData,
): Promise<CostFormState> {
  try {
    await assertCan("estoque", "custos");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = costSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;
  const capitalBeneficiaryId = (data.capitalBeneficiaryId || "").trim() || null;

  try {
    await addVehicleCostWithPayable({
      vehicleId: data.vehicleId,
      description: data.description,
      category: data.category,
      amount: data.amount,
      date: parseDateInput(data.date),
      alreadyPaid: Boolean(data.alreadyPaid),
      dueDate: data.dueDate ? parseDateInput(data.dueDate) : null,
      // No custeio por capital não há parcelamento: o sócio banca o valor cheio.
      installments: capitalBeneficiaryId ? 1 : data.installments ?? 1,
      capitalBeneficiaryId,
    });
  } catch (e) {
    // A rotina de capital valida veículo vendido / sócio ativo — repassa a
    // mensagem para o usuário entender o motivo.
    return { error: e instanceof Error ? e.message : "Não foi possível lançar o custo. Tente novamente." };
  }
  revalidatePath(`/estoque/${data.vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  return { success: true };
}

export async function deleteVehicleCostAction(costId: string, vehicleId: string) {
  await assertCan("estoque", "custos");
  await deleteVehicleCost(costId);
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
}

/** Remove o custo do veículo mantendo a conta a pagar (volta ao a-pagar, Administrativo). */
export async function detachVehicleCostAction(costId: string, vehicleId: string) {
  await assertCan("estoque", "custos");
  await detachVehicleCost(costId);
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Documentos anexados ao veículo (ex.: Comunicação de venda)
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export type AttachmentState = {
  error?: string;
  ok?: boolean;
  /** O que a leitura do CRLV preencheu na ficha (texto pronto para a tela). */
  filled?: string[];
  /** Avisos da leitura (placa divergente, chassi duplicado, IA indisponível). */
  warnings?: string[];
};


/**
 * Lê o CRLV recém-anexado e preenche o que falta na ficha do veículo.
 *
 * Regra de ouro: nunca sobrescrever dado bom. Só entra o que está vazio — a
 * exceção é o chassi MASCARADO da consulta por placa (`*****80388`), que é
 * substituído pelos 17 caracteres do documento.
 *
 * Antes de gravar qualquer coisa, a PLACA do documento tem de bater com a do
 * veículo. É o que impede o chassi de um carro entrar na ficha de outro — um
 * chassi errado passaria na trava da venda e sairia impresso no contrato.
 */
async function applyCrlvToVehicle(input: {
  vehicleId: string;
  attachmentId: string;
  base64: string;
  mimeType: string;
  /** Ano do exercício digitado pelo usuário ao anexar. */
  typedYear: string | null;
}): Promise<{ filled: string[]; warnings: string[] }> {
  const { extractCrlv } = await import("@/lib/crlv-ai");
  const crlv = await extractCrlv(input.base64, input.mimeType);

  const vehicle = await prisma.vehicle.findUniqueOrThrow({
    where: { id: input.vehicleId },
    select: {
      plate: true, chassi: true, renavam: true, brand: true, model: true,
      manufactureYear: true, modelYear: true, color: true, fuel: true, transmission: true,
      docOwnerName: true,
    },
  });

  const filled: string[] = [];
  const warnings: string[] = [];

  const lida = plateKey(crlv.placa);
  if (!lida) {
    return { filled, warnings: ["Não deu para ler a placa neste CRLV — nada foi preenchido. Confira se o arquivo está legível."] };
  }
  // Mercosul: PSK4673 e PSK4G73 são O MESMO carro (o 2º dígito virou letra).
  // Comparar pela identidade evita o falso "CRLV de outro carro" quando o
  // documento novo chega em Mercosul e a ficha ainda tem a placa antiga.
  if (plateIdentityKey(lida) !== plateIdentityKey(vehicle.plate)) {
    return {
      filled,
      warnings: [
        `Este CRLV parece ser de outro carro (placa ${lida}, o veículo é ${vehicle.plate}). Nada foi preenchido — o anexo continua salvo.`,
      ],
    };
  }
  const data: Record<string, unknown> = {};

  // Mesma placa em grafia nova (o carro trocou para Mercosul): a ficha adota a
  // do documento — é a que vale daqui em diante, e as buscas acham as duas.
  if (lida !== plateKey(vehicle.plate)) {
    data.plate = lida;
    filled.push(`placa ${lida} (Mercosul)`);
  }

  const renavam = normalizeRenavam(crlv.renavam);
  if (renavam && !normalizeRenavam(vehicle.renavam)) {
    data.renavam = renavam;
    filled.push(`RENAVAM ${renavam}`);
  }

  const chassi = normalizeChassi(crlv.chassi);
  if (chassi && !isChassiComplete(vehicle.chassi)) {
    if (!isChassiComplete(chassi)) {
      warnings.push("O chassi do CRLV não veio com os 17 caracteres — preencha à mão na ficha.");
    } else {
      // Chassi é único entre fichas ativas (vehicles_chassi_active_key).
      const outro = await prisma.vehicle.findFirst({
        where: { chassi, status: { not: "VENDIDO" }, id: { not: input.vehicleId } },
        select: { plate: true },
      });
      if (outro) {
        warnings.push(`O chassi lido já está no veículo ${outro.plate} — confira o número, não foi gravado.`);
      } else {
        data.chassi = chassi;
        filled.push(`chassi ${chassi}`);
      }
    }
  }

  // Dados do carro: só o que estiver em branco.
  const texto = (atual: string | null, novo: string | null) =>
    !atual?.trim() && novo?.trim() ? novo.trim() : undefined;
  const cor = texto(vehicle.color, crlv.cor);
  if (cor) { data.color = cor; filled.push(`cor ${cor}`); }
  const fuel = texto(vehicle.fuel, crlv.combustivel);
  if (fuel) { data.fuel = fuel; filled.push(`combustível ${fuel}`); }
  const transmission = texto(vehicle.transmission, crlv.transmissao);
  if (transmission) { data.transmission = transmission; filled.push(`câmbio ${transmission}`); }
  const brand = texto(vehicle.brand, crlv.marca);
  if (brand) { data.brand = brand; filled.push(`marca ${brand}`); }
  const model = texto(vehicle.model, crlv.modelo);
  if (model) { data.model = model; filled.push(`modelo ${model}`); }
  if (!vehicle.manufactureYear && crlv.anoFabricacao) {
    data.manufactureYear = crlv.anoFabricacao;
    filled.push(`ano de fabricação ${crlv.anoFabricacao}`);
  }
  if (!vehicle.modelYear && crlv.anoModelo) {
    data.modelYear = crlv.anoModelo;
    filled.push(`ano do modelo ${crlv.anoModelo}`);
  }

  // Em nome de quem o veículo está: diferente dos demais campos (que só entram
  // em branco), o proprietário SOBRESCREVE — o último CRLV lido é a verdade
  // (ex.: transferência concluída, novo documento no nome da loja/sócio).
  const proprietario = (crlv.proprietario ?? "").trim();
  if (proprietario && proprietario !== (vehicle.docOwnerName ?? "").trim()) {
    data.docOwnerName = proprietario;
    filled.push(`proprietário ${proprietario}`);
  }

  if (Object.keys(data).length) {
    await prisma.vehicle.update({ where: { id: input.vehicleId }, data });
  }

  // Exercício: o documento é a fonte da verdade. O ano vive no `description` do
  // anexo (é dele que sai o selo "CRLV 2026" na lista).
  const exercicio = (crlv.exercicio ?? "").match(/(\d{4})/)?.[1] ?? null;
  if (exercicio && exercicio !== input.typedYear) {
    await prisma.vehicleAttachment.update({
      where: { id: input.attachmentId },
      data: { description: `CRLV ${exercicio}` },
    });
    warnings.push(
      `O documento é do exercício ${exercicio}${input.typedYear ? ` (você digitou ${input.typedYear})` : ""} — corrigido para o do arquivo.`,
    );
  }

  return { filled, warnings };
}

export async function uploadVehicleAttachmentAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  const { getSessionUser } = await import("@/lib/auth");
  const user = await getSessionUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  // Só documentos comuns ou o CRLV passam por aqui (fotos têm ação própria).
  // Cada tipo tem sua permissão granular: CRLV → estoque.crlv; documentos/
  // comunicação de venda → estoque.comunicacao.
  const kind = String(formData.get("kind") || "") === "CRLV" ? "CRLV" : "DOCUMENTO";
  try {
    await assertCan("estoque", kind === "CRLV" ? "crlv" : "comunicacao");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const vehicleId = String(formData.get("vehicleId") || "").trim();
  const description = String(formData.get("description") || "").trim() || "Comunicação de venda";
  const file = formData.get("file");
  if (!vehicleId) return { error: "Veículo inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "Arquivo muito grande (máximo 15 MB)." };
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!vehicle) return { error: "Veículo não encontrado." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const attachment = await prisma.vehicleAttachment.create({
    data: {
      vehicleId,
      kind,
      description,
      filename: file.name || "documento",
      mimeType,
      size: file.size,
      data: buffer,
    },
  });

  // O CRLV é lido DEPOIS de o anexo estar salvo, e a leitura nunca derruba o
  // upload: se a IA falhar, o documento continua anexado e o usuário preenche
  // à mão. Por isso o try/catch só afeta a mensagem devolvida.
  let read: { filled: string[]; warnings: string[] } = { filled: [], warnings: [] };
  if (kind === "CRLV") {
    try {
      read = await applyCrlvToVehicle({
        vehicleId,
        attachmentId: attachment.id,
        base64: buffer.toString("base64"),
        mimeType,
        typedYear: description.match(/(\d{4})/)?.[1] ?? null,
      });
    } catch (e) {
      read = {
        filled: [],
        warnings: [e instanceof Error ? e.message : "Não foi possível ler o CRLV automaticamente."],
      };
    }
  }

  revalidatePath(`/estoque/${vehicleId}`);
  // A lista mostra o selo do CRLV e os dados do carro — sem isto o card ficava
  // defasado até outra revalidação.
  revalidatePath("/estoque");
  return { ok: true, filled: read.filled, warnings: read.warnings };
}

/**
 * Anexa um BOLETO/GUIA (IPVA, multa, licenciamento, quitação) ao veículo e
 * tenta CASAR o valor lido com os descontos da negociação, aplicando as regras
 * já existentes de desconto/acréscimo:
 *
 *  - CONSIGNADO VENDIDO (títulos de repasse pendentes): o título de
 *    quitação/débitos correspondente é ajustado para o valor do boleto e a
 *    diferença flui para a Devolução ao proprietário (guia mais barata → sobra
 *    mais para o dono) — a mesma regra da edição manual, válida para quitação
 *    E débitos. Vencimento do título acompanha o boleto.
 *  - COMPRA (não consignado), sem pagamento feito: quitação → atualiza o
 *    payoffAmount do veículo; débito → atualiza a guia correspondente do
 *    detalhamento (debtsItems). Os títulos regeneram do cadastro e a regra
 *    guias × acordado lança o custo de ajuste (acréscimo/desconto) sozinha.
 *  - Nos demais casos (sem título/guia correspondente, compra já paga), o
 *    boleto fica anexado e a leitura vira aviso com orientação.
 */

/** Descrição-marca do título de débitos lançado na compra/no fechamento. */
const DEBITOS_MAE_PREFIX = "Débitos do veículo (repasse)";

/** Rótulo curto do boleto para mensagens e nome do anexo. */
function tipoLabelOf(b: { tipo: string | null; descricao: string | null }): string {
  return b.tipo === "QUITACAO" ? "Quitação de financiamento" : b.descricao || b.tipo || "guia";
}

/**
 * Anexa BOLETOS/GUIAS (IPVA, multas, licenciamento, quitação) ao veículo, lê
 * cada um por IA e casa com o que foi DESCONTADO na negociação, aplicando a
 * regra acertada: o descontado é a âncora e não muda; a diferença é da loja —
 * acréscimo é perda (custo do veículo), desconto é ganho (custo negativo).
 *
 * GUIAS (não-quitação) — o título "Débitos do veículo (repasse)" é tratado
 * como SALDO A IDENTIFICAR, não como um valor a sobrescrever. Cada boleto vira
 * um título próprio (pagável separadamente, com o seu vencimento) e abate esse
 * saldo:
 *  - sobrou saldo → o título-mãe continua, menor, esperando as guias que ainda
 *    faltam; nada vira custo (o total não mudou);
 *  - saldo zerou  → o título-mãe é excluído;
 *  - passou do saldo → título-mãe excluído e o excesso vira custo do veículo.
 * Isso é o que permite anexar os boletos em VÁRIAS levas (um arquivo por vez)
 * sem que um upload atropele o anterior. Quando não vierem mais guias, o botão
 * "encerrar" (encerrarDebitosVeiculoAction) transforma a sobra em ganho.
 * Sem título-mãe (já consumido), cada guia nova é gasto ALÉM do descontado:
 * nasce o título e o mesmo valor entra como custo.
 *
 * QUITAÇÃO — ajusta o título de quitação pendente para o valor do boleto e
 * lança a diferença como custo de ajuste (mesma regra).
 */
export async function uploadVehicleBoletoAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  const { getSessionUser } = await import("@/lib/auth");
  const user = await getSessionUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  try {
    await assertCan("estoque", "comunicacao");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const vehicleId = String(formData.get("vehicleId") || "").trim();
  const file = formData.get("file");
  if (!vehicleId) return { error: "Veículo inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "Arquivo muito grande (máximo 15 MB)." };

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true, brand: true, model: true, plate: true, status: true, consigned: true,
      payoffAmount: true, payoffActualAmount: true,
    },
  });
  if (!vehicle) return { error: "Veículo não encontrado." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const attachment = await prisma.vehicleAttachment.create({
    data: {
      vehicleId,
      kind: "DOCUMENTO",
      description: "Boleto",
      filename: file.name || "boleto",
      mimeType,
      size: file.size,
      data: buffer,
    },
  });

  const filled: string[] = [];
  const warnings: string[] = [];
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const label = `${vehicle.brand} ${vehicle.model} - placa ${vehicle.plate}`;

  // Como no CRLV: a leitura roda DEPOIS do anexo salvo e nunca derruba o
  // upload — falhou a IA, o boleto continua anexado e o ajuste é manual.
  try {
    const { extractBoletos } = await import("@/lib/boleto-ai");
    const { AJUSTE_DEBITOS_DESC, AJUSTE_QUITACAO_DESC } = await import("@/lib/vehicle-debts");
    const boletos = await extractBoletos(buffer.toString("base64"), mimeType);
    if (!boletos.length) {
      warnings.push("Nenhum boleto foi reconhecido neste arquivo — anexado sem casamento automático.");
    }

    // Nome do anexo resume o que foi lido (aparece na lista de boletos).
    const resumo = boletos
      .map((b) => [b.descricao || tipoLabelOf(b), b.valor ? brl(round2(b.valor)) : null].filter(Boolean).join(" — "))
      .join(" · ");
    await prisma.vehicleAttachment.update({
      where: { id: attachment.id },
      data: {
        description: resumo
          ? `Boleto${boletos.length > 1 ? `s (${boletos.length})` : ""}: ${resumo}`.slice(0, 500)
          : "Boleto",
      },
    });

    /** Valor a lançar: em MULTA vale o valor com desconto até o vencimento. */
    const valorDe = (b: (typeof boletos)[number]): number | null => {
      const lido = b.valor && b.valor > 0 ? round2(b.valor) : null;
      if (lido == null) return null;
      // Fora da multa não existe desconto por pontualidade: se a leitura trouxer
      // um valor "com desconto" numa guia de IPVA/licenciamento/taxa/quitação,
      // é engano — vale o valor CHEIO do documento.
      return b.tipo !== "MULTA" && b.valorSemDesconto && b.valorSemDesconto > lido
        ? round2(b.valorSemDesconto)
        : lido;
    };
    const vencDe = (b: (typeof boletos)[number]): Date | null =>
      b.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(b.vencimento) ? parseDateInput(b.vencimento) : null;

    for (const b of boletos) {
      if (valorDe(b) == null) {
        warnings.push(`${tipoLabelOf(b)}: não deu para ler o valor — este boleto ficou só anexado.`);
      }
    }

    // ---------------- GUIAS (IPVA, multa, licenciamento, taxa) -------------
    const guias = boletos.filter((b) => b.tipo !== "QUITACAO" && valorDe(b) != null);
    if (guias.length) {
      const mae = await prisma.payable.findFirst({
        where: {
          vehicleId,
          category: "COMPRA_VEICULO",
          status: { not: "PAGO" },
          description: { startsWith: DEBITOS_MAE_PREFIX },
        },
        select: { id: true, amount: true, dueDate: true, supplierId: true, costCenterId: true, paymentComboId: true },
      });
      if (mae?.paymentComboId) {
        warnings.push(
          "O título de débitos está num combo de pagamento — remova-o do combo para as guias serem lançadas separadamente.",
        );
      } else {
        const soma = round2(guias.reduce((acc, b) => acc + (valorDe(b) as number), 0));
        const saldoAntes = mae ? round2(mae.amount) : 0;
        const saldoDepois = round2(saldoAntes - soma);
        // Excesso sobre o saldo (ou a guia inteira, quando não há mais saldo):
        // dinheiro que a loja paga ALÉM do descontado → custo do veículo.
        const excesso = mae ? Math.max(0, -saldoDepois) : soma;

        await prisma.$transaction(async (tx) => {
          for (const b of guias) {
            await tx.payable.create({
              data: {
                description: `Débitos do veículo: ${b.descricao || tipoLabelOf(b)} ${label}`.slice(0, 300),
                category: "COMPRA_VEICULO",
                amount: valorDe(b) as number,
                dueDate: vencDe(b) ?? mae?.dueDate ?? new Date(),
                status: "PENDENTE",
                vehicleId,
                supplierId: mae?.supplierId ?? null,
                costCenterId: mae?.costCenterId ?? (await structuralCenterId("VEICULOS")),
              },
            });
          }
          if (mae) {
            if (saldoDepois > 0.005) {
              // Ainda faltam guias: o título-mãe continua, menor.
              await tx.payable.update({ where: { id: mae.id }, data: { amount: saldoDepois } });
            } else {
              await tx.payable.delete({ where: { id: mae.id } });
            }
          }
          if (excesso > 0.005) {
            await tx.vehicleCost.create({
              data: {
                vehicleId,
                description: AJUSTE_DEBITOS_DESC,
                category: "OUTROS",
                amount: excesso,
                date: new Date(),
                postSale: false,
                notes: `Guias acima do descontado na negociação (${brl(excesso)}).`,
              },
            });
          }
        });

        const nomes = guias.map((b) => b.descricao || tipoLabelOf(b)).join(", ");
        filled.push(
          `${guias.length} guia(s) lançada(s) como título próprio (${nomes}) somando ${brl(soma)}`,
        );
        if (mae && saldoDepois > 0.005) {
          filled.push(
            `o título "Débitos do veículo (repasse)" baixou de ${brl(saldoAntes)} para ${brl(saldoDepois)} — é o que falta identificar. Anexe as demais guias; se não houver mais, use "Encerrar débitos" abaixo para a sobra reduzir o custo do veículo.`,
          );
        } else if (mae && Math.abs(saldoDepois) <= 0.005) {
          filled.push(`as guias fecharam exatamente o descontado (${brl(saldoAntes)}) — título de débitos encerrado`);
        } else if (excesso > 0.005) {
          filled.push(`${brl(excesso)} acima do descontado entrou como custo do veículo`);
        }
      }
    }

    // ---------------- QUITAÇÃO DO FINANCIAMENTO ----------------------------
    for (const b of boletos.filter((x) => x.tipo === "QUITACAO" && valorDe(x) != null)) {
      const valor = valorDe(b) as number;
      const due = vencDe(b);
      const titulo = await prisma.payable.findFirst({
        where: {
          vehicleId,
          category: "COMPRA_VEICULO",
          status: { not: "PAGO" },
          description: { startsWith: "Quitação do financiamento" },
        },
        select: { id: true, amount: true },
      });
      if (!titulo) {
        warnings.push(
          "Não há título de quitação pendente para casar — o boleto ficou anexado; ajuste manualmente se precisar.",
        );
        continue;
      }
      const delta = round2(valor - titulo.amount);
      if (Math.abs(delta) <= 0.005) {
        if (due) await prisma.payable.update({ where: { id: titulo.id }, data: { dueDate: due } });
        filled.push(`quitação confere com o título pendente (${brl(titulo.amount)})${due ? " — vencimento atualizado" : ""}`);
        continue;
      }
      await prisma.$transaction([
        prisma.payable.update({
          where: { id: titulo.id },
          data: { amount: valor, ...(due ? { dueDate: due } : {}) },
        }),
        prisma.vehicleCost.create({
          data: {
            vehicleId,
            description: AJUSTE_QUITACAO_DESC,
            category: "OUTROS",
            amount: delta,
            date: new Date(),
            postSale: false,
            notes: `Boleto ${brl(valor)} · acordado ${brl(titulo.amount)}.`,
          },
        }),
      ]);
      filled.push(
        delta > 0
          ? `quitação ajustada para ${brl(valor)} — ${brl(delta)} entrou como custo do veículo`
          : `quitação ajustada para ${brl(valor)} — ${brl(-delta)} reduziu o custo do veículo`,
      );
    }

    // Multa com desconto por pontualidade: avisa o prazo (o valor lançado é o
    // com desconto; perdendo a data, o título precisa voltar ao cheio).
    for (const b of boletos) {
      const v = valorDe(b);
      if (b.tipo === "MULTA" && v != null && b.valorSemDesconto && b.valorSemDesconto > v) {
        warnings.push(
          `${tipoLabelOf(b)}: lançada por ${brl(v)}, valor válido para pagamento ATÉ o vencimento (com o desconto de 20%). Pagando depois, volta para ${brl(round2(b.valorSemDesconto))}.`,
        );
      }
    }
  } catch (e) {
    warnings.push(e instanceof Error ? e.message : "Não foi possível ler o boleto automaticamente.");
  }

  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-pagar");
  return { ok: true, filled, warnings };
}

/**
 * Encerra o saldo do título "Débitos do veículo (repasse)": as guias reais
 * somaram MENOS que o descontado na negociação e não virão outras. O título
 * remanescente é excluído e a sobra vira GANHO — custo negativo do veículo,
 * pela regra acertada (desconto é ganho da loja).
 */
/**
 * REFAZER os débitos do veículo: desfaz o casamento das guias e volta ao ponto
 * de partida — um único título "Débitos do veículo (repasse)" com o valor
 * DESCONTADO na negociação (o campo "Débitos do veículo" da ficha).
 *
 * Serve para corrigir um casamento que saiu errado (guias faltando, ajustes
 * duplicados) sem precisar recriar o título na mão: apaga os títulos de débitos
 * PENDENTES deste veículo — o pai e as guias — junto dos custos de ajuste
 * ("Ajuste de débitos"), e recria o título único.
 *
 * Nunca mexe no que já foi PAGO: se qualquer título de débitos estiver pago (ou
 * dentro de um combo), a rotina recusa e explica — desfazer ali exigiria
 * estornar dinheiro, decisão que é do usuário.
 *
 * Os boletos anexados NÃO são apagados (são documentos): para recasar, exclua e
 * anexe de novo, ou anexe os que faltavam.
 */
export async function refazerDebitosVeiculoAction(
  vehicleId: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    await assertCan("estoque", "comunicacao");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, brand: true, model: true, plate: true, debtsAmount: true, entryDate: true },
  });
  if (!vehicle) return { ok: false, error: "Veículo não encontrado." };
  const descontado = Math.round((vehicle.debtsAmount ?? 0) * 100) / 100;

  const titulos = await prisma.payable.findMany({
    where: {
      vehicleId,
      category: "COMPRA_VEICULO",
      description: { startsWith: "Débitos do veículo" },
    },
    select: { id: true, amount: true, status: true, dueDate: true, supplierId: true, costCenterId: true, paymentComboId: true, description: true },
  });
  const pago = titulos.find((t) => t.status === "PAGO");
  if (pago) {
    return {
      ok: false,
      error: `O título "${pago.description.slice(0, 60)}" já está PAGO — refazer apagaria um pagamento. Reverta a baixa antes, se for o caso.`,
    };
  }
  const emCombo = titulos.find((t) => t.paymentComboId);
  if (emCombo) {
    return {
      ok: false,
      error: `O título "${emCombo.description.slice(0, 60)}" está num combo de pagamento. Remova-o do combo antes de refazer.`,
    };
  }

  const { AJUSTE_DEBITOS_DESC } = await import("@/lib/vehicle-debts");
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  // Data e credor do título recriado: os do título mais antigo que existia
  // (preserva o vencimento combinado na compra); sem nenhum, a entrada do carro.
  const base = [...titulos].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
  const label = `${vehicle.brand} ${vehicle.model} - placa ${vehicle.plate}`;

  const removidos = titulos.length;
  const custosRemovidos = await prisma.vehicleCost.count({
    where: { vehicleId, payableId: null, description: AJUSTE_DEBITOS_DESC },
  });

  await prisma.$transaction(async (tx) => {
    if (titulos.length) {
      await tx.payable.deleteMany({ where: { id: { in: titulos.map((t) => t.id) } } });
    }
    await tx.vehicleCost.deleteMany({
      where: { vehicleId, payableId: null, description: AJUSTE_DEBITOS_DESC },
    });
    if (descontado > 0.005) {
      await tx.payable.create({
        data: {
          description: `Débitos do veículo (repasse) ${label}`,
          category: "COMPRA_VEICULO",
          amount: descontado,
          dueDate: base?.dueDate ?? vehicle.entryDate,
          status: "PENDENTE",
          vehicleId,
          supplierId: base?.supplierId ?? null,
          costCenterId: base?.costCenterId ?? veiculosCenterId,
        },
      });
    }
  });

  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-pagar");
  const brlv = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return {
    ok: true,
    message:
      descontado > 0.005
        ? `Débitos refeitos: ${removidos} título(s) e ${custosRemovidos} ajuste(s) removidos; título único de ${brlv(descontado)} recriado. Anexe os boletos de novo para recasar.`
        : `Débitos limpos: ${removidos} título(s) e ${custosRemovidos} ajuste(s) removidos (a ficha não tem valor de débitos descontado).`,
  };
}

export async function encerrarDebitosVeiculoAction(
  vehicleId: string,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    await assertCan("estoque", "comunicacao");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const mae = await prisma.payable.findFirst({
    where: {
      vehicleId,
      category: "COMPRA_VEICULO",
      status: { not: "PAGO" },
      description: { startsWith: DEBITOS_MAE_PREFIX },
    },
    select: { id: true, amount: true, paymentComboId: true },
  });
  if (!mae) return { ok: false, error: "Não há saldo de débitos a encerrar neste veículo." };
  if (mae.paymentComboId) {
    return { ok: false, error: "Este título está num combo de pagamento. Remova-o do combo antes de encerrar." };
  }
  const { AJUSTE_DEBITOS_DESC } = await import("@/lib/vehicle-debts");
  const sobra = Math.round(mae.amount * 100) / 100;
  await prisma.$transaction([
    prisma.payable.delete({ where: { id: mae.id } }),
    prisma.vehicleCost.create({
      data: {
        vehicleId,
        description: AJUSTE_DEBITOS_DESC,
        category: "OUTROS",
        amount: -sobra,
        date: new Date(),
        postSale: false,
        notes: `Sobra do descontado na negociação: as guias reais somaram ${sobra.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} a menos.`,
      },
    }),
  ]);
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/financeiro/a-pagar");
  return {
    ok: true,
    message: `Débitos encerrados: ${sobra.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} reduziram o custo do veículo.`,
  };
}

/**
 * Lê um CRLV que JÁ está anexado e aplica os dados na ficha.
 *
 * A leitura automática só dispara no upload, então os CRLVs anexados antes
 * dessa funcionalidade nunca foram lidos. Excluir e reenviar resolveria, mas
 * destruiria o registro original (data de envio, arquivo) à toa: os bytes já
 * estão no banco e podem ser lidos de onde estão.
 *
 * Reusa `applyCrlvToVehicle` — mesma trava de placa, mesma regra de não
 * sobrescrever dado bom. Só muda de onde vêm os bytes.
 */
export async function readCrlvAttachmentAction(attachmentId: string): Promise<AttachmentState> {
  try {
    await assertCan("estoque", "crlv");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const att = await prisma.vehicleAttachment.findUnique({
    where: { id: attachmentId },
    select: { id: true, vehicleId: true, kind: true, mimeType: true, description: true, data: true },
  });
  if (!att) return { error: "Anexo não encontrado." };
  if (att.kind !== "CRLV") return { error: "Este anexo não é um CRLV." };

  try {
    const read = await applyCrlvToVehicle({
      vehicleId: att.vehicleId,
      attachmentId: att.id,
      base64: Buffer.from(att.data).toString("base64"),
      mimeType: att.mimeType,
      typedYear: att.description.match(/(\d{4})/)?.[1] ?? null,
    });
    revalidatePath(`/estoque/${att.vehicleId}`);
    revalidatePath("/estoque");
    return { ok: true, filled: read.filled, warnings: read.warnings };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível ler o CRLV." };
  }
}

export async function deleteVehicleAttachmentAction(id: string, vehicleId: string) {
  // A permissão depende do tipo do anexo (a mesma ação serve fotos, documentos
  // e CRLV): CRLV → estoque.crlv; documentos → estoque.comunicacao; fotos →
  // estoque.editar.
  const att = await prisma.vehicleAttachment.findUnique({ where: { id }, select: { kind: true } });
  if (!att) return;
  const action = att.kind === "CRLV" ? "crlv" : att.kind === "DOCUMENTO" ? "comunicacao" : "editar";
  await assertCan("estoque", action);
  await prisma.vehicleAttachment.deleteMany({ where: { id, vehicleId } });
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
}

/**
 * Posta/remove o veículo da vitrine pública. Postar exige veículo em ESTOQUE e
 * ao menos uma foto (é o anúncio que o cliente vê na internet).
 */
export async function toggleVehiclePublishedAction(
  vehicleId: string,
  publish: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("estoque", "publicar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, status: true },
  });
  if (!vehicle) return { ok: false, error: "Veículo não encontrado." };
  if (publish) {
    if (vehicle.status !== "ESTOQUE") {
      return { ok: false, error: "Só veículos em estoque podem ser postados na vitrine." };
    }
    const fotos = await prisma.vehicleAttachment.count({
      where: { vehicleId, kind: "FOTO_VEICULO" },
    });
    if (fotos === 0) return { ok: false, error: "Anexe ao menos uma foto antes de postar." };
  }
  await prisma.vehicle.update({
    where: { id: vehicleId },
    // Ao postar, marca a data (selo "Chegou agora" na vitrine nos primeiros dias).
    data: { published: publish, ...(publish ? { publishedAt: new Date() } : {}) },
  });
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/vitrine");
  revalidatePath(`/vitrine/${vehicleId}`);
  return { ok: true };
}

/**
 * Fotos do veículo: aceita várias imagens de uma vez e grava cada uma como
 * anexo FOTO_VEICULO no prontuário (mesma tabela — entram no backup e são
 * servidas por /anexos/[id]).
 */
export async function uploadVehiclePhotosAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  try {
    await assertCan("estoque", "editar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const vehicleId = String(formData.get("vehicleId") || "").trim();
  if (!vehicleId) return { error: "Veículo inválido." };
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!vehicle) return { error: "Veículo não encontrado." };

  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Selecione ao menos uma foto." };
  for (const file of files) {
    if (!file.type.startsWith("image/")) return { error: `"${file.name}" não é uma imagem.` };
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { error: `"${file.name}" é muito grande (máximo 15 MB por foto).` };
    }
  }

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    await prisma.vehicleAttachment.create({
      data: {
        vehicleId,
        kind: "FOTO_VEICULO",
        description: "Foto do veículo",
        filename: file.name || "foto.jpg",
        mimeType: file.type || "image/jpeg",
        size: file.size,
        data: buffer,
      },
    });
  }
  revalidatePath(`/estoque/${vehicleId}`);
  return { ok: true };
}

/** Coordenada válida ou null (aceita string vazia / fora de faixa → null). */
function parseCoord(value: FormDataEntryValue | null, max: number): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > max) return null;
  return n;
}

/**
 * Anexa a "Foto do cliente" (antifraude) ao prontuário do veículo, com a
 * geolocalização do momento da captura. Mesma tabela dos documentos, então já
 * aparece na listagem e entra no backup. A imagem já vem carimbada do cliente.
 */
export async function uploadClientPhotoAction(
  _prev: AttachmentState,
  formData: FormData,
): Promise<AttachmentState> {
  const { getSessionUser } = await import("@/lib/auth");
  const user = await getSessionUser();
  if (!user) return { error: "Sessão expirada. Faça login novamente." };
  try {
    // Também vale para o fluxo de vendas/financiamento de terceiros (vendedor
    // fotografa o cliente na negociação, sem precisar de estoque.editar).
    await assertCanAny([
      ["estoque", "editar"],
      ["vendas", "prevenda"],
      ["vendas", "registrar"],
      ["vendas", "foto"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const vehicleId = String(formData.get("vehicleId") || "").trim();
  const description = String(formData.get("description") || "").trim() || "Foto do cliente (comprador)";
  const file = formData.get("file");
  if (!vehicleId) return { error: "Veículo inválido." };
  if (!(file instanceof File) || file.size === 0) return { error: "Tire ou selecione uma foto." };
  if (!file.type.startsWith("image/")) return { error: "O anexo precisa ser uma imagem." };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: "Foto muito grande (máximo 15 MB)." };
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true } });
  if (!vehicle) return { error: "Veículo não encontrado." };

  const latitude = parseCoord(formData.get("latitude"), 90);
  const longitude = parseCoord(formData.get("longitude"), 180);
  const geoAccuracy = parseCoord(formData.get("geoAccuracy"), Number.MAX_SAFE_INTEGER);
  const address = String(formData.get("address") || "").trim().slice(0, 300) || null;

  const buffer = Buffer.from(await file.arrayBuffer());
  await prisma.vehicleAttachment.create({
    data: {
      vehicleId,
      kind: "FOTO_CLIENTE",
      description,
      filename: file.name || "foto-cliente.jpg",
      mimeType: file.type || "image/jpeg",
      size: file.size,
      data: buffer,
      latitude,
      longitude,
      geoAccuracy,
      address,
    },
  });
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque");
  revalidatePath("/vendas");
  return { ok: true };
}

export async function deleteVehicleAction(id: string) {
  await assertCan("estoque", "excluir");
  const sale = await prisma.sale.findFirst({ where: { vehicleId: id, status: { not: "CANCELADA" } } });
  if (sale) {
    throw new Error("Não é possível excluir um veículo que já possui venda registrada.");
  }
  // Remove tudo que depende do veículo para a exclusão não falhar por vínculo
  // (custos, adiantamentos/recebíveis, contas a pagar).
  await prisma.vehicleCost.deleteMany({ where: { vehicleId: id } });
  await prisma.receivable.deleteMany({ where: { vehicleId: id } });
  await prisma.payable.deleteMany({ where: { vehicleId: id } });
  await prisma.vehicle.delete({ where: { id } });
  revalidatePath("/estoque");
  revalidatePath("/");
  redirect("/estoque");
}

/**
 * Configura o ANÚNCIO do veículo (QR do para-brisa / vitrine): destaque
 * promocional e quais dados aparecem (lista de campos ocultos; vazio = tudo).
 */
export async function updateAdSettingsAction(
  vehicleId: string,
  promo: string,
  hiddenFields: string[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCanAny([
      ["estoque", "publicar"],
      ["estoque", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const allowed = new Set(["preco", "ano", "km", "cor", "combustivel", "cambio", "versao"]);
  const hidden = hiddenFields.filter((f) => allowed.has(f));
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { adPromo: promo.trim().slice(0, 200) || null, adHiddenFields: hidden },
  });
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath(`/vitrine/${vehicleId}`);
  revalidatePath("/vitrine");
  return { ok: true };
}
