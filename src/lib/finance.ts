import { prisma } from "@/lib/prisma";
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
}) {
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
        entryDate: input.entryDate,
        notes: input.notes || null,
        supplierId: input.supplierId || null,
      },
    });

    if (input.purchasePrice > 0) {
      await tx.payable.create({
        data: {
          description: `Compra do veículo ${input.brand} ${input.model} - placa ${input.plate}`,
          category: "COMPRA_VEICULO" as CategoriaPagar,
          amount: input.purchasePrice,
          dueDate: input.alreadyPaid
            ? input.entryDate
            : input.dueDate || input.entryDate,
          paymentDate: input.alreadyPaid ? input.entryDate : null,
          status: input.alreadyPaid ? "PAGO" : "PENDENTE",
          supplierId: input.supplierId || null,
          vehicleId: vehicle.id,
        },
      });
    }

    return vehicle;
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
}) {
  return prisma.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: input.vehicleId },
    });

    const payable = await tx.payable.create({
      data: {
        description: `${input.description} - ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
        category: "DESPESA_OPERACIONAL",
        amount: input.amount,
        dueDate: input.alreadyPaid ? input.date : input.dueDate || input.date,
        paymentDate: input.alreadyPaid ? input.date : null,
        status: input.alreadyPaid ? "PAGO" : "PENDENTE",
        supplierId: input.supplierId || null,
        vehicleId: vehicle.id,
        notes: input.notes || null,
      },
    });

    return tx.vehicleCost.create({
      data: {
        vehicleId: vehicle.id,
        description: input.description,
        category: input.category,
        amount: input.amount,
        date: input.date,
        notes: input.notes || null,
        payableId: payable.id,
      },
    });
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
}) {
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
      },
    });

    await tx.vehicle.update({
      where: { id: input.vehicleId },
      data: { status: "VENDIDO" },
    });

    const receivablesData: Prisma.ReceivableCreateManyInput[] = [];
    const baseDescription = `Venda do veículo ${vehicle.brand} ${vehicle.model} - placa ${vehicle.plate}`;

    if (input.paymentMethod === "PARCELADO") {
      if (input.downPayment > 0) {
        receivablesData.push({
          description: `${baseDescription} - Entrada`,
          category: "VENDA_VEICULO",
          amount: input.downPayment,
          dueDate: input.saleDate,
          receivedDate: input.saleDate,
          status: "RECEBIDO",
          customerId: input.customerId,
          saleId: sale.id,
          installmentNumber: 0,
          totalInstallments: input.installmentsCount,
        });
      }

      const remaining = Math.max(
        0,
        Math.round((input.totalAmount - input.downPayment) * 100) / 100,
      );
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
      receivablesData.push({
        description: `${baseDescription} - Repasse financiamento`,
        category: "VENDA_VEICULO",
        amount: input.totalAmount,
        dueDate: addDays(input.saleDate, 5),
        status: "PENDENTE",
        customerId: input.customerId,
        saleId: sale.id,
      });
    } else {
      receivablesData.push({
        description: `${baseDescription} - À vista`,
        category: "VENDA_VEICULO",
        amount: input.totalAmount,
        dueDate: input.saleDate,
        receivedDate: input.saleDate,
        status: "RECEBIDO",
        customerId: input.customerId,
        saleId: sale.id,
      });
    }

    await tx.receivable.createMany({ data: receivablesData });

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

    await tx.receivable.createMany({ data: receivablesData });

    return partSale;
  });
}

// ---------------------------------------------------------------------------
// Baixas manuais
// ---------------------------------------------------------------------------

export async function markPayablePaid(id: string, paymentDate: Date) {
  return prisma.payable.update({
    where: { id },
    data: { status: "PAGO", paymentDate },
  });
}

export async function markPayablePending(id: string) {
  return prisma.payable.update({
    where: { id },
    data: { status: "PENDENTE", paymentDate: null },
  });
}

export async function markReceivableReceived(id: string, receivedDate: Date) {
  return prisma.receivable.update({
    where: { id },
    data: { status: "RECEBIDO", receivedDate },
  });
}

export async function markReceivablePending(id: string) {
  return prisma.receivable.update({
    where: { id },
    data: { status: "PENDENTE", receivedDate: null },
  });
}

export async function createManualPayable(input: {
  description: string;
  category: CategoriaPagar;
  amount: number;
  dueDate: Date;
  supplierId?: string | null;
  notes?: string | null;
  alreadyPaid: boolean;
}) {
  return prisma.payable.create({
    data: {
      description: input.description,
      category: input.category,
      amount: input.amount,
      dueDate: input.dueDate,
      paymentDate: input.alreadyPaid ? input.dueDate : null,
      status: input.alreadyPaid ? "PAGO" : "PENDENTE",
      supplierId: input.supplierId || null,
      notes: input.notes || null,
    },
  });
}

export async function createManualReceivable(input: {
  description: string;
  amount: number;
  dueDate: Date;
  customerId?: string | null;
  notes?: string | null;
  alreadyReceived: boolean;
}) {
  return prisma.receivable.create({
    data: {
      description: input.description,
      category: "OUTROS",
      amount: input.amount,
      dueDate: input.dueDate,
      receivedDate: input.alreadyReceived ? input.dueDate : null,
      status: input.alreadyReceived ? "RECEBIDO" : "PENDENTE",
      customerId: input.customerId || null,
      notes: input.notes || null,
    },
  });
}
