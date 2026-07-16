import { prisma } from "@/lib/prisma";
import { getDefaultAccountId, getNeutralAccountId } from "@/lib/accounts";
import { structuralCenterId } from "@/lib/structural";
import { computeReturn, retornoLabel } from "@/lib/retorno";
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
  // Troca: o líquido é "pago" pelo carro recebido — passa pelo Banco Neutro
  // (conta de compensação que fica sempre em zero), não pelo caixa real.
  const neutralAccountId = input.liquidoSettledByTrade ? await getNeutralAccountId() : null;
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
        neutralAccountId,
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
    neutralAccountId?: string | null;
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
        // Troca → Banco Neutro (compensa a "Entrada em troca"); compra à vista
        // paga → conta padrão; a prazo → sem conta até a baixa.
        accountId: settledByTrade
          ? input.neutralAccountId ?? null
          : input.alreadyPaid
            ? input.defaultAccountId
            : null,
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
  const adminCenterId = await structuralCenterId("ADMINISTRATIVO");
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: input.vehicleId },
    });
    const suffix = `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`;
    // Custo lançado com o veículo já vendido é um custo pós-venda: sai do centro
    // Veículos (o carro não está mais no estoque) e vira despesa Administrativa.
    const postSale = vehicle.status === "VENDIDO";
    const costCenterId = postSale ? adminCenterId : veiculosCenterId;
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
          costCenterId,
        },
      });

      const cost = await tx.vehicleCost.create({
        data: {
          vehicleId: vehicle.id,
          description: label,
          category: input.category,
          amount: amounts[i],
          date: count > 1 ? dueDate : input.date,
          postSale,
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

/**
 * Recebe um sinal / entrada antecipada de um veículo AINDA em estoque (antes de
 * fechar a venda). O dinheiro entra na conta escolhida e fica vinculado ao
 * veículo (sem venda). Quando a venda for fechada, esse valor é abatido
 * automaticamente do que o cliente tem a pagar.
 */
export async function receiveVehicleAdvance(input: {
  vehicleId: string;
  amount: number;
  date: Date;
  accountId?: string | null;
  customerId?: string | null;
  notes?: string | null;
}) {
  const accountId = input.accountId ?? (await getDefaultAccountId());
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
  return prisma.receivable.create({
    data: {
      description: `Sinal / entrada antecipada - ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
      category: "VENDA_VEICULO",
      amount: input.amount,
      dueDate: input.date,
      receivedDate: input.date,
      status: "RECEBIDO",
      customerId: input.customerId || null,
      vehicleId: input.vehicleId,
      accountId,
      costCenterId: veiculosCenterId,
      notes: input.notes || null,
    },
  });
}

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
  // Financiamento: banco/financeira e valor financiado (repasse). O que sobrar
  // do valor a cobrar (billable − financiado) é a entrada paga agora.
  financerName?: string | null;
  financedAmount?: number | null;
  // Conta financeira da financeira: o valor financiado entra nela (aguardando a
  // financeira transferir para a conta da empresa).
  financerAccountId?: string | null;
  // Retorno da financeira (nível R-xx; 0 = sem retorno).
  returnLevel?: number;
  // Entrada dada em troca por outro veículo (não entra no caixa: é quitada
  // pelo carro recebido). Reduz o que o cliente paga em dinheiro.
  tradeInAmount?: number;
  tradeInLabel?: string | null;
  tradeInVehicleId?: string | null;
}) {
  const defaultAccountId = await getDefaultAccountId();
  // A entrada em troca é compensada pelo Banco Neutro (fica sempre em zero),
  // casando com a "Compra do veículo (líquido quitado pela troca)".
  const neutralAccountId =
    (input.tradeInAmount ?? 0) > 0 ? await getNeutralAccountId() : null;
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: input.vehicleId },
    });

    if (vehicle.status === "VENDIDO") {
      throw new Error("Este veículo já foi vendido.");
    }

    // Sale.vehicleId é único: uma venda ANTERIOR cancelada deste veículo ainda
    // ocupa esse "slot" e impediria a nova venda. Como a venda cancelada já foi
    // totalmente revertida, removemos o registro-tumba para liberar a revenda.
    const canceladas = await tx.sale.findMany({
      where: { vehicleId: input.vehicleId, status: "CANCELADA" },
      select: { id: true },
    });
    if (canceladas.length > 0) {
      const ids = canceladas.map((s) => s.id);
      await tx.receivable.deleteMany({ where: { saleId: { in: ids } } });
      await tx.sale.deleteMany({ where: { id: { in: ids } } });
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
        financerName: input.paymentMethod === "FINANCIADO" ? input.financerName || null : null,
        financedAmount: input.paymentMethod === "FINANCIADO" ? input.financedAmount ?? null : null,
        financerAccountId: input.paymentMethod === "FINANCIADO" ? input.financerAccountId || null : null,
        returnLevel: input.paymentMethod === "FINANCIADO" ? Math.max(0, input.returnLevel ?? 0) : 0,
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
        // Banco Neutro: compensa a "Compra do veículo (líquido quitado pela troca)".
        accountId: neutralAccountId,
      });
    }

    // Sinal / entrada antecipada: valores já recebidos para este veículo ANTES
    // do fechamento da venda (adiantamentos). No fechamento, damos baixa: são
    // vinculados à venda e abatem do que ainda há a cobrar.
    const advances = await tx.receivable.findMany({
      where: { vehicleId: input.vehicleId, saleId: null, status: "RECEBIDO" },
      select: { id: true, amount: true },
    });
    const advanceTotal = advances.reduce((s, a) => s + a.amount, 0);
    if (advances.length > 0) {
      await tx.receivable.updateMany({
        where: { id: { in: advances.map((a) => a.id) } },
        data: { saleId: sale.id },
      });
    }

    // O que resta a cobrar em dinheiro (depois de abater troca e sinal). Pode
    // ficar negativo quando a troca + o sinal já passam do valor da venda —
    // nesse caso o excedente já é uma devolução ao cliente.
    const rawBillable = Math.round((input.totalAmount - tradeIn - advanceTotal) * 100) / 100;
    const billable = Math.max(0, rawBillable);

    // Devolução ao cliente = tudo que entrou (troca + sinal + financiado) além
    // do valor da venda. Vira título em Contas a Pagar. Começa pelo excedente
    // de troca + sinal; o financiamento pode somar mais adiante.
    let devolucaoCliente = Math.max(0, Math.round(-rawBillable * 100) / 100);

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
      // Valor financiado pelo banco (repasse). Se não informado, financia todo o
      // restante a pagar. Pode ser MAIOR que o restante — nesse caso o banco
      // liberou mais do que faltava e a diferença é devolvida ao cliente.
      const financed =
        input.financedAmount != null && input.financedAmount > 0
          ? input.financedAmount
          : billable;
      // Parte do financiado que efetivamente cobre o carro.
      const financedParaCarro = Math.min(financed, billable);
      // O que ainda sobra a receber do cliente (entrada).
      const entrada = Math.max(0, Math.round((billable - financedParaCarro) * 100) / 100);
      // Excedente do financiamento sobre o restante soma na devolução (que já
      // pode conter o excedente da troca + sinal).
      devolucaoCliente = Math.round((devolucaoCliente + Math.max(0, financed - billable)) * 100) / 100;

      if (entrada > 0) {
        // A entrada do cliente vai para Contas a Receber como PENDENTE: o
        // cliente paga (total ou parcial) e aí se dá baixa na conta do depósito.
        receivablesData.push({
          description: `${baseDescription} - Entrada do cliente`,
          category: "VENDA_VEICULO",
          amount: entrada,
          dueDate: input.saleDate,
          status: "PENDENTE",
          customerId: input.customerId,
          saleId: sale.id,
          installmentNumber: 0,
          accountId: null,
        });
      }
      if (financed > 0) {
        // Se a financeira tem conta financeira cadastrada, o valor financiado
        // entra NELA (fica lá até a financeira transferir para a empresa). Sem
        // conta, cai no fluxo antigo (a receber pendente).
        const naFinanceira = !!input.financerAccountId;
        receivablesData.push({
          description: `${baseDescription} - Repasse financiamento${input.financerName ? ` (${input.financerName})` : ""}`,
          category: "VENDA_VEICULO",
          amount: financed,
          dueDate: naFinanceira ? input.saleDate : addDays(input.saleDate, 5),
          receivedDate: naFinanceira ? input.saleDate : null,
          status: naFinanceira ? "RECEBIDO" : "PENDENTE",
          customerId: input.customerId,
          saleId: sale.id,
          accountId: naFinanceira ? input.financerAccountId : null,
        });

        // Retorno da financeira: comissão sobre o valor financiado. Só quando há
        // financeira cadastrada (é ela quem paga) e nível > 0. Espelha o repasse:
        // entra RECEBIDO na conta da financeira (que passa a dever o líquido) e
        // é liquidado separado do financiamento. O imposto é retido pela
        // financeira — a loja recebe só o líquido.
        const level = Math.max(0, Math.floor(input.returnLevel ?? 0));
        if (naFinanceira && level > 0) {
          const financerAcc = await tx.financialAccount.findUnique({
            where: { id: input.financerAccountId! },
            select: { returnTaxPercent: true },
          });
          const { gross, tax, net } = computeReturn(
            financed,
            level,
            financerAcc?.returnTaxPercent ?? 0,
          );
          if (net > 0) {
            receivablesData.push({
              description: `${baseDescription} - Retorno da financeira ${retornoLabel(level)} (bruto ${gross.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} − imposto ${tax.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`,
              category: "RETORNO_FINANCEIRA",
              amount: net,
              dueDate: input.saleDate,
              receivedDate: input.saleDate,
              status: "RECEBIDO",
              customerId: input.customerId,
              saleId: sale.id,
              accountId: input.financerAccountId,
            });
            await tx.sale.update({ where: { id: sale.id }, data: { returnNet: net } });
          }
        }
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

    // Devolução ao cliente: o banco financiou mais do que faltava a pagar. A
    // diferença é lançada em Contas a Pagar (a loja recebeu a mais e devolve).
    if (devolucaoCliente > 0) {
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { name: true },
      });
      await tx.payable.create({
        data: {
          description: `Devolução ao cliente${customer?.name ? ` ${customer.name}` : ""} - ${baseDescription}`,
          category: "DEVOLUCAO_CLIENTE",
          amount: devolucaoCliente,
          dueDate: input.saleDate,
          status: "PENDENTE",
          vehicleId: input.vehicleId,
          costCenterId: veiculosCenterId,
          notes: "Excedente do financiamento sobre o restante a pagar da venda.",
        },
      });
    }

    return sale;
  });
}

/**
 * Cancela a venda revertendo TUDO atomicamente: apaga os recebíveis criados
 * pela venda (entrada, à vista, parcelas, repasse do financiamento — inclusive
 * o que entrou na conta da financeira), estorna a baixa do financiamento se já
 * recebida, desfaz o veículo recebido em troca e devolve o carro ao estoque.
 *
 * O SINAL / entrada antecipada NÃO é revertido — ele foi um lançamento à parte,
 * feito antes da venda. Ele é apenas desvinculado da venda e volta a ser um
 * adiantamento do veículo (o dinheiro continua recebido).
 */
export async function cancelVehicleSale(saleId: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { vehicle: { select: { plate: true } } },
    });

    // Idempotente: todos os passos podem rodar de novo com segurança. Isso
    // permite corrigir vendas canceladas por versões antigas (que deixavam os
    // recebíveis RECEBIDOS "presos", divergindo caixa x equação patrimonial).

    // 1) Sinais/adiantamentos (recebíveis com veículo) voltam a ser sinal: só
    //    desvincula da venda; o dinheiro recebido permanece.
    await tx.receivable.updateMany({
      where: { saleId, vehicleId: { not: null } },
      data: { saleId: null },
    });

    // 2) Recebíveis criados pela venda (entrada, à vista, parcelas, repasse) são
    //    apagados — revertendo inclusive o que já estava recebido.
    await tx.receivable.deleteMany({ where: { saleId } });

    // 2b) Devolução ao cliente gerada por esta venda também é revertida (se já
    //     foi paga, apagar o título devolve o dinheiro ao caixa).
    await tx.payable.deleteMany({
      where: { vehicleId: sale.vehicleId, category: "DEVOLUCAO_CLIENTE" },
    });

    // 3) Se o financiamento já foi recebido (baixa: transferência da financeira
    //    para a empresa), estorna essa transferência.
    if (sale.financerSettledAt && sale.financerAccountId && sale.financedAmount) {
      await tx.accountTransfer.deleteMany({
        where: {
          fromId: sale.financerAccountId,
          amount: sale.financedAmount,
          description: { contains: sale.vehicle.plate },
        },
      });
    }

    // 3b) Se o retorno já foi recebido (transferência separada da financeira),
    //     estorna essa transferência também.
    if (sale.returnSettledAt && sale.financerAccountId && sale.returnNet > 0) {
      await tx.accountTransfer.deleteMany({
        where: {
          fromId: sale.financerAccountId,
          amount: sale.returnNet,
          description: { contains: sale.vehicle.plate },
        },
      });
    }

    // 4) Desfaz o veículo recebido em troca (e suas contas).
    if (sale.tradeInVehicleId) {
      const tradeId = sale.tradeInVehicleId;
      await tx.sale.update({ where: { id: saleId }, data: { tradeInVehicleId: null } });
      await tx.vehicleCost.deleteMany({ where: { vehicleId: tradeId } });
      await tx.payable.deleteMany({ where: { vehicleId: tradeId } });
      // deleteMany não estoura se o veículo já tiver sido removido.
      await tx.vehicle.deleteMany({ where: { id: tradeId } });
    }

    // 5) Carro volta ao estoque — a menos que já exista outra venda ativa dele
    //    (evita "roubar" um veículo revendido ao reverter uma venda antiga).
    const outraVendaAtiva = await tx.sale.findFirst({
      where: { vehicleId: sale.vehicleId, id: { not: saleId }, status: "CONCLUIDA" },
      select: { id: true },
    });
    if (!outraVendaAtiva) {
      await tx.vehicle.update({ where: { id: sale.vehicleId }, data: { status: "ESTOQUE" } });
    }
    await tx.sale.update({
      where: { id: saleId },
      data: { status: "CANCELADA", financerSettledAt: null, returnSettledAt: null },
    });
    return sale;
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

/**
 * Recebe um título total ou PARCIALMENTE, creditando a conta escolhida. No
 * parcial, cria um título RECEBIDO com o valor pago (na conta do depósito) e
 * reduz o pendente do original — o restante continua a receber. Ex.: entrada
 * de 100.000, cliente paga 50.000 → 50.000 recebido, 50.000 continua pendente.
 */
export async function receiveReceivable(
  id: string,
  amount: number,
  receivedDate: Date,
  accountId?: string | null,
) {
  const account = accountId ?? (await getDefaultAccountId());
  const r = await prisma.receivable.findUniqueOrThrow({ where: { id } });
  if (r.status === "RECEBIDO") return r;
  const pay = Math.min(Math.max(0, Math.round(amount * 100) / 100), r.amount);
  if (pay <= 0) return r;

  // Pagamento integral (ou do valor cheio): baixa o próprio título.
  if (pay >= r.amount) {
    return prisma.receivable.update({
      where: { id },
      data: { status: "RECEBIDO", receivedDate, accountId: account },
    });
  }

  // Parcial: cria a parcela recebida e reduz o pendente do original.
  return prisma.$transaction(async (tx) => {
    await tx.receivable.create({
      data: {
        description: `${r.description} - Pagamento parcial`,
        category: r.category,
        amount: pay,
        dueDate: r.dueDate,
        receivedDate,
        status: "RECEBIDO",
        customerId: r.customerId,
        saleId: r.saleId,
        vehicleId: r.vehicleId,
        installmentNumber: r.installmentNumber,
        totalInstallments: r.totalInstallments,
        costCenterId: r.costCenterId,
        accountId: account,
      },
    });
    return tx.receivable.update({
      where: { id },
      data: { amount: Math.round((r.amount - pay) * 100) / 100 },
    });
  });
}

export async function createManualPayable(input: {
  description: string;
  category: CategoriaPagar;
  categoryLabel?: string | null;
  amount: number;
  dueDate: Date;
  supplierId?: string | null;
  costCenterId?: string | null;
  structuralKey?: StructuralKey;
  vehicleId?: string | null;
  capitalBeneficiaryId?: string | null;
  notes?: string | null;
  alreadyPaid: boolean;
}) {
  return createExpensePayable({
    description: input.description,
    category: input.category,
    categoryLabel: input.categoryLabel || null,
    amount: input.amount,
    dueDate: input.dueDate,
    paid: input.alreadyPaid,
    supplierId: input.supplierId || null,
    vehicleId: input.vehicleId || null,
    capitalBeneficiaryId: input.capitalBeneficiaryId || null,
    costCenterId: input.costCenterId || null,
    structuralKey: input.structuralKey,
    notes: input.notes || null,
  });
}

/**
 * Resolve um fornecedor pelo nome: reaproveita se já existir (sem diferenciar
 * maiúsculas) ou cadastra um novo. Usado para lançar tarifas com o próprio
 * banco como fornecedor sem precisar cadastrá-lo antes.
 */
export async function resolveSupplierByName(name: string): Promise<string> {
  const trimmed = name.trim();
  const existing = await prisma.supplier.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.supplier.create({ data: { name: trimmed } });
  return created.id;
}

/**
 * Baixa do financiamento: a financeira pagou. Transfere o valor financiado da
 * conta da financeira para a conta da empresa escolhida (o dinheiro passa a ser
 * caixa) e marca a venda como recebida. É o "dar baixa" do repasse.
 */
export async function settleFinancing(saleId: string, accountId: string, date: Date) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { customer: { select: { name: true } }, vehicle: { select: { brand: true, model: true, plate: true } } },
  });
  if (!sale.financerAccountId) throw new Error("Esta venda não tem financeira cadastrada.");
  if (!sale.financedAmount || sale.financedAmount <= 0) throw new Error("Sem valor financiado a receber.");
  if (sale.financerSettledAt) throw new Error("Este financiamento já foi recebido.");
  if (sale.financerAccountId === accountId) throw new Error("Escolha uma conta da empresa (diferente da financeira).");

  return prisma.$transaction(async (tx) => {
    await tx.accountTransfer.create({
      data: {
        fromId: sale.financerAccountId!,
        toId: accountId,
        amount: sale.financedAmount!,
        date,
        description: `Repasse financiamento — ${sale.customer.name} · ${sale.vehicle.brand} ${sale.vehicle.model} (${sale.vehicle.plate})`,
      },
    });
    return tx.sale.update({ where: { id: saleId }, data: { financerSettledAt: date } });
  });
}

/**
 * Recebe o RETORNO da financeira: transfere o valor líquido da conta da
 * financeira para uma conta da empresa. É liquidado SEPARADO do repasse do
 * financiamento (a financeira paga os dois em momentos diferentes).
 */
export async function settleReturn(saleId: string, accountId: string, date: Date) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { customer: { select: { name: true } }, vehicle: { select: { brand: true, model: true, plate: true } } },
  });
  if (!sale.financerAccountId) throw new Error("Esta venda não tem financeira cadastrada.");
  if (!sale.returnNet || sale.returnNet <= 0) throw new Error("Sem retorno a receber nesta venda.");
  if (sale.returnSettledAt) throw new Error("O retorno desta venda já foi recebido.");
  if (sale.financerAccountId === accountId) throw new Error("Escolha uma conta da empresa (diferente da financeira).");

  return prisma.$transaction(async (tx) => {
    await tx.accountTransfer.create({
      data: {
        fromId: sale.financerAccountId!,
        toId: accountId,
        amount: sale.returnNet,
        date,
        description: `Retorno financiamento ${retornoLabel(sale.returnLevel)} — ${sale.customer.name} · ${sale.vehicle.brand} ${sale.vehicle.model} (${sale.vehicle.plate})`,
      },
    });
    return tx.sale.update({ where: { id: saleId }, data: { returnSettledAt: date } });
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
/**
 * Cria uma conta a pagar (saída/despesa) já com todos os vínculos: fornecedor,
 * categoria personalizada, e — conforme o fluxo — veículo (vira custo do carro)
 * ou beneficiário do capital (vira uma movimentação de capital). Usada tanto
 * pelo movimento de caixa quanto pelo lançamento manual de contas a pagar.
 */
export async function createExpensePayable(input: {
  description: string;
  category: CategoriaPagar;
  categoryLabel?: string | null;
  amount: number;
  dueDate: Date;
  paid: boolean;
  paymentDate?: Date;
  accountId?: string | null;
  supplierId?: string | null;
  vehicleId?: string | null;
  capitalBeneficiaryId?: string | null;
  costCenterId?: string | null;
  structuralKey?: StructuralKey;
  notes?: string | null;
}) {
  // Se o veículo já foi vendido, a despesa é pós-venda: sai do centro Veículos
  // (o carro não está mais no estoque) e vira despesa Administrativa; o custo é
  // marcado como pós-venda (não mexe na margem da venda já realizada).
  let vehicleSold = false;
  if (input.vehicleId) {
    const v = await prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { status: true },
    });
    vehicleSold = v?.status === "VENDIDO";
  }
  const centerId =
    input.costCenterId ||
    (input.vehicleId
      ? await structuralCenterId(vehicleSold ? "ADMINISTRATIVO" : "VEICULOS")
      : input.capitalBeneficiaryId
        ? await structuralCenterId("CAPITAL")
        : await structuralCenterId(input.structuralKey || "ADMINISTRATIVO"));
  const paymentDate = input.paid ? input.paymentDate || input.dueDate : null;
  const accountId = input.paid ? input.accountId ?? (await getDefaultAccountId()) : null;

  return prisma.$transaction(async (tx) => {
    const payable = await tx.payable.create({
      data: {
        description: input.description,
        category: input.category,
        categoryLabel: input.categoryLabel || null,
        amount: input.amount,
        dueDate: input.dueDate,
        paymentDate,
        status: input.paid ? "PAGO" : "PENDENTE",
        accountId,
        costCenterId: centerId,
        supplierId: input.supplierId || null,
        vehicleId: input.vehicleId || null,
        notes: input.notes || null,
      },
    });
    if (input.vehicleId) {
      await tx.vehicleCost.create({
        data: {
          vehicleId: input.vehicleId,
          description: input.categoryLabel
            ? `${input.categoryLabel}: ${input.description}`
            : input.description,
          category: "OUTROS",
          amount: input.amount,
          date: input.dueDate,
          postSale: vehicleSold,
          notes: input.notes || null,
          payableId: payable.id,
        },
      });
    }
    if (input.capitalBeneficiaryId) {
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: input.capitalBeneficiaryId,
          kind: "RETIRADA",
          amount: input.amount,
          date: input.dueDate,
          description: input.description,
          payableId: payable.id,
        },
      });
    }
    return payable;
  });
}

export async function createCashEntry(input: {
  kind: "entrada" | "saida";
  description: string;
  amount: number;
  date: Date;
  accountId: string;
  category?: CategoriaPagar;
  categoryLabel?: string | null;
  structuralKey?: StructuralKey;
  supplierId?: string | null;
  vehicleId?: string | null;
  customerId?: string | null;
  capitalBeneficiaryId?: string | null;
  notes?: string | null;
}) {
  if (input.kind === "entrada") {
    const centerId = input.vehicleId
      ? await structuralCenterId("VEICULOS")
      : input.capitalBeneficiaryId
        ? await structuralCenterId("CAPITAL")
        : await structuralCenterId(input.structuralKey || "ADMINISTRATIVO");
    return prisma.$transaction(async (tx) => {
      const receivable = await tx.receivable.create({
        data: {
          description: input.description,
          category: "OUTROS",
          amount: input.amount,
          dueDate: input.date,
          receivedDate: input.date,
          status: "RECEBIDO",
          accountId: input.accountId,
          costCenterId: centerId,
          vehicleId: input.vehicleId || null,
          customerId: input.customerId || null,
          notes: input.notes || null,
        },
      });
      // Aporte de capital: registra a movimentação do beneficiário.
      if (input.capitalBeneficiaryId) {
        await tx.capitalTransaction.create({
          data: {
            beneficiaryId: input.capitalBeneficiaryId,
            kind: "APORTE",
            amount: input.amount,
            date: input.date,
            description: input.description,
            receivableId: receivable.id,
          },
        });
      }
      return receivable;
    });
  }

  return createExpensePayable({
    description: input.description,
    category: input.category || "OUTROS",
    categoryLabel: input.categoryLabel || null,
    amount: input.amount,
    dueDate: input.date,
    paid: true,
    paymentDate: input.date,
    accountId: input.accountId,
    supplierId: input.supplierId || null,
    vehicleId: input.vehicleId || null,
    capitalBeneficiaryId: input.capitalBeneficiaryId || null,
    structuralKey: input.structuralKey,
    notes: input.notes || null,
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
