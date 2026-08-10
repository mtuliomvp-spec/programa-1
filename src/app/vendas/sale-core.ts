import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { registerVehicleSale, createVehicleWithPayable, resolveSupplierByName } from "@/lib/finance";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";
import { parseReferrals } from "@/lib/referrals";
import { chassiOrNull } from "@/lib/vehicle-doc";
import { parseDebtItems } from "@/lib/vehicle-debts";

/** Remove um veículo recebido em troca (e suas contas) — usado para desfazer a
 *  troca quando o registro da venda falha, evitando veículo "órfão" no estoque. */
async function undoTradeInVehicle(vehicleId: string) {
  try {
    await prisma.$transaction([
      prisma.vehicleCost.deleteMany({ where: { vehicleId } }),
      prisma.payable.deleteMany({ where: { vehicleId } }),
      prisma.vehicle.delete({ where: { id: vehicleId } }),
    ]);
  } catch {
    // best-effort: se não der para limpar, a venda já falhou de qualquer forma.
  }
}

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
  // Retorno da financeira (nível R-xx; 0 = sem retorno)
  returnLevel: z.coerce.number().int().min(0).default(0),
  sellerName: z.string().optional(),
  // Vendedor = usuário do sistema (para puxar dados bancários na comissão).
  sellerId: z.string().optional(),
  // Comissão do vendedor (R$) — vira conta a pagar (categoria Comissão).
  commissionAmount: z.coerce.number().min(0).default(0),
  // Transferência (DETRAN) cobrada na venda: indicador + valor. Quando cobrada,
  // vira conta a pagar (custo, igual à comissão).
  transferCharged: z.coerce.boolean().optional(),
  transferAmount: z.coerce.number().min(0).default(0),
  // Facultativo: pagar ao vendedor a comissão sobre o retorno da financeira.
  takeReturnCommission: z.coerce.boolean().optional(),
  // Seguro vendido junto ao financiamento: só marca (valor e data vêm depois).
  insuranceSold: z.coerce.boolean().optional(),
  // Informativo: venda originada de anúncio de tráfego pago (card do dashboard).
  viaPaidTraffic: z.coerce.boolean().optional(),
  // Parcelamento informado ao comprador (só informativo, consta no contrato).
  installmentsInfoCount: z.coerce.number().int().min(0).optional(),
  installmentsInfoAmount: z.coerce.number().min(0).optional(),
  // Indicações de venda: JSON [{ name, amount }] serializado num input hidden.
  // Cada indicação vira conta a pagar (Comissão), como a do vendedor.
  referrals: z
    .string()
    .optional()
    .transform((s) => parseReferrals(s)),
  notes: z.string().optional(),
  // Consignado: destino do valor a devolver ao proprietário. Por padrão vira
  // conta a pagar ao dono; se `ownerRefundToCapital`, vira aporte no capital do
  // beneficiário escolhido (o valor em si vem do veículo, travado no servidor).
  ownerRefundToCapital: z.coerce.boolean().optional(),
  ownerRefundBeneficiaryId: z.string().optional(),
  // Comissão do vendedor aplicada no capital dele (aporte) em vez de paga —
  // só surte efeito se o vendedor for beneficiário do capital (resolvido no motor).
  commissionToCapital: z.coerce.boolean().optional(),
  // Dados bancários do comprador — usados quando há devolução ao cliente (as
  // entradas superam o preço); constam no contrato para o pagamento.
  buyerBankName: z.string().optional(),
  buyerBankAgency: z.string().optional(),
  buyerBankAccount: z.string().optional(),
  buyerBankAccountType: z.string().optional(),
  buyerPixKey: z.string().optional(),
  // Troca: veículo recebido do cliente cadastrado aqui mesmo.
  tradeIn: z.coerce.boolean().optional(),
  tiPlate: z.string().optional(),
  tiBrand: z.string().optional(),
  tiModel: z.string().optional(),
  tiVersion: z.string().optional(),
  tiManufactureYear: z.coerce.number().int().optional(),
  tiModelYear: z.coerce.number().int().optional(),
  tiColor: z.string().optional(),
  tiKm: z.coerce.number().int().min(0).optional(),
  tiFuel: z.string().optional(),
  tiTransmission: z.string().optional(),
  tiChassi: z.string().optional(),
  tiNegotiated: z.coerce.number().min(0).optional(),
  // Preço de venda (anúncio) do veículo recebido — vem da FIPE na busca por
  // placa. Se não informado, cai no valor negociado.
  tiSalePrice: z.coerce.number().min(0).optional(),
  tiPayoff: z.coerce.number().min(0).optional(),
  tiPayoffTo: z.string().optional(),
  tiDebts: z.coerce.number().min(0).optional(),
  // Detalhamento dos débitos (JSON do formulário): cada linha vira um título.
  tiDebtsItems: z
    .string()
    .optional()
    .transform((v) => parseDebtItems(v)),
  tiSupplierName: z.string().optional(),
});

export type SaleFormState = { error?: string };
export type SaleData = z.infer<typeof saleSchema>;

/**
 * Impede vender / pré-vender um veículo que já tem uma pré-venda EM ABERTO para
 * OUTRO cliente. O usuário deve cancelar a pré-venda existente antes de negociar
 * o mesmo carro com um cliente diferente. `excludePreSaleId` ignora a própria
 * pré-venda ao editá-la.
 */
export async function assertNoConflictingPreSale(
  vehicleId: string,
  customerId: string,
  excludePreSaleId?: string,
): Promise<void> {
  const conflict = await prisma.preSale.findFirst({
    where: {
      vehicleId,
      status: "ABERTA",
      customerId: { not: customerId },
      ...(excludePreSaleId ? { id: { not: excludePreSaleId } } : {}),
    },
    select: { number: true, customerId: true },
    orderBy: { number: "asc" },
  });
  if (!conflict) return;
  const cust = await prisma.customer.findUnique({
    where: { id: conflict.customerId },
    select: { name: true },
  });
  const num = String(conflict.number).padStart(4, "0");
  throw new Error(
    `Este veículo já tem uma pré-venda em aberto (nº ${num} — ${cust?.name ?? "outro cliente"}). ` +
      `Cancele a pré-venda antes de negociar este veículo com um cliente diferente.`,
  );
}

/**
 * Núcleo do registro de venda: valida regras, cadastra o veículo da troca (se
 * houver) e cria a venda com todos os lançamentos. Lança Error em caso de
 * problema. Reutilizado tanto pela venda direta quanto pela conversão de uma
 * pré-venda. Retorna o id da venda criada.
 */
export async function registerSaleCore(d: SaleData): Promise<string> {
  // Trava do fechamento mensal: não registrar venda com data em mês já fechado.
  await assertMonthOpen(parseDateInput(d.saleDate));

  // Trava: não vender um veículo pré-vendido para outro cliente sem cancelar a
  // pré-venda antes (a conversão da própria pré-venda usa o mesmo cliente, então
  // não é bloqueada).
  await assertNoConflictingPreSale(d.vehicleId, d.customerId);

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

  // Parcelamento informado ao comprador: obrigatório quando há parcelas (não à
  // vista), para o contrato registrar quantas parcelas e de que valor.
  if (d.paymentMethod !== "A_VISTA") {
    if (!d.installmentsInfoCount || d.installmentsInfoCount < 1 || !d.installmentsInfoAmount || d.installmentsInfoAmount <= 0) {
      throw new Error("Informe a quantidade e o valor das parcelas que o comprador vai pagar (para o contrato).");
    }
  }

  // Retorno: só existe em venda financiada e exige a financeira (quem paga).
  const returnLevel = d.paymentMethod === "FINANCIADO" ? Math.max(0, d.returnLevel || 0) : 0;
  if (returnLevel > 0 && !d.financerAccountId) {
    throw new Error("Para usar o retorno, selecione a financeira do financiamento.");
  }

  let financerName: string | null = null;
  if (d.paymentMethod === "FINANCIADO" && d.financerAccountId) {
    const acc = await prisma.financialAccount.findUnique({
      where: { id: d.financerAccountId },
      select: { name: true },
    });
    financerName = acc?.name ?? null;
  }

  // Consignado: o valor a devolver ao proprietário é travado a partir do veículo
  // (não do formulário). Se o destino for o capital, exige um beneficiário válido.
  const sellVehicleConsign = await prisma.vehicle.findUnique({
    where: { id: d.vehicleId },
    select: { consigned: true, ownerRefundAmount: true },
  });
  const consigned = Boolean(sellVehicleConsign?.consigned);
  const ownerRefundAmount = consigned ? sellVehicleConsign?.ownerRefundAmount ?? 0 : 0;
  const ownerRefundToCapital = consigned && Boolean(d.ownerRefundToCapital);
  let ownerRefundBeneficiaryId: string | null = null;
  if (ownerRefundToCapital && ownerRefundAmount > 0) {
    const beneficiaryId = (d.ownerRefundBeneficiaryId || "").trim();
    if (!beneficiaryId) {
      throw new Error("Para aplicar a devolução no capital, selecione o beneficiário.");
    }
    const beneficiary = await prisma.capitalBeneficiary.findUnique({
      where: { id: beneficiaryId },
      select: { id: true },
    });
    if (!beneficiary) {
      throw new Error("Beneficiário do capital não encontrado.");
    }
    ownerRefundBeneficiaryId = beneficiary.id;
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
    // As guias reais podem não bater com o acordado: a diferença vira custo
    // (ou desconto) do veículo, tratada em createAcquisitionPayables.
    const debtItems = d.tiDebtsItems ?? [];
    const liquido = Math.max(0, Math.round((negociado - payoff - debts) * 100) / 100);
    if (liquido > d.totalAmount) {
      throw new Error("O líquido do veículo da troca é maior que o valor da venda. Ajuste os valores.");
    }
    // Só barra ficha ATIVA da mesma placa — receber de volta na troca um carro
    // que a loja já vendeu é permitido (vira uma nova ficha no estoque).
    const existing = await prisma.vehicle.findFirst({
      where: { plate: d.tiPlate.toUpperCase(), status: { not: "VENDIDO" } },
    });
    if (existing) {
      throw new Error("Já existe um veículo ativo no estoque com a placa informada na troca.");
    }
    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    const sellVehicle = await prisma.vehicle.findUnique({ where: { id: d.vehicleId } });
    // Fornecedor do veículo recebido: quem entregou o carro (por padrão, o
    // próprio cliente da venda). Reaproveita/cria o fornecedor pelo nome.
    const tiSupplierName = (d.tiSupplierName || customer?.name || "").trim();
    const tradeSupplierId = tiSupplierName ? await resolveSupplierByName(tiSupplierName) : null;
    const tradeVehicle = await createVehicleWithPayable({
      brand: d.tiBrand,
      model: d.tiModel,
      version: d.tiVersion || null,
      manufactureYear: d.tiManufactureYear ?? d.tiModelYear ?? new Date().getFullYear(),
      modelYear: d.tiModelYear ?? d.tiManufactureYear ?? new Date().getFullYear(),
      plate: d.tiPlate.toUpperCase(),
      chassi: chassiOrNull(d.tiChassi),
      color: d.tiColor || null,
      km: d.tiKm ?? 0,
      fuel: d.tiFuel || null,
      transmission: d.tiTransmission || null,
      purchasePrice: negociado,
      // Preço de anúncio: usa a FIPE informada na troca; sem ela, cai no negociado.
      salePrice: d.tiSalePrice && d.tiSalePrice > 0 ? d.tiSalePrice : negociado,
      entryDate: parseDateInput(d.saleDate),
      supplierId: tradeSupplierId,
      alreadyPaid: false,
      acquisitionType: "A_VISTA",
      payoffAmount: payoff,
      payoffTo: d.tiPayoffTo || null,
      debtsAmount: debts,
      debtsItems: debtItems,
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

  try {
    // Vendedor é um usuário do sistema; grava o id (para dados bancários da
    // comissão) e o nome como "foto" (documentos, DRE).
    let sellerName: string | null = d.sellerName || null;
    if (d.sellerId) {
      const u = await prisma.user.findUnique({ where: { id: d.sellerId }, select: { name: true } });
      sellerName = u?.name ?? sellerName;
    }

    const sale = await registerVehicleSale({
      vehicleId: d.vehicleId,
      customerId: d.customerId,
      saleDate: parseDateInput(d.saleDate),
      totalAmount: d.totalAmount,
      downPayment: d.paymentMethod === "PARCELADO" ? d.downPayment : 0,
      installmentsCount: d.paymentMethod === "PARCELADO" ? d.installmentsCount : 0,
      paymentMethod: d.paymentMethod,
      sellerName,
      sellerId: d.sellerId || null,
      commissionAmount: Math.max(0, d.commissionAmount || 0),
      referrals: d.referrals ?? [],
      transferCharged: Boolean(d.transferCharged),
      transferAmount: Math.max(0, d.transferAmount || 0),
      takeReturnCommission: Boolean(d.takeReturnCommission),
      insuranceSold: d.paymentMethod === "FINANCIADO" && Boolean(d.insuranceSold),
      viaPaidTraffic: Boolean(d.viaPaidTraffic),
      installmentsInfoCount: d.paymentMethod !== "A_VISTA" ? d.installmentsInfoCount ?? null : null,
      installmentsInfoAmount: d.paymentMethod !== "A_VISTA" ? d.installmentsInfoAmount ?? null : null,
      financerName,
      financedAmount: d.paymentMethod === "FINANCIADO" ? d.financedAmount ?? null : null,
      financerAccountId: d.paymentMethod === "FINANCIADO" ? d.financerAccountId || null : null,
      returnLevel,
      notes: d.notes || null,
      buyerBankName: d.buyerBankName || null,
      buyerBankAgency: d.buyerBankAgency || null,
      buyerBankAccount: d.buyerBankAccount || null,
      buyerBankAccountType: d.buyerBankAccountType || null,
      buyerPixKey: d.buyerPixKey || null,
      tradeInAmount,
      tradeInLabel,
      tradeInVehicleId,
      consigned,
      ownerRefundAmount,
      ownerRefundToCapital,
      ownerRefundBeneficiaryId,
      commissionToCapital: Boolean(d.commissionToCapital),
    });
    return sale.id;
  } catch (err) {
    // A venda falhou DEPOIS de o veículo da troca ter sido criado (em outra
    // transação). Desfaz a troca para não deixar o carro "órfão" no estoque —
    // troca e venda passam a acontecer de forma tudo-ou-nada.
    if (tradeInVehicleId) await undoTradeInVehicle(tradeInVehicleId);
    throw err;
  }
}
