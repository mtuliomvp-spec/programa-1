import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registerVehicleSale, createIntermediationVehicle } from "@/lib/finance";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";
import { parseReferrals } from "@/lib/referrals";

/**
 * Núcleo do "Financiamento de terceiros" (intermediação). SEM "use server" —
 * guarda o schema/tipos e a função de registro, reutilizados pela action.
 *
 * A operação mapeia no motor de venda: cadastra o veículo do terceiro com
 * custo 0 (fora do estoque) e chama registerVehicleSale com
 * totalAmount = F − D e financedAmount = F. O motor gera a devolução ao
 * cliente (F − billable = D) e o lucro (F − D − comissão − ...).
 */
export const intermediationSchema = z.object({
  customerId: z.string().min(1, "Selecione o cliente (comprador)"),
  saleDate: z.string().min(1),
  // Proprietário do documento (VENDEDOR do contrato)
  ownerName: z.string().min(1, "Informe o proprietário do documento (vendedor)"),
  ownerDocument: z.string().optional(),
  ownerPhone: z.string().optional(),
  ownerAddress: z.string().optional(),
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

export async function registerIntermediationCore(d: IntermediationData): Promise<string> {
  await assertMonthOpen(parseDateInput(d.saleDate));

  const F = Math.round(d.financingAmount * 100) / 100;
  const D = Math.round(Math.max(0, d.refundAmount) * 100) / 100;
  if (D > F) {
    throw new Error("A devolução ao cliente não pode ser maior que o valor do financiamento.");
  }

  // Placa não pode colidir com um veículo ATIVO do estoque próprio.
  const existing = await prisma.vehicle.findFirst({
    where: { plate: d.plate.toUpperCase(), status: { not: "VENDIDO" }, intermediation: false },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Já existe um veículo ativo no estoque com essa placa.");
  }

  // Vendedor = usuário do sistema (para dados bancários da comissão).
  let sellerName: string | null = d.sellerName || null;
  if (d.sellerId) {
    const u = await prisma.user.findUnique({ where: { id: d.sellerId }, select: { name: true } });
    sellerName = u?.name ?? sellerName;
  }

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

  try {
    const sale = await registerVehicleSale({
      vehicleId: vehicle.id,
      customerId: d.customerId,
      saleDate: parseDateInput(d.saleDate),
      // Margem bruta da intermediação = F − D (custo do veículo é 0).
      totalAmount: Math.round((F - D) * 100) / 100,
      downPayment: 0,
      installmentsCount: 0,
      paymentMethod: "FINANCIADO",
      // F financiado pelo banco: o excedente sobre o billable (F−D) vira a
      // devolução ao cliente (= D) automaticamente no motor.
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
      saleType: "FINANCIAMENTO_TERCEIROS",
      financingAmount: F,
      refundAmount: D,
      ownerName: d.ownerName,
      ownerDocument: d.ownerDocument || null,
      ownerPhone: d.ownerPhone || null,
      ownerAddress: d.ownerAddress || null,
      notes: d.notes || null,
    });
    return sale.id;
  } catch (err) {
    // Registro falhou depois de criar o veículo do terceiro: remove o órfão.
    await prisma.vehicle.deleteMany({ where: { id: vehicle.id } }).catch(() => {});
    throw err;
  }
}
