import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registerVehicleSale, createVehicleWithPayable } from "@/lib/finance";
import { parseDateInput } from "@/lib/format";

/**
 * Módulo comum (SEM "use server") com o schema, os tipos e o núcleo do registro
 * de venda. Fica separado das server actions porque um arquivo "use server" só
 * pode exportar funções assíncronas — schema e tipos precisam morar aqui.
 */

export const saleSchema = z.object({
  vehicleId: z.string().min(1, "Selecione o veículo"),
  customerId: z.string().min(1, "Selecione o cliente"),
  saleDate: z.string().min(1),
  totalAmount: z.coerce.number().min(0.01, "Informe o valor da venda"),
  paymentMethod: z.enum(["A_VISTA", "PARCELADO", "FINANCIADO"]),
  downPayment: z.coerce.number().min(0).default(0),
  installmentsCount: z.coerce.number().int().min(0).default(0),
  financerAccountId: z.string().optional(),
  financedAmount: z.coerce.number().min(0).optional(),
  sellerName: z.string().optional(),
  notes: z.string().optional(),
  // Troca: veículo recebido do cliente cadastrado aqui mesmo.
  tradeIn: z.coerce.boolean().optional(),
  tiPlate: z.string().optional(),
  tiBrand: z.string().optional(),
  tiModel: z.string().optional(),
  tiManufactureYear: z.coerce.number().int().optional(),
  tiModelYear: z.coerce.number().int().optional(),
  tiColor: z.string().optional(),
  tiKm: z.coerce.number().int().min(0).optional(),
  tiNegotiated: z.coerce.number().min(0).optional(),
  tiPayoff: z.coerce.number().min(0).optional(),
  tiPayoffTo: z.string().optional(),
  tiDebts: z.coerce.number().min(0).optional(),
});

export type SaleFormState = { error?: string };
export type SaleData = z.infer<typeof saleSchema>;

/**
 * Núcleo do registro de venda: valida regras, cadastra o veículo da troca (se
 * houver) e cria a venda com todos os lançamentos. Lança Error em caso de
 * problema. Reutilizado tanto pela venda direta quanto pela conversão de uma
 * pré-venda. Retorna o id da venda criada.
 */
export async function registerSaleCore(d: SaleData): Promise<string> {
  if (d.paymentMethod === "PARCELADO") {
    if (d.downPayment > d.totalAmount) {
      throw new Error("A entrada não pode ser maior que o valor total da venda.");
    }
    if (d.installmentsCount < 1) {
      throw new Error("Informe o número de parcelas.");
    }
  }

  if (d.paymentMethod === "FINANCIADO" && d.financedAmount != null && d.financedAmount > d.totalAmount) {
    throw new Error("O valor financiado não pode ser maior que o valor total da venda.");
  }

  let financerName: string | null = null;
  if (d.paymentMethod === "FINANCIADO" && d.financerAccountId) {
    const acc = await prisma.financialAccount.findUnique({
      where: { id: d.financerAccountId },
      select: { name: true },
    });
    financerName = acc?.name ?? null;
  }

  let tradeInAmount = 0;
  let tradeInLabel: string | null = null;
  let tradeInVehicleId: string | null = null;
  if (d.tradeIn) {
    const negociado = d.tiNegotiated ?? 0;
    if (!d.tiPlate || !d.tiBrand || !d.tiModel || negociado <= 0) {
      throw new Error("Para a troca, informe placa, marca, modelo e valor negociado do veículo recebido.");
    }
    const payoff = d.tiPayoff ?? 0;
    const debts = d.tiDebts ?? 0;
    const liquido = Math.max(0, Math.round((negociado - payoff - debts) * 100) / 100);
    if (liquido > d.totalAmount) {
      throw new Error("O líquido do veículo da troca é maior que o valor da venda. Ajuste os valores.");
    }
    const existing = await prisma.vehicle.findUnique({ where: { plate: d.tiPlate.toUpperCase() } });
    if (existing) {
      throw new Error("Já existe um veículo com a placa informada na troca.");
    }
    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    const sellVehicle = await prisma.vehicle.findUnique({ where: { id: d.vehicleId } });
    const tradeVehicle = await createVehicleWithPayable({
      brand: d.tiBrand,
      model: d.tiModel,
      manufactureYear: d.tiManufactureYear ?? new Date().getFullYear(),
      modelYear: d.tiModelYear ?? d.tiManufactureYear ?? new Date().getFullYear(),
      plate: d.tiPlate.toUpperCase(),
      color: d.tiColor || null,
      km: d.tiKm ?? 0,
      purchasePrice: negociado,
      salePrice: negociado,
      entryDate: parseDateInput(d.saleDate),
      supplierId: null,
      alreadyPaid: false,
      acquisitionType: "A_VISTA",
      payoffAmount: payoff,
      payoffTo: d.tiPayoffTo || null,
      debtsAmount: debts,
      liquidoSettledByTrade: true,
      tradeNote: `Recebido em troca de ${customer?.name ?? "cliente"} na venda ${
        sellVehicle ? `${sellVehicle.brand} ${sellVehicle.model} - ${sellVehicle.plate}` : ""
      }`,
      notes: `Veículo recebido em troca de ${customer?.name ?? "cliente"}.`,
    });
    tradeInAmount = liquido;
    tradeInLabel = `${d.tiBrand} ${d.tiModel} - ${d.tiPlate.toUpperCase()}`;
    tradeInVehicleId = tradeVehicle.id;
  }

  const sale = await registerVehicleSale({
    vehicleId: d.vehicleId,
    customerId: d.customerId,
    saleDate: parseDateInput(d.saleDate),
    totalAmount: d.totalAmount,
    downPayment: d.paymentMethod === "PARCELADO" ? d.downPayment : 0,
    installmentsCount: d.paymentMethod === "PARCELADO" ? d.installmentsCount : 0,
    paymentMethod: d.paymentMethod,
    sellerName: d.sellerName || null,
    financerName,
    financedAmount: d.paymentMethod === "FINANCIADO" ? d.financedAmount ?? null : null,
    financerAccountId: d.paymentMethod === "FINANCIADO" ? d.financerAccountId || null : null,
    notes: d.notes || null,
    tradeInAmount,
    tradeInLabel,
    tradeInVehicleId,
  });
  return sale.id;
}
