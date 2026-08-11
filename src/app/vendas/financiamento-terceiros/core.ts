import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registerVehicleSale, createIntermediationVehicle } from "@/lib/finance";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { assertCashDateIsWorkDate } from "@/lib/cashbox";
import { parseDateInput } from "@/lib/format";
import { parseReferrals } from "@/lib/referrals";
import { findCustomerByIdentity } from "@/lib/person-dedupe";
import {
  chassiOrNull,
  renavamOrNull,
  normalizeRenavam,
  isChassiComplete,
  CHASSI_LENGTH,
} from "@/lib/vehicle-doc";

/**
 * Núcleo do "Financiamento de terceiros" (intermediação). SEM "use server" —
 * guarda o schema/tipos e as funções de pré-venda/conversão.
 *
 * Fluxo (igual às vendas de veículo): primeiro gera uma PRÉ-VENDA (ficha, sem
 * lançamento financeiro) e só ao concluir vira uma venda de fato. A operação
 * mapeia no motor de venda: veículo de terceiro com custo 0 (fora do estoque) e
 * registerVehicleSale com totalAmount = F − D e financedAmount = F (o motor
 * gera a devolução ao cliente = D e o lucro = F − D − comissão − ...).
 */
export const intermediationSchema = z.object({
  // No refinanciamento o cliente é o próprio proprietário e é resolvido/criado no
  // servidor a partir dos dados do proprietário — por isso é opcional aqui e a
  // obrigatoriedade (fora do refinanciamento) é validada em código.
  customerId: z.string().optional(),
  saleDate: z.string().min(1),
  // Proprietário do documento (VENDEDOR do contrato)
  ownerName: z.string().min(1, "Informe o proprietário do documento (vendedor)"),
  ownerDocument: z.string().optional(),
  ownerPhone: z.string().optional(),
  ownerAddress: z.string().optional(),
  // Dados bancários do comprador (para a transferência da devolução)
  buyerBankName: z.string().optional(),
  buyerBankAgency: z.string().optional(),
  buyerBankAccount: z.string().optional(),
  buyerBankAccountType: z.string().optional(),
  buyerPixKey: z.string().optional(),
  // Veículo do terceiro (cadastro inline)
  brand: z.string().min(1, "Informe a marca"),
  model: z.string().min(1, "Informe o modelo"),
  version: z.string().optional(),
  manufactureYear: z.coerce.number().int().min(1950).max(2100),
  modelYear: z.coerce.number().int().min(1950).max(2100),
  plate: z.string().min(1, "Informe a placa"),
  // Obrigatórios: a intermediação é uma venda e gera contrato, que imprime o
  // chassi. A checagem é feita depois da normalização (o usuário pode digitar
  // com pontos/espaços), por isso `.optional()` aqui e `superRefine` abaixo.
  chassi: z.string().optional(),
  renavam: z.string().optional(),
  color: z.string().optional(),
  km: z.coerce.number().int().min(0).default(0),
  fuel: z.string().optional(),
  transmission: z.string().optional(),
  // Valores da operação
  financingAmount: z.coerce.number().min(0.01, "Informe o valor do financiamento"),
  refundAmount: z.coerce.number().min(0).default(0),
  // Refinanciamento: o proprietário refinancia o próprio veículo. A financeira
  // paga F direto ao financiado; a loja recebe só o retorno (sem repasse/devolução).
  refinancing: z.coerce.boolean().optional(),
  financerAccountId: z.string().min(1, "Selecione a financeira"),
  returnLevel: z.coerce.number().int().min(0).default(0),
  // Parcelamento informado ao comprador (obrigatório — sempre financiado).
  installmentsInfoCount: z.coerce.number().int().min(1, "Informe o número de parcelas"),
  installmentsInfoAmount: z.coerce.number().min(0.01, "Informe o valor da parcela"),
  takeReturnCommission: z.coerce.boolean().optional(),
  sellerId: z.string().optional(),
  sellerName: z.string().optional(),
  commissionAmount: z.coerce.number().min(0).default(0),
  transferCharged: z.coerce.boolean().optional(),
  transferAmount: z.coerce.number().min(0).default(0),
  referrals: z
    .string()
    .optional()
    .transform((s) => parseReferrals(s)),
  notes: z.string().optional(),
})
  .superRefine((d, ctx) => {
    if (!normalizeRenavam(d.renavam)) {
      ctx.addIssue({ code: "custom", path: ["renavam"], message: "Informe o RENAVAM do veículo" });
    }
    // Completo: a consulta por placa devolve o chassi mascarado, e mascarado
    // não serve para contrato nem para identificar o carro.
    if (!isChassiComplete(d.chassi)) {
      ctx.addIssue({
        code: "custom",
        path: ["chassi"],
        message: `Informe o chassi completo do veículo (${CHASSI_LENGTH} caracteres)`,
      });
    }
  });

export type IntermediationFormState = { error?: string };
export type IntermediationData = z.infer<typeof intermediationSchema>;

/** Valida F/D e a placa; devolve os valores normalizados. `excludeVehicleId`
 *  ignora o próprio veículo de terceiro ao editar a pré-venda. */
async function validateAndPrepare(d: IntermediationData, excludeVehicleId?: string) {
  await assertMonthOpen(parseDateInput(d.saleDate));
  const F = Math.round(d.financingAmount * 100) / 100;
  // Refinanciamento: a loja não vende o carro nem devolve — a financeira paga F
  // direto ao financiado. Logo D = 0 (sem devolução pela loja).
  const D = d.refinancing ? 0 : Math.round(Math.max(0, d.refundAmount) * 100) / 100;
  if (D > F) {
    throw new Error("A devolução ao cliente não pode ser maior que o valor do financiamento.");
  }
  const existing = await prisma.vehicle.findFirst({
    where: {
      plate: d.plate.toUpperCase(),
      status: { not: "VENDIDO" },
      intermediation: false,
      ...(excludeVehicleId ? { id: { not: excludeVehicleId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Já existe um veículo ativo no estoque com essa placa.");
  }
  let sellerName: string | null = d.sellerName || null;
  if (d.sellerId) {
    const u = await prisma.user.findUnique({ where: { id: d.sellerId }, select: { name: true } });
    sellerName = u?.name ?? sellerName;
  }
  return { F, D, sellerName };
}

/**
 * Resolve o cliente (comprador/financiado) da operação.
 * - Fora do refinanciamento: exige o `customerId` selecionado.
 * - No refinanciamento: o cliente é o próprio proprietário. Reaproveita um
 *   cliente já cadastrado (mesmo CPF/CNPJ ou nome) ou o cadastra a partir dos
 *   dados do proprietário, para que o Cliente replique o proprietário.
 */
async function resolveIntermediationCustomerId(d: IntermediationData): Promise<string> {
  const selected = d.customerId?.trim();
  if (!d.refinancing) {
    if (!selected) throw new Error("Selecione o cliente (comprador).");
    return selected;
  }
  if (selected) return selected;

  const document = d.ownerDocument?.trim() || null;
  const name = d.ownerName.trim();
  // Mesma regra de identidade do cadastro (nome sem acento/pontuação OU
  // CPF/CNPJ), para não nascer um cliente repetido a cada intermediação.
  const existing = await findCustomerByIdentity(name, document);
  if (existing) return existing.id;

  const created = await prisma.customer.create({
    data: {
      name,
      document,
      phone: d.ownerPhone?.trim() || null,
      address: d.ownerAddress?.trim() || null,
    },
    select: { id: true },
  });
  return created.id;
}

/**
/** Monta os campos da PreSale/venda a partir dos dados do formulário. */
function buildPreSaleData(
  d: IntermediationData,
  customerId: string,
  F: number,
  D: number,
  sellerName: string | null,
) {
  return {
    saleType: "FINANCIAMENTO_TERCEIROS" as const,
    customerId,
    saleDate: parseDateInput(d.saleDate),
    // Refinanciamento: a loja não vende o carro (totalAmount 0); só o retorno é receita.
    totalAmount: d.refinancing ? 0 : Math.round((F - D) * 100) / 100,
    paymentMethod: "FINANCIADO" as const,
    financingAmount: F,
    refundAmount: D,
    refinancing: Boolean(d.refinancing),
    financedAmount: F,
    financerAccountId: d.financerAccountId,
    returnLevel: Math.max(0, d.returnLevel || 0),
    takeReturnCommission: Boolean(d.takeReturnCommission),
    sellerName,
    sellerId: d.sellerId || null,
    commissionAmount: Math.max(0, d.commissionAmount || 0),
    referrals: d.referrals ?? [],
    transferCharged: Boolean(d.transferCharged),
    transferAmount: Math.max(0, d.transferAmount || 0),
    ownerName: d.ownerName,
    ownerDocument: d.ownerDocument || null,
    ownerPhone: d.ownerPhone || null,
    ownerAddress: d.ownerAddress || null,
    buyerBankName: d.buyerBankName || null,
    buyerBankAgency: d.buyerBankAgency || null,
    buyerBankAccount: d.buyerBankAccount || null,
    buyerBankAccountType: d.buyerBankAccountType || null,
    buyerPixKey: d.buyerPixKey || null,
    installmentsInfoCount: d.installmentsInfoCount,
    installmentsInfoAmount: d.installmentsInfoAmount,
    notes: d.notes || null,
  };
}

/** Campos do veículo de terceiro (para criar/atualizar). */
function buildVehicleData(d: IntermediationData, F: number) {
  return {
    brand: d.brand,
    model: d.model,
    version: d.version || null,
    manufactureYear: d.manufactureYear,
    modelYear: d.modelYear,
    plate: d.plate.toUpperCase(),
    chassi: chassiOrNull(d.chassi),
    renavam: renavamOrNull(d.renavam),
    color: d.color || null,
    km: d.km,
    fuel: d.fuel || null,
    transmission: d.transmission || null,
    salePrice: F,
  };
}

/**
 * Cria a PRÉ-VENDA (ficha) do financiamento de terceiros: cadastra o veículo de
 * terceiro e uma PreSale ABERTA. NÃO gera lançamento financeiro. Retorna o id.
 */
export async function createIntermediationPreSale(d: IntermediationData): Promise<string> {
  const { F, D, sellerName } = await validateAndPrepare(d);
  const customerId = await resolveIntermediationCustomerId(d);

  const vehicle = await createIntermediationVehicle({
    ...buildVehicleData(d, F),
    entryDate: parseDateInput(d.saleDate),
    notes: `Veículo de terceiro — financiamento de terceiros (proprietário: ${d.ownerName}).`,
  });

  const pre = await prisma.preSale.create({
    data: {
      ...buildPreSaleData(d, customerId, F, D, sellerName),
      vehicleId: vehicle.id,
      status: "ABERTA",
    },
  });
  return pre.id;
}

/**
 * Atualiza uma pré-venda de financiamento de terceiros (só enquanto ABERTA).
 * Atualiza também o veículo de terceiro já cadastrado (não recria).
 */
export async function updateIntermediationPreSale(
  preSaleId: string,
  d: IntermediationData,
): Promise<string> {
  const pre = await prisma.preSale.findUniqueOrThrow({ where: { id: preSaleId } });
  if (pre.saleType !== "FINANCIAMENTO_TERCEIROS") {
    throw new Error("Esta pré-venda não é um financiamento de terceiros.");
  }
  if (pre.status !== "ABERTA") {
    throw new Error("Só é possível editar enquanto a pré-venda está em aberto.");
  }
  const { F, D, sellerName } = await validateAndPrepare(d, pre.vehicleId);
  const customerId = await resolveIntermediationCustomerId(d);

  await prisma.vehicle.update({ where: { id: pre.vehicleId }, data: buildVehicleData(d, F) });
  await prisma.preSale.update({
    where: { id: pre.id },
    data: buildPreSaleData(d, customerId, F, D, sellerName),
  });
  return pre.id;
}

/**
 * Converte a pré-venda de financiamento de terceiros numa venda de fato
 * (gera os lançamentos via registerVehicleSale). Retorna o id da venda.
 */
export async function convertIntermediationPreSale(preSaleId: string): Promise<string> {
  const pre = await prisma.preSale.findUniqueOrThrow({ where: { id: preSaleId } });
  if (pre.saleType !== "FINANCIAMENTO_TERCEIROS") {
    throw new Error("Esta pré-venda não é um financiamento de terceiros.");
  }
  if (pre.status === "CONVERTIDA" && pre.convertedSaleId) {
    return pre.convertedSaleId;
  }
  await assertMonthOpen(pre.saleDate);
  // A conclusão MOVIMENTA o caixa (repasse da financeira, devolução): a data da
  // operação precisa ser a data de trabalho do caixa aberto — a mesma regra de
  // toda baixa. Se a pré-venda for de outro dia, ajuste a data nela (Editar) ou
  // abra o caixa na data desejada.
  await assertCashDateIsWorkDate(pre.saleDate);

  const F = pre.financingAmount;
  const D = pre.refundAmount;

  const sale = await registerVehicleSale({
    vehicleId: pre.vehicleId,
    customerId: pre.customerId,
    saleDate: pre.saleDate,
    totalAmount: pre.refinancing ? 0 : Math.round((F - D) * 100) / 100,
    downPayment: 0,
    installmentsCount: 0,
    paymentMethod: "FINANCIADO",
    financedAmount: F,
    financerAccountId: pre.financerAccountId,
    returnLevel: Math.max(0, pre.returnLevel || 0),
    takeReturnCommission: pre.takeReturnCommission,
    sellerName: pre.sellerName,
    sellerId: pre.sellerId,
    commissionAmount: pre.commissionAmount,
    referrals: parseReferrals(pre.referrals),
    transferCharged: pre.transferCharged,
    transferAmount: pre.transferAmount,
    saleType: "FINANCIAMENTO_TERCEIROS",
    refinancing: pre.refinancing,
    financingAmount: F,
    refundAmount: D,
    ownerName: pre.ownerName,
    ownerDocument: pre.ownerDocument,
    ownerPhone: pre.ownerPhone,
    ownerAddress: pre.ownerAddress,
    buyerBankName: pre.buyerBankName,
    buyerBankAgency: pre.buyerBankAgency,
    buyerBankAccount: pre.buyerBankAccount,
    buyerBankAccountType: pre.buyerBankAccountType,
    buyerPixKey: pre.buyerPixKey,
    installmentsInfoCount: pre.installmentsInfoCount,
    installmentsInfoAmount: pre.installmentsInfoAmount,
    notes: pre.notes,
  });

  await prisma.preSale.update({
    where: { id: pre.id },
    data: { status: "CONVERTIDA", convertedSaleId: sale.id },
  });
  return sale.id;
}
