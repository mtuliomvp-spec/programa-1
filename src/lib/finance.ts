import { prisma } from "@/lib/prisma";
import { getDefaultAccountId } from "@/lib/accounts";
import { structuralCenterId } from "@/lib/structural";
import type { StructuralKey } from "@/lib/structural-flows";
import type {
  CategoriaCustoVeiculo,
  CategoriaPagar,
  FormaPagamento,
  Prisma,
} from "@prisma/client";

/**
 * Camada central que integra Estoque, Vendas e Peças ao Financeiro.
 * Toda entrada/saída de dinheiro do sistema nasce aqui, garantindo que
 * Contas a Pagar, Contas a Receber e o Fluxo de Caixa fiquem sempre
 * consistentes com o que acontece no estoque e nas vendas.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Divide um valor em N parcelas, ajustando a última para não perder centavos. */
function splitInstallments(total: number, count: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) =>
    (base + (i < remainder ? 1 : 0)) / 100,
  );
}

// ---------------------------------------------------------------------------
// Estoque de veículos -> Contas a Pagar
// ---------------------------------------------------------------------------

export type TipoAquisicao = "A_VISTA" | "PARCELADO" | "FINANCIADO" | "CONSORCIO";

export async function createVehicleWithPayable(input: {
  brand: string;
  model: string;
  version?: string | null;
  manufactureYear: number;
  modelYear: number;
  plate: string;
  chassi?: string | null;
  color?: string | null;
  km: number;
  fuel?: string | null;
  transmission?: string | null;
  purchasePrice: number;
  salePrice: number;
  entryDate: Date;
  notes?: string | null;
  supplierId?: string | null;
  alreadyPaid: boolean;
  dueDate?: Date | null;
  acquisitionType?: TipoAquisicao;
  downPayment?: number;
  installmentsCount?: number;
  financerName?: string | null;
  payoffAmount?: number;
  payoffTo?: string | null;
  debtsAmount?: number;
  // Trade-in: o líquido ao vendedor já é quitado pela troca (não vira conta a
  // pagar em aberto nem sai dinheiro do caixa).
  liquidoSettledByTrade?: boolean;
  tradeNote?: string | null;
}) {
  const defaultAccountId = input.alreadyPaid ? await getDefaultAccountId() : null;
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  const acquisitionType = input.acquisitionType ?? "A_VISTA";
  const payoffAmount = Math.max(0, input.payoffAmount ?? 0);
  const debtsAmount = Math.max(0, input.debtsAmount ?? 0);
  const liquido = Math.max(0, Math.round((input.purchasePrice - payoffAmount - debtsAmount) * 100) / 100);
  const downPayment = Math.min(Math.max(0, input.downPayment ?? 0), liquido);
  const installmentsCount = Math.max(1, input.installmentsCount ?? 1);
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.create({
      data: {
        brand: input.brand,
        model: input.model,
        version: input.version || null,
        manufactureYear: input.manufactureYear,
        modelYear: input.modelYear,
        plate: input.plate,
        chassi: input.chassi || null,
        color: input.color || null,
        km: input.km,
        fuel: input.fuel || null,
        transmission: input.transmission || null,
        purchasePrice: input.purchasePrice,
        salePrice: input.salePrice,
        acquisitionType,
        downPayment,
        installmentsCount,
        financerName: input.financerName || null,
        payoffAmount,
        payoffTo: input.payoffTo || null,
        debtsAmount,
        entryDate: input.entryDate,
        notes: input.notes || null,
        supplierId: input.supplierId || null,
      },
    });

    if (input.purchasePrice > 0) {
      await createAcquisitionPayables(tx, {
        vehicleId: vehicle.id,
        label: `${input.brand} ${input.model} - placa ${input.plate}`,
        total: input.purchasePrice,
        entryDate: input.entryDate,
        dueDate: input.dueDate || input.entryDate,
        supplierId: input.supplierId || null,
        veiculosCenterId,
        acquisitionType,
        downPayment,
        installmentsCount,
        financerName: input.financerName || null,
        payoffAmount,
        payoffTo: input.payoffTo || null,
        debtsAmount,
        liquidoSettledByTrade: input.liquidoSettledByTrade,
        tradeNote: input.tradeNote || null,
        alreadyPaid: input.alreadyPaid,
        defaultAccountId,
      });
    }

    return vehicle;
  });
}

/**
 * Gera as contas a pagar da compra do veículo conforme a forma de aquisição:
 * - À vista: uma conta única no valor total.
 * - Parcelado/Financiado/Consórcio: entrada (se houver) + N parcelas mensais
 *   do valor restante. No financiado/consórcio, as parcelas indicam a
 *   financeira; a entrada fica com o fornecedor.
 */
async function createAcquisitionPayables(
  tx: Prisma.TransactionClient,
  input: {
    vehicleId: string;
    label: string;
    total: number;
    entryDate: Date;
    dueDate: Date;
    supplierId: string | null;
    veiculosCenterId: string;
    acquisitionType: TipoAquisicao;
    downPayment: number;
    installmentsCount: number;
    financerName: string | null;
    payoffAmount?: number;
    payoffTo?: string | null;
    debtsAmount?: number;
    liquidoSettledByTrade?: boolean;
    tradeNote?: string | null;
    alreadyPaid: boolean;
    defaultAccountId: string | null;
  },
) {
  const base = {
    category: "COMPRA_VEICULO" as CategoriaPagar,
    vehicleId: input.vehicleId,
    costCenterId: input.veiculosCenterId,
  };

  const payoffAmount = Math.max(0, input.payoffAmount ?? 0);
  const debtsAmount = Math.max(0, input.debtsAmount ?? 0);

  // Repasse: quitação do financiamento (banco) e débitos do veículo (órgãos)
  // são contas a pagar separadas, com credores próprios, abatendo o valor
  // negociado. O que sobra é o líquido pago ao vendedor.
  if (payoffAmount > 0) {
    await tx.payable.create({
      data: {
        ...base,
        description: `Quitação do financiamento ${input.label}${input.payoffTo ? ` (${input.payoffTo})` : ""}`,
        amount: payoffAmount,
        dueDate: input.dueDate,
        status: "PENDENTE",
        supplierId: null,
      },
    });
  }
  if (debtsAmount > 0) {
    await tx.payable.create({
      data: {
        ...base,
        description: `Débitos do veículo (repasse) ${input.label}`,
        amount: debtsAmount,
        dueDate: input.dueDate,
        status: "PENDENTE",
        supplierId: null,
      },
    });
  }

  // Líquido ao vendedor = valor negociado − quitação − débitos.
  const liquido = Math.max(0, Math.round((input.total - payoffAmount - debtsAmount) * 100) / 100);
  if (liquido <= 0) return;

  const repasse = payoffAmount > 0 || debtsAmount > 0;
  const vendedorLabel = repasse ? " (líquido ao vendedor)" : "";

  // À vista: uma conta só (o líquido).
  if (input.acquisitionType === "A_VISTA") {
    // Numa troca, o líquido já está quitado pelo carro recebido: registra como
    // PAGO, sem conta financeira (não sai dinheiro do caixa).
    const settledByTrade = Boolean(input.liquidoSettledByTrade);
    await tx.payable.create({
      data: {
        ...base,
        description: settledByTrade
          ? `Compra do veículo ${input.label} (líquido quitado pela troca)`
          : `Compra do veículo ${input.label}${vendedorLabel}`,
        amount: liquido,
        dueDate: input.alreadyPaid || settledByTrade ? input.entryDate : input.dueDate,
        paymentDate: input.alreadyPaid || settledByTrade ? input.entryDate : null,
        status: input.alreadyPaid || settledByTrade ? "PAGO" : "PENDENTE",
        supplierId: input.supplierId,
        accountId: input.alreadyPaid ? input.defaultAccountId : null,
        notes: settledByTrade ? input.tradeNote : undefined,
      },
    });
    return;
  }

  const financiado =
    input.acquisitionType === "FINANCIADO" || input.acquisitionType === "CONSORCIO";
  const financerLabel = input.financerName ? ` (${input.financerName})` : "";

  // Entrada (se houver) — vai para o fornecedor.
  if (input.downPayment > 0) {
    await tx.payable.create({
      data: {
        ...base,
        description: `Entrada da compra ${input.label}${vendedorLabel}`,
        amount: input.downPayment,
        dueDate: input.dueDate,
        status: "PENDENTE",
        supplierId: input.supplierId,
      },
    });
  }

  const remaining = Math.round((liquido - input.downPayment) * 100) / 100;
  if (remaining <= 0) return;

  const count = Math.max(1, input.installmentsCount);
  const parcelas = splitInstallments(remaining, count);
  for (let i = 0; i < parcelas.length; i++) {
    await tx.payable.create({
      data: {
        ...base,
        description: `${financiado ? "Financiamento" : "Parcela"} do veículo ${input.label}${financerLabel} - Parcela ${i + 1}/${count}`,
        amount: parcelas[i],
        dueDate: addMonths(input.dueDate, i + 1),
        status: "PENDENTE",
        // No financiado/consórcio o credor é a financeira, não o fornecedor.
        supplierId: financiado ? null : input.supplierId,
      },
    });
  }
}

/**
 * Recria as contas a pagar da compra ao editar a forma de aquisição.
 * Só age se NENHUMA conta da compra já tiver sido paga — nesse caso apaga as
 * pendentes de compra e gera as novas conforme a forma escolhida. Se já houver
 * pagamento, preserva tudo (não mexe no que já foi liquidado).
 */
export async function regenerateVehicleAcquisitionPayables(vehicleId: string) {
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    const purchasePayables = await tx.payable.findMany({
      where: { vehicleId, category: "COMPRA_VEICULO" },
    });
    // Se algo da compra já foi pago, não recriar (evita desfazer baixas).
    if (purchasePayables.some((p) => p.status === "PAGO")) return;

    await tx.payable.deleteMany({ where: { vehicleId, category: "COMPRA_VEICULO" } });

    if (vehicle.purchasePrice > 0) {
      await createAcquisitionPayables(tx, {
        vehicleId: vehicle.id,
        label: `${vehicle.brand} ${vehicle.model} - placa ${vehicle.plate}`,
        total: vehicle.purchasePrice,
        entryDate: vehicle.entryDate,
        dueDate: vehicle.entryDate,
        supplierId: vehicle.supplierId,
        veiculosCenterId,
        acquisitionType: vehicle.acquisitionType as TipoAquisicao,
        downPayment: vehicle.downPayment,
        installmentsCount: vehicle.installmentsCount,
        financerName: vehicle.financerName,
        payoffAmount: vehicle.payoffAmount,
        payoffTo: vehicle.payoffTo,
        debtsAmount: vehicle.debtsAmount,
        alreadyPaid: false,
        defaultAccountId: null,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Custos por veículo -> Contas a Pagar
// ---------------------------------------------------------------------------

export async function addVehicleCostWithPayable(input: {
  vehicleId: string;
  description: string;
  category: CategoriaCustoVeiculo;
  amount: number;
  date: Date;
  notes?: string | null;
  supplierId?: string | null;
  alreadyPaid: boolean;
  dueDate?: Date | null;
  installments?: number;
}) {
  const defaultAccountId = input.alreadyPaid ? await getDefaultAccountId() : null;
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: input.vehicleId },
    });
    const suffix = `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`;
    const count = Math.max(1, input.installments ?? 1);
    const firstDue = input.alreadyPaid ? input.date : input.dueDate || input.date;

    // Parcelado (ex.: IPVA em 3x): divide o total em N parcelas mensais,
    // cada uma com custo e conta a pagar próprios.
    const amounts = count > 1 ? splitInstallments(input.amount, count) : [input.amount];

    let firstCost = null;
    for (let i = 0; i < amounts.length; i++) {
      const label =
        count > 1 ? `${input.description} - Parcela ${i + 1}/${count}` : input.description;
      const dueDate = addMonths(firstDue, i);
      const paid = input.alreadyPaid && count === 1;

      const payable = await tx.payable.create({
        data: {
          description: `${label} - ${suffix}`,
          category: "DESPESA_OPERACIONAL",
          amount: amounts[i],
          dueDate,
          paymentDate: paid ? input.date : null,
          status: paid ? "PAGO" : "PENDENTE",
          supplierId: input.supplierId || null,
          vehicleId: vehicle.id,
          notes: input.notes || null,
          accountId: paid ? defaultAccountId : null,
          costCenterId: veiculosCenterId,
        },
      });

      const cost = await tx.vehicleCost.create({
        data: {
          vehicleId: vehicle.id,
          description: label,
          category: input.category,
          amount: amounts[i],
          date: count > 1 ? dueDate : input.date,
          notes: input.notes || null,
          payableId: payable.id,
        },
      });
      firstCost = firstCost ?? cost;
    }

    return firstCost!;
  });
}

export async function deleteVehicleCost(costId: string) {
  return prisma.$transaction(async (tx) => {
    const cost = await tx.vehicleCost.findUniqueOrThrow({
      where: { id: costId },
    });
    await tx.vehicleCost.delete({ where: { id: costId } });
    if (cost.payableId) {
      await tx.payable.delete({ where: { id: cost.payableId } });
    }
  });
}

// ---------------------------------------------------------------------------
// Peças -> Contas a Pagar (entrada de estoque / compra)
// ---------------------------------------------------------------------------

export async function createPartWithPayable(input: {
  code: string;
  name: string;
  description?: string | null;
  quantity: number;
  minQuantity: number;
  costPrice: number;
  salePrice: number;
  supplierId?: string | null;
  alreadyPaid: boolean;
  dueDate?: Date | null;
}) {
  const defaultAccountId = input.alreadyPaid ? await getDefaultAccountId() : null;
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  return prisma.$transaction(async (tx) => {
    const part = await tx.part.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description || null,
        quantity: input.quantity,
        minQuantity: input.minQuantity,
        costPrice: input.costPrice,
        salePrice: input.salePrice,
        supplierId: input.supplierId || null,
      },
    });

    const totalCost = input.costPrice * input.quantity;
    const today = new Date();
    if (totalCost > 0) {
      await tx.payable.create({
        data: {
          description: `Compra de peças: ${input.name} (${input.quantity} un.)`,
          category: "COMPRA_PECA" as CategoriaPagar,
          amount: totalCost,
          dueDate: input.alreadyPaid ? today : input.dueDate || today,
          paymentDate: input.alreadyPaid ? today : null,
          status: input.alreadyPaid ? "PAGO" : "PENDENTE",
          supplierId: input.supplierId || null,
          partId: part.id,
          accountId: input.alreadyPaid ? defaultAccountId : null,
          costCenterId: veiculosCenterId,
        },
      });
    }

    return part;
  });
}

export async function addPartStockWithPayable(input: {
  partId: string;
  quantity: number;
  costPrice: number;
  supplierId?: string | null;
  alreadyPaid: boolean;
  dueDate?: Date | null;
}) {
  const defaultAccountId = input.alreadyPaid ? await getDefaultAccountId() : null;
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  return prisma.$transaction(async (tx) => {
    const part = await tx.part.update({
      where: { id: input.partId },
      data: {
        quantity: { increment: input.quantity },
        costPrice: input.costPrice,
        supplierId: input.supplierId || undefined,
      },
    });

    const totalCost = input.costPrice * input.quantity;
    const today = new Date();
    if (totalCost > 0) {
      await tx.payable.create({
        data: {
          description: `Reposição de estoque: ${part.name} (${input.quantity} un.)`,
          category: "COMPRA_PECA" as CategoriaPagar,
          amount: totalCost,
          dueDate: input.alreadyPaid ? today : input.dueDate || today,
          paymentDate: input.alreadyPaid ? today : null,
          status: input.alreadyPaid ? "PAGO" : "PENDENTE",
          supplierId: input.supplierId || null,
          partId: part.id,
          accountId: input.alreadyPaid ? defaultAccountId : null,
          costCenterId: veiculosCenterId,
        },
      });
    }

    return part;
  });
}

// ---------------------------------------------------------------------------
// Vendas de veículos -> Contas a Receber
// ---------------------------------------------------------------------------

export async function registerVehicleSale(input: {
  vehicleId: string;
  customerId: string;
  saleDate: Date;
  totalAmount: number;
  downPayment: number;
  installmentsCount: number;
  paymentMethod: FormaPagamento;
  sellerName?: string | null;
  notes?: string | null;
  // Entrada dada em troca por outro veículo (não entra no caixa: é quitada
  // pelo carro recebido). Reduz o que o cliente paga em dinheiro.
  tradeInAmount?: number;
  tradeInLabel?: string | null;
  tradeInVehicleId?: string | null;
}) {
  const defaultAccountId = await getDefaultAccountId();
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: input.vehicleId },
    });

    if (vehicle.status === "VENDIDO") {
      throw new Error("Este veículo já foi vendido.");
    }

    const sale = await tx.sale.create({
      data: {
        vehicleId: input.vehicleId,
        customerId: input.customerId,
        saleDate: input.saleDate,
        totalAmount: input.totalAmount,
        downPayment: input.downPayment,
        installmentsCount: input.installmentsCount,
        paymentMethod: input.paymentMethod,
        sellerName: input.sellerName || null,
        notes: input.notes || null,
        tradeInVehicleId: input.tradeInVehicleId || null,
      },
    });

    await tx.vehicle.update({
      where: { id: input.vehicleId },
      data: { status: "VENDIDO" },
    });

    const receivablesData: Prisma.ReceivableCreateManyInput[] = [];
    const baseDescription = `Venda do veículo ${vehicle.brand} ${vehicle.model} - placa ${vehicle.plate}`;

    const tradeIn = Math.max(0, Math.min(input.tradeInAmount ?? 0, input.totalAmount));
    // Entrada em troca: recebida (não fica devendo) mas SEM conta financeira,
    // pois quem "pagou" foi o veículo recebido — não entra dinheiro no caixa.
    if (tradeIn > 0) {
      receivablesData.push({
        description: `${baseDescription} - Entrada em troca${input.tradeInLabel ? ` (${input.tradeInLabel})` : ""}`,
        category: "VENDA_VEICULO",
        amount: tradeIn,
        dueDate: input.saleDate,
        receivedDate: input.saleDate,
        status: "RECEBIDO",
        customerId: input.customerId,
        saleId: sale.id,
        installmentNumber: 0,
        accountId: null,
      });
    }

    // O que resta a cobrar em dinheiro (depois de abater a troca).
    const billable = Math.max(0, Math.round((input.totalAmount - tradeIn) * 100) / 100);

    if (input.paymentMethod === "PARCELADO") {
      const cashDown = Math.max(0, Math.min(input.downPayment, billable));
      if (cashDown > 0) {
        receivablesData.push({
          description: `${baseDescription} - Entrada`,
          category: "VENDA_VEICULO",
          amount: cashDown,
          dueDate: input.saleDate,
          receivedDate: input.saleDate,
          status: "RECEBIDO",
          customerId: input.customerId,
          saleId: sale.id,
          installmentNumber: 0,
          totalInstallments: input.installmentsCount,
          accountId: defaultAccountId,
        });
      }

      const remaining = Math.max(0, Math.round((billable - cashDown) * 100) / 100);
      const count = Math.max(1, input.installmentsCount);
      const parcelas = splitInstallments(remaining, count);
      parcelas.forEach((amount, index) => {
        receivablesData.push({
          description: `${baseDescription} - Parcela ${index + 1}/${count}`,
          category: "VENDA_VEICULO",
          amount,
          dueDate: addMonths(input.saleDate, index + 1),
          status: "PENDENTE",
          customerId: input.customerId,
          saleId: sale.id,
          installmentNumber: index + 1,
          totalInstallments: count,
        });
      });
    } else if (input.paymentMethod === "FINANCIADO") {
      if (billable > 0) {
        receivablesData.push({
          description: `${baseDescription} - Repasse financiamento`,
          category: "VENDA_VEICULO",
          amount: billable,
          dueDate: addDays(input.saleDate, 5),
          status: "PENDENTE",
          customerId: input.customerId,
          saleId: sale.id,
        });
      }
    } else if (billable > 0) {
      receivablesData.push({
        description: `${baseDescription} - À vista`,
        category: "VENDA_VEICULO",
        amount: billable,
        dueDate: input.saleDate,
        receivedDate: input.saleDate,
        status: "RECEBIDO",
        customerId: input.customerId,
        saleId: sale.id,
        accountId: defaultAccountId,
      });
    }

    await tx.receivable.createMany({
      data: receivablesData.map((r) => ({ ...r, costCenterId: veiculosCenterId })),
    });

    return sale;
  });
}

export async function cancelVehicleSale(saleId: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
    await tx.receivable.deleteMany({
      where: { saleId, status: "PENDENTE" },
    });
    await tx.sale.update({
      where: { id: saleId },
      data: { status: "CANCELADA" },
    });
    await tx.vehicle.update({
      where: { id: sale.vehicleId },
      data: { status: "ESTOQUE" },
    });
  });
}

// ---------------------------------------------------------------------------
// Vendas de peças -> Contas a Receber
// ---------------------------------------------------------------------------

export async function registerPartSale(input: {
  partId: string;
  customerId?: string | null;
  quantity: number;
  unitPrice: number;
  saleDate: Date;
  paymentMethod: FormaPagamento;
  installmentsCount?: number;
  notes?: string | null;
}) {
  const defaultAccountId = await getDefaultAccountId();
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  return prisma.$transaction(async (tx) => {
    const part = await tx.part.findUniqueOrThrow({ where: { id: input.partId } });
    if (part.quantity < input.quantity) {
      throw new Error(
        `Estoque insuficiente de "${part.name}". Disponível: ${part.quantity}.`,
      );
    }

    const totalAmount = input.quantity * input.unitPrice;

    const partSale = await tx.partSale.create({
      data: {
        partId: input.partId,
        customerId: input.customerId || null,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        totalAmount,
        saleDate: input.saleDate,
        paymentMethod: input.paymentMethod,
        notes: input.notes || null,
      },
    });

    await tx.part.update({
      where: { id: input.partId },
      data: { quantity: { decrement: input.quantity } },
    });

    const baseDescription = `Venda de peça: ${part.name} (${input.quantity} un.)`;
    const receivablesData: Prisma.ReceivableCreateManyInput[] = [];

    if (input.paymentMethod === "PARCELADO" && (input.installmentsCount || 0) > 1) {
      const count = input.installmentsCount!;
      const parcelas = splitInstallments(totalAmount, count);
      parcelas.forEach((amount, index) => {
        receivablesData.push({
          description: `${baseDescription} - Parcela ${index + 1}/${count}`,
          category: "VENDA_PECA",
          amount,
          dueDate: addMonths(input.saleDate, index + 1),
          status: "PENDENTE",
          customerId: input.customerId || null,
          partSaleId: partSale.id,
          installmentNumber: index + 1,
          totalInstallments: count,
        });
      });
    } else if (input.paymentMethod === "A_VISTA") {
      receivablesData.push({
        description: `${baseDescription} - À vista`,
        category: "VENDA_PECA",
        amount: totalAmount,
        dueDate: input.saleDate,
        receivedDate: input.saleDate,
        status: "RECEBIDO",
        customerId: input.customerId || null,
        partSaleId: partSale.id,
        accountId: defaultAccountId,
      });
    } else {
      receivablesData.push({
        description: `${baseDescription} - A prazo`,
        category: "VENDA_PECA",
        amount: totalAmount,
        dueDate: addDays(input.saleDate, 30),
        status: "PENDENTE",
        customerId: input.customerId || null,
        partSaleId: partSale.id,
      });
    }

    await tx.receivable.createMany({
      data: receivablesData.map((r) => ({ ...r, costCenterId: veiculosCenterId })),
    });

    return partSale;
  });
}

// ---------------------------------------------------------------------------
// Baixas manuais
// ---------------------------------------------------------------------------

export async function markPayablePaid(id: string, paymentDate: Date, accountId?: string | null) {
  const account = accountId ?? (await getDefaultAccountId());
  return prisma.payable.update({
    where: { id },
    data: { status: "PAGO", paymentDate, accountId: account },
  });
}

export async function markPayablePending(id: string) {
  return prisma.payable.update({
    where: { id },
    data: { status: "PENDENTE", paymentDate: null, accountId: null },
  });
}

export async function markReceivableReceived(id: string, receivedDate: Date, accountId?: string | null) {
  const account = accountId ?? (await getDefaultAccountId());
  return prisma.receivable.update({
    where: { id },
    data: { status: "RECEBIDO", receivedDate, accountId: account },
  });
}

export async function markReceivablePending(id: string) {
  return prisma.receivable.update({
    where: { id },
    data: { status: "PENDENTE", receivedDate: null, accountId: null },
  });
}

export async function createManualPayable(input: {
  description: string;
  category: CategoriaPagar;
  amount: number;
  dueDate: Date;
  supplierId?: string | null;
  costCenterId?: string | null;
  structuralKey?: StructuralKey;
  notes?: string | null;
  alreadyPaid: boolean;
}) {
  const defaultAccountId = input.alreadyPaid ? await getDefaultAccountId() : null;
  return prisma.payable.create({
    data: {
      description: input.description,
      category: input.category,
      amount: input.amount,
      dueDate: input.dueDate,
      paymentDate: input.alreadyPaid ? input.dueDate : null,
      status: input.alreadyPaid ? "PAGO" : "PENDENTE",
      supplierId: input.supplierId || null,
      costCenterId:
        input.costCenterId || (await structuralCenterId(input.structuralKey || "ADMINISTRATIVO")),
      accountId: defaultAccountId,
      notes: input.notes || null,
    },
  });
}

// ---------------------------------------------------------------------------
// Lançamento avulso no Movimento de caixa diário (livro caixa)
// ---------------------------------------------------------------------------

/**
 * Lança uma entrada ou saída direto no caixa/banco escolhido, já baixada na
 * data informada. É o "lançamento manual" do movimento de caixa diário: nada é
 * lançado sem comando, e o valor sempre passa por uma conta financeira.
 *
 * - Saída  => Conta a Pagar já PAGA na conta escolhida.
 * - Entrada => Conta a Receber já RECEBIDA na conta escolhida.
 */
export async function createCashEntry(input: {
  kind: "entrada" | "saida";
  description: string;
  amount: number;
  date: Date;
  accountId: string;
  category?: CategoriaPagar;
  structuralKey?: StructuralKey;
  notes?: string | null;
}) {
  const centerId = await structuralCenterId(input.structuralKey || "ADMINISTRATIVO");
  if (input.kind === "entrada") {
    return prisma.receivable.create({
      data: {
        description: input.description,
        category: "OUTROS",
        amount: input.amount,
        dueDate: input.date,
        receivedDate: input.date,
        status: "RECEBIDO",
        accountId: input.accountId,
        costCenterId: centerId,
        notes: input.notes || null,
      },
    });
  }
  return prisma.payable.create({
    data: {
      description: input.description,
      category: input.category || "OUTROS",
      amount: input.amount,
      dueDate: input.date,
      paymentDate: input.date,
      status: "PAGO",
      accountId: input.accountId,
      costCenterId: centerId,
      notes: input.notes || null,
    },
  });
}

/**
 * Exclui um lançamento avulso do movimento de caixa. Só remove entradas/saídas
 * que não estejam vinculadas a veículo, peça, venda, consórcio ou recorrência —
 * baixas geradas por essas operações devem ser revertidas na própria origem.
 */
export async function deleteCashEntry(kind: "entrada" | "saida", id: string) {
  if (kind === "entrada") {
    const r = await prisma.receivable.findUnique({ where: { id } });
    if (!r) return;
    if (r.saleId || r.partSaleId || r.recurringId || r.installmentNumber != null) {
      throw new Error("Este lançamento veio de uma venda/recorrência e deve ser revertido na origem.");
    }
    await prisma.receivable.delete({ where: { id } });
    return;
  }
  const p = await prisma.payable.findUnique({ where: { id } });
  if (!p) return;
  if (p.vehicleId || p.partId || p.recurringId || p.consortiumId || p.employeeId) {
    throw new Error("Este lançamento veio de outra operação e deve ser revertido na origem.");
  }
  await prisma.payable.delete({ where: { id } });
}

export async function createManualReceivable(input: {
  description: string;
  amount: number;
  dueDate: Date;
  customerId?: string | null;
  costCenterId?: string | null;
  structuralKey?: StructuralKey;
  notes?: string | null;
  alreadyReceived: boolean;
}) {
  const defaultAccountId = input.alreadyReceived ? await getDefaultAccountId() : null;
  return prisma.receivable.create({
    data: {
      description: input.description,
      category: "OUTROS",
      amount: input.amount,
      dueDate: input.dueDate,
      receivedDate: input.alreadyReceived ? input.dueDate : null,
      status: input.alreadyReceived ? "RECEBIDO" : "PENDENTE",
      customerId: input.customerId || null,
      costCenterId:
        input.costCenterId || (await structuralCenterId(input.structuralKey || "ADMINISTRATIVO")),
      accountId: defaultAccountId,
      notes: input.notes || null,
    },
  });
}
