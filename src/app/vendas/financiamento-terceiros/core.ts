import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registerVehicleSale, createIntermediationVehicle } from "@/lib/finance";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";
import { parseReferrals } from "@/lib/referrals";

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
  customerId: z.string().min(1, "Selecione o cliente (comprador)"),
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
  chassi: z.string().optional(),
  color: z.string().optional(),
  km: z.coerce.number().int().min(0).default(0),
  fuel: z.string().optional(),
  transmission: z.string().optional(),
  // Valores da operação
  financingAmount: z.coerce.number().min(0.01, "Informe o valor do financiamento"),
  refundAmount: z.coerce.number().min(0).default(0),
  financerAccountId: z.string().min(1, "Selecione a financeira"),
  returnLevel: z.coerce.number().int().min(0).default(0),
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
});

export type IntermediationFormState = { error?: string };
export type IntermediationData = z.infer<typeof intermediationSchema>;

/** Valida F/D e a placa; devolve os valores normalizados. */
async function validateAndPrepare(d: IntermediationData) {
  await assertMonthOpen(parseDateInput(d.saleDate));
  const F = Math.round(d.financingAmount * 100) / 100;
  const D = Math.round(Math.max(0, d.refundAmount) * 100) / 100;
  if (D > F) {
    throw new Error("A devolução ao cliente não pode ser maior que o valor do financiamento.");
  }
  const existing = await prisma.vehicle.findFirst({
    where: { plate: d.plate.toUpperCase(), status: { not: "VENDIDO" }, intermediation: false },
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
 * Cria a PRÉ-VENDA (ficha) do financiamento de terceiros: cadastra o veículo de
 * terceiro e uma PreSale ABERTA. NÃO gera lançamento financeiro. Retorna o id.
 */
export async function createIntermediationPreSale(d: IntermediationData): Promise<string> {
  const { F, D, sellerName } = await validateAndPrepare(d);

  const vehicle = await createIntermediationVehicle({
    brand: d.brand,
    model: d.model,
    version: d.version || null,
    manufactureYear: d.manufactureYear,
    modelYear: d.modelYear,
    plate: d.plate.toUpperCase(),
    chassi: d.chassi || null,
    color: d.color || null,
    km: d.km,
    fuel: d.fuel || null,
    transmission: d.transmission || null,
    salePrice: F,
    entryDate: parseDateInput(d.saleDate),
    notes: `Veículo de terceiro — financiamento de terceiros (proprietário: ${d.ownerName}).`,
  });

  const pre = await prisma.preSale.create({
    data: {
      saleType: "FINANCIAMENTO_TERCEIROS",
      vehicleId: vehicle.id,
      customerId: d.customerId,
      saleDate: parseDateInput(d.saleDate),
      totalAmount: Math.round((F - D) * 100) / 100,
      paymentMethod: "FINANCIADO",
      financingAmount: F,
      refundAmount: D,
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
      notes: d.notes || null,
      status: "ABERTA",
    },
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

  const F = pre.financingAmount;
  const D = pre.refundAmount;

  const sale = await registerVehicleSale({
    vehicleId: pre.vehicleId,
    customerId: pre.customerId,
    saleDate: pre.saleDate,
    totalAmount: Math.round((F - D) * 100) / 100,
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
    notes: pre.notes,
  });

  await prisma.preSale.update({
    where: { id: pre.id },
    data: { status: "CONVERTIDA", convertedSaleId: sale.id },
  });
  return sale.id;
}
