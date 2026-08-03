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

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Divide um valor em N parcelas, ajustando a última para não perder centavos. */
export function splitInstallments(total: number, count: number): number[] {
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
  renavam?: string | null;
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
  // Consignado: o veículo é de um terceiro (o consignante = supplier). Fica no
  // estoque/vitrine como um carro normal, mas com purchasePrice 0 (não é
  // patrimônio comprado). `ownerRefundAmount` é o valor a devolver ao dono,
  // apurado só no fechamento da venda (não gera conta a pagar na entrada).
  consigned?: boolean;
  ownerRefundAmount?: number;
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
        renavam: input.renavam || null,
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
        consigned: Boolean(input.consigned),
        ownerRefundAmount: Math.max(0, Math.round((input.ownerRefundAmount ?? 0) * 100) / 100),
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
    // Consignado: não tem contas de compra de entrada (purchasePrice 0). A
    // quitação/débitos do consignado são criadas no FECHAMENTO da venda (repasse)
    // — não devem ser recriadas/apagadas ao editar o veículo.
    if (vehicle.consigned) return;
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

/**
 * Cadastra o veículo de TERCEIRO de uma operação de financiamento de terceiros.
 * Não é patrimônio da loja: entra com custo 0 e SEM conta a pagar de compra, e
 * marcado como `intermediation` para ficar fora do estoque, da vitrine e dos
 * relatórios. O motor de venda calcula o lucro da intermediação com custo 0.
 */
export async function createIntermediationVehicle(input: {
  brand: string;
  model: string;
  version?: string | null;
  manufactureYear: number;
  modelYear: number;
  plate: string;
  chassi?: string | null;
  renavam?: string | null;
  color?: string | null;
  km?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  salePrice?: number | null;
  entryDate: Date;
  notes?: string | null;
}) {
  return prisma.vehicle.create({
    data: {
      brand: input.brand,
      model: input.model,
      version: input.version || null,
      manufactureYear: input.manufactureYear,
      modelYear: input.modelYear,
      plate: input.plate.toUpperCase(),
      chassi: input.chassi || null,
      renavam: input.renavam || null,
      color: input.color || null,
      km: input.km ?? 0,
      fuel: input.fuel || null,
      transmission: input.transmission || null,
      purchasePrice: 0,
      salePrice: Math.max(0, input.salePrice ?? 0),
      entryDate: input.entryDate,
      status: "ESTOQUE",
      intermediation: true,
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
  // Financiamento de terceiros (intermediação): quando informado, grava o tipo
  // de operação, o valor do financiamento (F) e o devolvido (D) e os dados do
  // proprietário do documento. O motor de venda já trata o resto (o excedente
  // do financiamento sobre o "billable" vira a devolução ao cliente).
  saleType?: "VENDA" | "FINANCIAMENTO_TERCEIROS" | null;
  // Refinanciamento (financiamento de terceiros): a financeira paga F direto ao
  // financiado; a loja recebe só o retorno (sem repasse nem devolução).
  refinancing?: boolean | null;
  financingAmount?: number | null;
  refundAmount?: number | null;
  ownerName?: string | null;
  ownerDocument?: string | null;
  ownerPhone?: string | null;
  ownerAddress?: string | null;
  // Dados bancários do comprador (financiamento de terceiros): para o contrato.
  buyerBankName?: string | null;
  buyerBankAgency?: string | null;
  buyerBankAccount?: string | null;
  buyerBankAccountType?: string | null;
  buyerPixKey?: string | null;
  // Parcelamento informado ao comprador (só informativo, consta no contrato).
  installmentsInfoCount?: number | null;
  installmentsInfoAmount?: number | null;
  sellerName?: string | null;
  // Vendedor = usuário (beneficiário da comissão, com dados bancários).
  sellerId?: string | null;
  // Comissão do vendedor (R$): vira conta a pagar (Comissão, Administrativo).
  commissionAmount?: number | null;
  // Indicações de venda ({ name, amount }): cada uma com valor > 0 também vira
  // conta a pagar (Comissão, Administrativo), como a comissão do vendedor.
  referrals?: { name: string; amount: number }[] | null;
  // Transferência (DETRAN) cobrada na venda: quando cobrada, vira conta a pagar
  // (custo, igual à comissão) e reduz o resultado daquela venda.
  transferCharged?: boolean | null;
  transferAmount?: number | null;
  // Facultativo: pagar ao vendedor a comissão sobre o retorno da financeira
  // (percentual do líquido, configurado na conta da financeira).
  takeReturnCommission?: boolean | null;
  // Informativo: venda originada de anúncio de tráfego pago (card do dashboard).
  viaPaidTraffic?: boolean | null;
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
  // Consignado: o veículo era de um terceiro (o consignante = supplier do
  // veículo). No fechamento a loja deve `ownerRefundAmount` ao dono. Se
  // `ownerRefundToCapital`, esse valor vira aporte no capital do beneficiário
  // (sem sair do caixa — o dinheiro da venda fica na empresa como capital);
  // senão vira conta a pagar (DEVOLUCAO_PROPRIETARIO) ao proprietário.
  consigned?: boolean;
  ownerRefundAmount?: number;
  ownerRefundToCapital?: boolean;
  ownerRefundBeneficiaryId?: string | null;
}) {
  const defaultAccountId = await getDefaultAccountId();
  // A entrada em troca é compensada pelo Banco Neutro (fica sempre em zero),
  // casando com a "Compra do veículo (líquido quitado pela troca)".
  const neutralAccountId =
    (input.tradeInAmount ?? 0) > 0 ? await getNeutralAccountId() : null;
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  const commission = Math.max(0, Math.round((input.commissionAmount ?? 0) * 100) / 100);
  const referrals = (input.referrals ?? [])
    .map((r) => ({ name: (r.name || "").trim(), amount: Math.max(0, Math.round((r.amount || 0) * 100) / 100) }))
    .filter((r) => r.name || r.amount > 0);
  const transferCharged = Boolean(input.transferCharged);
  const transferAmount = transferCharged
    ? Math.max(0, Math.round((input.transferAmount ?? 0) * 100) / 100)
    : 0;
  // Consignado: valor a devolver ao proprietário, normalizado.
  const ownerRefund = input.consigned
    ? Math.max(0, Math.round((input.ownerRefundAmount ?? 0) * 100) / 100)
    : 0;
  const adminCenterId =
    commission > 0 || referrals.some((r) => r.amount > 0) || transferAmount > 0 || input.takeReturnCommission
      ? await structuralCenterId("ADMINISTRATIVO")
      : null;
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
      // Aporte de consignado gerado por uma venda cancelada deste veículo: remove
      // o resíduo antes de recriar a venda (senão ficaria um aporte órfão).
      await tx.capitalTransaction.deleteMany({ where: { saleId: { in: ids } } });
      // Consignado: quitação/débitos (repasse) da venda cancelada só existem por
      // causa dela — remove antes de recriar para não duplicar no revender.
      if (vehicle.consigned) {
        await tx.payable.deleteMany({
          where: { vehicleId: input.vehicleId, category: "COMPRA_VEICULO" },
        });
      }
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
        sellerId: input.sellerId || null,
        financerName: input.paymentMethod === "FINANCIADO" ? input.financerName || null : null,
        // Refinanciamento: a loja não recebe repasse (F vai direto ao financiado),
        // então guarda financedAmount 0 (nada a liquidar em "Receber financiamento").
        financedAmount:
          input.paymentMethod === "FINANCIADO" ? (input.refinancing ? 0 : input.financedAmount ?? null) : null,
        financerAccountId: input.paymentMethod === "FINANCIADO" ? input.financerAccountId || null : null,
        returnLevel: input.paymentMethod === "FINANCIADO" ? Math.max(0, input.returnLevel ?? 0) : 0,
        commissionAmount: commission,
        referrals,
        transferCharged,
        transferAmount,
        viaPaidTraffic: Boolean(input.viaPaidTraffic),
        saleType: input.saleType === "FINANCIAMENTO_TERCEIROS" ? "FINANCIAMENTO_TERCEIROS" : "VENDA",
        refinancing: Boolean(input.refinancing),
        financingAmount: Math.max(0, input.financingAmount ?? 0),
        refundAmount: Math.max(0, input.refundAmount ?? 0),
        ownerName: input.ownerName || null,
        ownerDocument: input.ownerDocument || null,
        ownerPhone: input.ownerPhone || null,
        ownerAddress: input.ownerAddress || null,
        buyerBankName: input.buyerBankName || null,
        buyerBankAgency: input.buyerBankAgency || null,
        buyerBankAccount: input.buyerBankAccount || null,
        buyerBankAccountType: input.buyerBankAccountType || null,
        buyerPixKey: input.buyerPixKey || null,
        installmentsInfoCount: input.installmentsInfoCount ?? null,
        installmentsInfoAmount: input.installmentsInfoAmount ?? null,
        notes: input.notes || null,
        tradeInVehicleId: input.tradeInVehicleId || null,
        consigned: Boolean(input.consigned),
        ownerRefundAmount: input.consigned ? ownerRefund : 0,
        ownerRefundToCapital: Boolean(input.consigned && input.ownerRefundToCapital),
        ownerRefundBeneficiaryId:
          input.consigned && input.ownerRefundToCapital ? input.ownerRefundBeneficiaryId || null : null,
      },
    });

    await tx.vehicle.update({
      where: { id: input.vehicleId },
      data: { status: "VENDIDO" },
    });

    // Comissão do vendedor: conta a pagar avulsa (categoria Comissão, centro
    // Administrativo), vinculada à venda. NÃO é custo do veículo (vehicleId
    // nulo) — é despesa de venda, entra no resultado quando for paga.
    if (commission > 0 && adminCenterId) {
      await tx.payable.create({
        data: {
          description: `Comissão de venda${input.sellerName ? ` — ${input.sellerName}` : ""} — ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
          category: "COMISSAO",
          amount: commission,
          dueDate: input.saleDate,
          status: "PENDENTE",
          costCenterId: adminCenterId,
          saleId: sale.id,
          beneficiaryUserId: input.sellerId || null,
        },
      });
    }

    // Indicações de venda: mesma mecânica da comissão do vendedor (Comissão,
    // Administrativo, vencendo na data da venda). O indicador não é usuário do
    // sistema — fica identificado só na descrição (beneficiário nulo).
    for (const ref of referrals) {
      if (ref.amount <= 0 || !adminCenterId) continue;
      await tx.payable.create({
        data: {
          description: `Comissão de indicação${ref.name ? ` — ${ref.name}` : ""} — ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
          category: "COMISSAO",
          amount: ref.amount,
          dueDate: input.saleDate,
          status: "PENDENTE",
          costCenterId: adminCenterId,
          saleId: sale.id,
        },
      });
    }

    // Transferência (DETRAN) cobrada: custo da venda, mesma mecânica da comissão
    // (Comissão, Administrativo, vencendo na data da venda). NÃO é custo do
    // veículo (vehicleId nulo) — não mexe na margem do carro.
    if (transferAmount > 0 && adminCenterId) {
      await tx.payable.create({
        data: {
          description: `Transferência DETRAN — ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
          category: "COMISSAO",
          amount: transferAmount,
          dueDate: input.saleDate,
          status: "PENDENTE",
          costCenterId: adminCenterId,
          saleId: sale.id,
        },
      });
    }

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
      // pode conter o excedente da troca + sinal). No refinanciamento a loja não
      // devolve nada (a financeira paga F direto ao financiado).
      if (!input.refinancing) {
        devolucaoCliente = Math.round((devolucaoCliente + Math.max(0, financed - billable)) * 100) / 100;
      } else {
        devolucaoCliente = 0;
      }

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
        // Refinanciamento: a financeira paga F direto ao financiado — a loja NÃO
        // recebe o repasse. Só o retorno (abaixo) entra na loja.
        if (!input.refinancing) {
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
        }

        // Retorno da financeira: comissão sobre o valor financiado. Só quando há
        // financeira cadastrada (é ela quem paga) e nível > 0. Espelha o repasse:
        // entra RECEBIDO na conta da financeira (que passa a dever o líquido) e
        // é liquidado separado do financiamento. O imposto é retido pela
        // financeira — a loja recebe só o líquido.
        const level = Math.max(0, Math.floor(input.returnLevel ?? 0));
        if (naFinanceira && level > 0) {
          const financerAcc = await tx.financialAccount.findUnique({
            where: { id: input.financerAccountId! },
            select: { returnTaxPercent: true, sellerReturnPercent: true },
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

            // Comissão do vendedor sobre o retorno (facultativa): % do LÍQUIDO,
            // configurado na conta da financeira. Vira conta a pagar (Comissão,
            // beneficiário = vendedor) — custo por competência, igual à comissão.
            const sellerPct = Math.max(0, Math.min(100, financerAcc?.sellerReturnPercent ?? 0));
            if (input.takeReturnCommission && sellerPct > 0 && adminCenterId) {
              const returnCommission = Math.round(net * (sellerPct / 100) * 100) / 100;
              if (returnCommission > 0) {
                await tx.payable.create({
                  data: {
                    description: `Comissão do retorno${input.sellerName ? ` — ${input.sellerName}` : ""} — ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
                    category: "COMISSAO",
                    amount: returnCommission,
                    dueDate: input.saleDate,
                    status: "PENDENTE",
                    costCenterId: adminCenterId,
                    saleId: sale.id,
                    beneficiaryUserId: input.sellerId || null,
                  },
                });
                await tx.sale.update({
                  where: { id: sale.id },
                  data: { returnCommissionAmount: returnCommission },
                });
              }
            }
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

    // Consignado: o valor ACERTADO com o proprietário (bruto) é o custo do
    // negócio, reconhecido por inteiro no fechamento da venda. Ele se divide em:
    // - Quitação do financiamento e débitos do veículo (repasse): a loja paga
    //   direto ao banco/órgãos — contas a pagar COMPRA_VEICULO, iguais às da
    //   compra de estoque (entram no passivo pós-venda da equação patrimonial).
    // - Líquido ao proprietário = acertado − quitação − débitos. Dois destinos:
    //   * Aporte no capital do beneficiário (aporte PURO, sem recebível — o caixa
    //     já entrou pela venda); ou
    //   * Pagar ao dono → conta a pagar (DEVOLUCAO_PROPRIETARIO).
    if (input.consigned && ownerRefund > 0) {
      const payoff = Math.max(0, Math.round((vehicle.payoffAmount ?? 0) * 100) / 100);
      const debts = Math.max(0, Math.round((vehicle.debtsAmount ?? 0) * 100) / 100);
      const repasseLabel = `${vehicle.brand} ${vehicle.model} - placa ${vehicle.plate}`;
      if (payoff > 0) {
        await tx.payable.create({
          data: {
            description: `Quitação do financiamento ${repasseLabel}${vehicle.payoffTo ? ` (${vehicle.payoffTo})` : ""}`,
            category: "COMPRA_VEICULO",
            amount: payoff,
            dueDate: input.saleDate,
            status: "PENDENTE",
            vehicleId: input.vehicleId,
            costCenterId: veiculosCenterId,
          },
        });
      }
      if (debts > 0) {
        await tx.payable.create({
          data: {
            description: `Débitos do veículo (repasse) ${repasseLabel}`,
            category: "COMPRA_VEICULO",
            amount: debts,
            dueDate: input.saleDate,
            status: "PENDENTE",
            vehicleId: input.vehicleId,
            costCenterId: veiculosCenterId,
          },
        });
      }
      // Líquido ao proprietário = valor acertado − quitação − débitos.
      const liquido = Math.max(0, Math.round((ownerRefund - payoff - debts) * 100) / 100);
      if (liquido > 0) {
        // Nome do proprietário (consignante) para constar nos documentos.
        const owner = vehicle.supplierId
          ? await tx.supplier.findUnique({ where: { id: vehicle.supplierId }, select: { name: true } })
          : null;
        if (input.ownerRefundToCapital && input.ownerRefundBeneficiaryId) {
          await tx.capitalTransaction.create({
            data: {
              beneficiaryId: input.ownerRefundBeneficiaryId,
              kind: "APORTE",
              amount: liquido,
              date: input.saleDate,
              saleId: sale.id,
              description: `Aporte — devolução do consignado ${vehicle.brand} ${vehicle.model} (${vehicle.plate})${owner?.name ? ` — proprietário ${owner.name}` : ""}`,
            },
          });
        } else {
          await tx.payable.create({
            data: {
              description: `Devolução ao proprietário${owner?.name ? ` ${owner.name}` : ""} - ${baseDescription}`,
              category: "DEVOLUCAO_PROPRIETARIO",
              amount: liquido,
              dueDate: input.saleDate,
              status: "PENDENTE",
              vehicleId: input.vehicleId,
              supplierId: vehicle.supplierId || null,
              costCenterId: veiculosCenterId,
              notes: "Valor líquido devido ao consignante pela venda do veículo consignado.",
            },
          });
        }
      }
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

    // 2c) Comissão do vendedor gerada por esta venda: apagar o título (se já foi
    //     pago, o dinheiro volta ao caixa).
    await tx.payable.deleteMany({ where: { saleId, category: "COMISSAO" } });

    // 2d) Consignado: reverte a devolução ao proprietário. Se foi paga ao dono,
    //     apaga a conta a pagar (se já quitada, o dinheiro volta ao caixa). Se
    //     foi aplicada no capital, apaga o aporte (baixa o saldo de capital).
    //     A quitação/débitos (repasse COMPRA_VEICULO) do consignado também são
    //     criadas no fechamento — só existem por causa da venda, então são
    //     revertidas junto (num veículo de estoque a compra é da entrada e NÃO
    //     se apaga aqui; por isso a limpeza é condicionada ao consignado).
    await tx.payable.deleteMany({
      where: { vehicleId: sale.vehicleId, category: "DEVOLUCAO_PROPRIETARIO" },
    });
    await tx.capitalTransaction.deleteMany({ where: { saleId } });
    if (sale.consigned) {
      await tx.payable.deleteMany({
        where: { vehicleId: sale.vehicleId, category: "COMPRA_VEICULO" },
      });
    }

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

    // 3b) Se o retorno já foi recebido, estorna as transferências (para o banco e
    //     para o Banco Neutro) e os ajustes administrativos de diferença.
    if (sale.returnSettledAt && sale.financerAccountId && sale.returnNet > 0) {
      await tx.accountTransfer.deleteMany({
        where: {
          fromId: sale.financerAccountId,
          description: { contains: sale.vehicle.plate },
          OR: [
            { description: { contains: "Retorno financiamento" } },
            { description: { contains: "Diferença de retorno" } },
          ],
        },
      });
      // Crédito/débito administrativo de "diferença de retorno" deste veículo.
      const diffFilter = {
        AND: [
          { description: { contains: "Diferença de retorno" } },
          { description: { contains: sale.vehicle.plate } },
        ],
      };
      await tx.receivable.deleteMany({ where: diffFilter });
      await tx.payable.deleteMany({ where: diffFilter });
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
    //    (evita "roubar" um veículo revendido ao reverter uma venda antiga) ou
    //    outra ficha ATIVA da mesma placa (recompra já cadastrada: não pode
    //    haver duas fichas ativas com a mesma placa).
    const outraVendaAtiva = await tx.sale.findFirst({
      where: { vehicleId: sale.vehicleId, id: { not: saleId }, status: "CONCLUIDA" },
      select: { id: true },
    });
    const recompraAtiva = await tx.vehicle.findFirst({
      where: {
        plate: sale.vehicle.plate,
        id: { not: sale.vehicleId },
        status: { not: "VENDIDO" },
      },
      select: { id: true },
    });
    if (!outraVendaAtiva && !recompraAtiva) {
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

/**
 * Junta a descrição e as observações num texto só (a tabela do Capital mostra
 * apenas a descrição, então as observações do lançamento entram aqui para não
 * se perderem). Ex.: "teste mt — teste de estorno".
 */
function withNotes(description: string, notes?: string | null): string {
  const n = (notes || "").trim();
  if (!n) return description;
  return description ? `${description} — ${n}` : n;
}

/**
 * Sincroniza o lançamento de capital (RETIRADA) de um título A PAGAR do fluxo
 * Capital com o status dele: cria a retirada quando PAGO (dinheiro saiu), remove
 * quando volta a PENDENTE. Idempotente — o capital só se move junto do dinheiro,
 * mantendo o farol consistente. No-op para títulos sem beneficiário de capital.
 */
export async function syncPayableCapital(payableId: string) {
  const p = await prisma.payable.findUnique({
    where: { id: payableId },
    select: {
      id: true,
      capitalBeneficiaryId: true,
      status: true,
      amount: true,
      paymentDate: true,
      dueDate: true,
      description: true,
      notes: true,
    },
  });
  if (!p || !p.capitalBeneficiaryId) return;
  const existing = await prisma.capitalTransaction.findFirst({ where: { payableId: p.id } });
  if (p.status === "PAGO") {
    if (!existing) {
      await prisma.capitalTransaction.create({
        data: {
          beneficiaryId: p.capitalBeneficiaryId,
          kind: "RETIRADA",
          amount: p.amount,
          date: p.paymentDate ?? p.dueDate,
          description: withNotes(p.description, p.notes),
          payableId: p.id,
        },
      });
    }
  } else if (existing) {
    await prisma.capitalTransaction.delete({ where: { id: existing.id } });
  }
}

/** Igual ao anterior, para títulos A RECEBER do fluxo Capital (APORTE ao receber). */
export async function syncReceivableCapital(receivableId: string) {
  const r = await prisma.receivable.findUnique({
    where: { id: receivableId },
    select: {
      id: true,
      capitalBeneficiaryId: true,
      status: true,
      amount: true,
      receivedDate: true,
      dueDate: true,
      description: true,
      notes: true,
    },
  });
  if (!r || !r.capitalBeneficiaryId) return;
  const existing = await prisma.capitalTransaction.findFirst({ where: { receivableId: r.id } });
  if (r.status === "RECEBIDO") {
    if (!existing) {
      await prisma.capitalTransaction.create({
        data: {
          beneficiaryId: r.capitalBeneficiaryId,
          kind: "APORTE",
          amount: r.amount,
          date: r.receivedDate ?? r.dueDate,
          description: withNotes(r.description, r.notes),
          receivableId: r.id,
        },
      });
    }
  } else if (existing) {
    await prisma.capitalTransaction.delete({ where: { id: existing.id } });
  }
}

/**
 * Sincroniza o status da solicitação de compra conforme os títulos do espelho:
 * todos PAGO → CONCLUIDA; se ainda houver pendente e estava CONCLUIDA → volta
 * para APROVADA. Chamada ao pagar/estornar um título vinculado.
 */
export async function syncPurchaseRequestStatus(purchaseRequestId: string) {
  const req = await prisma.purchaseRequest.findUnique({
    where: { id: purchaseRequestId },
    select: { status: true, payables: { select: { status: true } } },
  });
  if (!req || req.payables.length === 0) return;
  const allPaid = req.payables.every((p) => p.status === "PAGO");
  if (allPaid && req.status !== "CONCLUIDA") {
    await prisma.purchaseRequest.update({ where: { id: purchaseRequestId }, data: { status: "CONCLUIDA" } });
  } else if (!allPaid && req.status === "CONCLUIDA") {
    await prisma.purchaseRequest.update({ where: { id: purchaseRequestId }, data: { status: "APROVADA" } });
  }
}

export async function markPayablePaid(id: string, paymentDate: Date, accountId?: string | null) {
  const account = accountId ?? (await getDefaultAccountId());
  const updated = await prisma.payable.update({
    where: { id },
    data: { status: "PAGO", paymentDate, accountId: account },
  });
  await syncPayableCapital(id);
  if (updated.purchaseRequestId) await syncPurchaseRequestStatus(updated.purchaseRequestId);
  return updated;
}

export async function markPayablePending(id: string) {
  const updated = await prisma.payable.update({
    where: { id },
    data: { status: "PENDENTE", paymentDate: null, accountId: null },
  });
  await syncPayableCapital(id);
  if (updated.purchaseRequestId) await syncPurchaseRequestStatus(updated.purchaseRequestId);
  return updated;
}

export async function markReceivableReceived(id: string, receivedDate: Date, accountId?: string | null) {
  const account = accountId ?? (await getDefaultAccountId());
  const updated = await prisma.receivable.update({
    where: { id },
    data: { status: "RECEBIDO", receivedDate, accountId: account },
  });
  await syncReceivableCapital(id);
  return updated;
}

export async function markReceivablePending(id: string) {
  const updated = await prisma.receivable.update({
    where: { id },
    data: { status: "PENDENTE", receivedDate: null, accountId: null },
  });
  await syncReceivableCapital(id);
  return updated;
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
    const updated = await prisma.receivable.update({
      where: { id },
      data: { status: "RECEBIDO", receivedDate, accountId: account },
    });
    await syncReceivableCapital(id);
    return updated;
  }

  // Parcial: cria a parcela recebida e reduz o pendente do original. A parcela
  // recebida carrega o beneficiário do capital (gera o APORTE só da parte paga);
  // o pendente restante continua sem lançamento de capital.
  const partial = await prisma.$transaction(async (tx) => {
    const created = await tx.receivable.create({
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
        capitalBeneficiaryId: r.capitalBeneficiaryId,
        accountId: account,
      },
    });
    const orig = await tx.receivable.update({
      where: { id },
      data: { amount: Math.round((r.amount - pay) * 100) / 100 },
    });
    return { createdId: created.id, orig };
  });
  await syncReceivableCapital(partial.createdId);
  return partial.orig;
}

export async function createManualPayable(input: {
  description: string;
  category: CategoriaPagar;
  categoryLabel?: string | null;
  documentNumber?: string | null;
  amount: number;
  dueDate: Date;
  supplierId?: string | null;
  costCenterId?: string | null;
  structuralKey?: StructuralKey;
  vehicleId?: string | null;
  capitalBeneficiaryId?: string | null;
  notes?: string | null;
  alreadyPaid: boolean;
  purchaseRequestId?: string | null;
}) {
  return createExpensePayable({
    description: input.description,
    category: input.category,
    categoryLabel: input.categoryLabel || null,
    documentNumber: input.documentNumber || null,
    amount: input.amount,
    dueDate: input.dueDate,
    paid: input.alreadyPaid,
    supplierId: input.supplierId || null,
    vehicleId: input.vehicleId || null,
    capitalBeneficiaryId: input.capitalBeneficiaryId || null,
    costCenterId: input.costCenterId || null,
    structuralKey: input.structuralKey,
    notes: input.notes || null,
    purchaseRequestId: input.purchaseRequestId || null,
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

  // Conciliações antigas davam baixa reescrevendo a CONTA do recebível do
  // repasse (financeira → empresa), sem criar a transferência nem marcar a
  // venda como recebida. Nesse estado herdado, criar a transferência de novo
  // contaria o dinheiro em dobro. Reparo: devolve o recebível para a conta da
  // financeira e transfere para a conta onde a conciliação creditou o valor —
  // o efeito líquido nos saldos é zero e o estado final fica idêntico ao da
  // baixa normal (inclusive para o estorno).
  const repasse = await prisma.receivable.findFirst({
    where: { saleId, category: "VENDA_VEICULO", description: { contains: "Repasse financiamento" } },
    select: { id: true, accountId: true },
  });
  const reconAccountId =
    repasse?.accountId && repasse.accountId !== sale.financerAccountId ? repasse.accountId : null;

  return prisma.$transaction(async (tx) => {
    if (reconAccountId) {
      await tx.receivable.update({
        where: { id: repasse!.id },
        data: { accountId: sale.financerAccountId },
      });
    }
    await tx.accountTransfer.create({
      data: {
        fromId: sale.financerAccountId!,
        toId: reconAccountId ?? accountId,
        amount: sale.financedAmount!,
        date,
        description: `Repasse financiamento — ${sale.customer.name} · ${sale.vehicle.brand} ${sale.vehicle.model} (${sale.vehicle.plate})`,
      },
    });
    return tx.sale.update({ where: { id: saleId }, data: { financerSettledAt: date } });
  });
}

/**
 * Recebe o RETORNO da financeira. A conta da financeira SEMPRE zera (sai o valor
 * programado). O banco da empresa recebe o valor REAL pago (`actualAmount`). A
 * diferença vira ajuste administrativo:
 *  - pagou igual: só a transferência financeira → banco;
 *  - pagou a mais: transfere o programado e credita a diferença como RECEITA
 *    administrativa no banco (o banco recebe o total real);
 *  - pagou a menos: transfere o real para o banco e a diferença para o Banco
 *    Neutro (zera a financeira); depois um DÉBITO administrativo pago a partir do
 *    Banco Neutro zera o neutro e vira despesa "diferença de retorno".
 * Liquidado SEPARADO do repasse do financiamento.
 */
export async function settleReturn(
  saleId: string,
  accountId: string,
  actualAmount: number,
  date: Date,
) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { customer: { select: { name: true } }, vehicle: { select: { brand: true, model: true, plate: true } } },
  });
  if (!sale.financerAccountId) throw new Error("Esta venda não tem financeira cadastrada.");
  if (!sale.returnNet || sale.returnNet <= 0) throw new Error("Sem retorno a receber nesta venda.");
  if (sale.returnSettledAt) throw new Error("O retorno desta venda já foi recebido.");
  if (sale.financerAccountId === accountId) throw new Error("Escolha uma conta da empresa (diferente da financeira).");

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const programmed = round2(sale.returnNet);
  const actual = round2(actualAmount);
  if (!Number.isFinite(actual) || actual < 0) throw new Error("Informe um valor recebido válido.");
  const diff = round2(actual - programmed);

  const label = `${retornoLabel(sale.returnLevel)} — ${sale.customer.name} · ${sale.vehicle.brand} ${sale.vehicle.model} (${sale.vehicle.plate})`;

  // Mesmo reparo do repasse: conciliações antigas moviam o recebível do retorno
  // para a conta da empresa sem transferência nem returnSettledAt. Nesse estado,
  // devolve o recebível à financeira e transfere o programado para a conta onde
  // a conciliação creditou (o banco pagou exatamente o valor casado no extrato).
  const retornoRec = await prisma.receivable.findFirst({
    where: { saleId, category: "RETORNO_FINANCEIRA" },
    select: { id: true, accountId: true },
  });
  const reconAccountId =
    retornoRec?.accountId && retornoRec.accountId !== sale.financerAccountId ? retornoRec.accountId : null;
  if (reconAccountId) {
    return prisma.$transaction(async (tx) => {
      await tx.receivable.update({
        where: { id: retornoRec!.id },
        data: { accountId: sale.financerAccountId },
      });
      await tx.accountTransfer.create({
        data: { fromId: sale.financerAccountId!, toId: reconAccountId, amount: programmed, date, description: `Retorno financiamento ${label}` },
      });
      return tx.sale.update({
        where: { id: saleId },
        data: { returnSettledAt: date, returnPaidAmount: programmed },
      });
    });
  }

  const adminCenterId = await structuralCenterId("ADMINISTRATIVO");
  const neutralAccountId = diff < 0 ? await getNeutralAccountId() : null;

  return prisma.$transaction(async (tx) => {
    if (diff === 0) {
      await tx.accountTransfer.create({
        data: { fromId: sale.financerAccountId!, toId: accountId, amount: programmed, date, description: `Retorno financiamento ${label}` },
      });
    } else if (diff > 0) {
      // Pagou a mais: financeira zera (programado) e a diferença é receita
      // administrativa creditada no banco → o banco recebe o total real.
      await tx.accountTransfer.create({
        data: { fromId: sale.financerAccountId!, toId: accountId, amount: programmed, date, description: `Retorno financiamento ${label}` },
      });
      await tx.receivable.create({
        data: {
          description: `Diferença de retorno (crédito) ${label}`,
          category: "OUTROS",
          amount: diff,
          dueDate: date,
          receivedDate: date,
          status: "RECEBIDO",
          accountId,
          costCenterId: adminCenterId,
          notes: "Financeira pagou a mais que o retorno programado.",
        },
      });
    } else {
      // Pagou a menos: real para o banco, a falta para o Banco Neutro (zera a
      // financeira) e um débito administrativo pago do neutro (zera o neutro).
      const falta = round2(programmed - actual);
      if (actual > 0) {
        await tx.accountTransfer.create({
          data: { fromId: sale.financerAccountId!, toId: accountId, amount: actual, date, description: `Retorno financiamento ${label}` },
        });
      }
      await tx.accountTransfer.create({
        data: { fromId: sale.financerAccountId!, toId: neutralAccountId!, amount: falta, date, description: `Diferença de retorno ${label}` },
      });
      await tx.payable.create({
        data: {
          description: `Diferença de retorno (débito) ${label}`,
          category: "OUTROS",
          amount: falta,
          dueDate: date,
          paymentDate: date,
          status: "PAGO",
          accountId: neutralAccountId,
          costCenterId: adminCenterId,
          notes: "Financeira pagou a menos que o retorno programado.",
        },
      });
    }
    return tx.sale.update({ where: { id: saleId }, data: { returnSettledAt: date, returnPaidAmount: actual } });
  });
}

/**
 * Estorna a baixa do FINANCIAMENTO: apaga a transferência da financeira para a
 * empresa (o valor financiado volta a ficar na conta da financeira) e marca a
 * venda como não recebida — como se a baixa nunca tivesse acontecido. É uma
 * ação de correção; não passa pelas travas de caixa fechado.
 */
export async function reverseFinancing(saleId: string) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { vehicle: { select: { plate: true } } },
  });
  if (!sale.financerSettledAt) throw new Error("Este financiamento ainda não foi recebido.");
  if (!sale.financerAccountId || !sale.financedAmount) {
    throw new Error("Venda sem financeira/valor financiado — nada a estornar.");
  }
  return prisma.$transaction(async (tx) => {
    await tx.accountTransfer.deleteMany({
      where: {
        fromId: sale.financerAccountId!,
        amount: sale.financedAmount!,
        description: { contains: sale.vehicle.plate },
      },
    });
    return tx.sale.update({ where: { id: saleId }, data: { financerSettledAt: null } });
  });
}

/**
 * Estorna a baixa do RETORNO: apaga as transferências (para o banco e, quando a
 * financeira pagou a menos, para o Banco Neutro) e os ajustes administrativos de
 * "diferença de retorno" (crédito/débito). A venda volta a ter o retorno a
 * receber. Espelha o estorno do retorno feito no cancelamento da venda.
 */
export async function reverseReturn(saleId: string) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: { vehicle: { select: { plate: true } } },
  });
  if (!sale.returnSettledAt) throw new Error("O retorno desta venda ainda não foi recebido.");
  if (!sale.financerAccountId || !sale.returnNet || sale.returnNet <= 0) {
    throw new Error("Venda sem retorno lançado — nada a estornar.");
  }
  const diffFilter = {
    AND: [
      { description: { contains: "Diferença de retorno" } },
      { description: { contains: sale.vehicle.plate } },
    ],
  };
  return prisma.$transaction(async (tx) => {
    await tx.accountTransfer.deleteMany({
      where: {
        fromId: sale.financerAccountId!,
        description: { contains: sale.vehicle.plate },
        OR: [
          { description: { contains: "Retorno financiamento" } },
          { description: { contains: "Diferença de retorno" } },
        ],
      },
    });
    await tx.receivable.deleteMany({ where: diffFilter });
    await tx.payable.deleteMany({ where: diffFilter });
    return tx.sale.update({
      where: { id: saleId },
      data: { returnSettledAt: null, returnPaidAmount: null },
    });
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
  documentNumber?: string | null;
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
  avulso?: boolean;
  purchaseRequestId?: string | null;
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
        documentNumber: input.documentNumber || null,
        amount: input.amount,
        dueDate: input.dueDate,
        paymentDate,
        status: input.paid ? "PAGO" : "PENDENTE",
        accountId,
        costCenterId: centerId,
        supplierId: input.supplierId || null,
        vehicleId: input.vehicleId || null,
        capitalBeneficiaryId: input.capitalBeneficiaryId || null,
        notes: input.notes || null,
        avulso: input.avulso ?? false,
        purchaseRequestId: input.purchaseRequestId || null,
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
    // Capital (retirada) só se move junto com o dinheiro: cria aqui quando o
    // título já nasce PAGO; se nascer pendente, a retirada é lançada na baixa
    // (markPayablePaid → syncPayableCapital), mantendo o farol consistente.
    if (input.capitalBeneficiaryId && input.paid) {
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: input.capitalBeneficiaryId,
          kind: "RETIRADA",
          amount: input.amount,
          date: input.paymentDate || input.dueDate,
          description: withNotes(input.description, input.notes),
          payableId: payable.id,
        },
      });
    }
    return payable;
  });
}

/**
 * Edita um título manual (não pago) permitindo mudar o destino: fluxo, veículo e
 * beneficiário do capital. Mantém o custo do veículo (VehicleCost) e o centro de
 * custo coerentes — cria/move/remove o VehicleCost conforme o veículo escolhido.
 */
export async function updateManualPayable(input: {
  id: string;
  description: string;
  category: CategoriaPagar;
  categoryLabel?: string | null;
  documentNumber?: string | null;
  amount: number;
  dueDate: Date;
  supplierId?: string | null;
  notes?: string | null;
  structuralKey?: StructuralKey;
  vehicleId?: string | null;
  capitalBeneficiaryId?: string | null;
}) {
  let vehicleSold = false;
  if (input.vehicleId) {
    const v = await prisma.vehicle.findUnique({ where: { id: input.vehicleId }, select: { status: true } });
    vehicleSold = v?.status === "VENDIDO";
  }
  const centerId = input.vehicleId
    ? await structuralCenterId(vehicleSold ? "ADMINISTRATIVO" : "VEICULOS")
    : input.capitalBeneficiaryId
      ? await structuralCenterId("CAPITAL")
      : await structuralCenterId(input.structuralKey || "ADMINISTRATIVO");

  return prisma.$transaction(async (tx) => {
    const payable = await tx.payable.update({
      where: { id: input.id },
      data: {
        description: input.description,
        category: input.category,
        categoryLabel: input.categoryLabel || null,
        documentNumber: input.documentNumber || null,
        amount: input.amount,
        dueDate: input.dueDate,
        supplierId: input.supplierId || null,
        notes: input.notes || null,
        vehicleId: input.vehicleId || null,
        capitalBeneficiaryId: input.capitalBeneficiaryId || null,
        costCenterId: centerId,
      },
    });

    // Sincroniza o custo do veículo com o novo destino.
    const existing = await tx.vehicleCost.findUnique({ where: { payableId: input.id } });
    if (input.vehicleId) {
      const costData = {
        vehicleId: input.vehicleId,
        description: input.categoryLabel ? `${input.categoryLabel}: ${input.description}` : input.description,
        amount: input.amount,
        date: input.dueDate,
        postSale: vehicleSold,
        notes: input.notes || null,
      };
      if (existing) await tx.vehicleCost.update({ where: { payableId: input.id }, data: costData });
      else await tx.vehicleCost.create({ data: { ...costData, category: "OUTROS", payableId: input.id } });
    } else if (existing) {
      await tx.vehicleCost.delete({ where: { payableId: input.id } });
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
  documentNumber?: string | null;
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
          documentNumber: input.documentNumber || null,
          category: "OUTROS",
          amount: input.amount,
          dueDate: input.date,
          receivedDate: input.date,
          status: "RECEBIDO",
          accountId: input.accountId,
          costCenterId: centerId,
          vehicleId: input.vehicleId || null,
          customerId: input.customerId || null,
          capitalBeneficiaryId: input.capitalBeneficiaryId || null,
          notes: input.notes || null,
          avulso: true,
        },
      });
      // Aporte de capital: registra a movimentação do beneficiário. As
      // observações do lançamento entram na descrição (a tabela do capital
      // mostra a descrição), para não se perderem.
      if (input.capitalBeneficiaryId) {
        await tx.capitalTransaction.create({
          data: {
            beneficiaryId: input.capitalBeneficiaryId,
            kind: "APORTE",
            amount: input.amount,
            date: input.date,
            description: withNotes(input.description, input.notes),
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
    documentNumber: input.documentNumber || null,
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
    avulso: true,
  });
}

/**
 * "Exclui" um lançamento do movimento de caixa.
 * - Lançamento AVULSO (dinheiro lançado direto no caixa): apaga de vez (atômico,
 *   junto da transação de Capital vinculada, para não deixar órfã).
 * - TÍTULO baixado (veio do Contas a pagar/receber): não destrói — ESTORNA a
 *   baixa (volta a PENDENTE via markPayablePending/markReceivablePending, que já
 *   desfazem a retirada/aporte de capital), fazendo o título voltar à lista.
 * Baixas de venda/peça/recorrência/consórcio/funcionário seguem bloqueadas
 * (devem ser revertidas na própria origem).
 */
export async function deleteCashEntry(kind: "entrada" | "saida", id: string) {
  if (kind === "entrada") {
    const r = await prisma.receivable.findUnique({
      where: { id },
      select: { id: true, avulso: true, saleId: true, partSaleId: true, recurringId: true, installmentNumber: true },
    });
    if (!r) return;
    if (r.saleId || r.partSaleId || r.recurringId || r.installmentNumber != null) {
      throw new Error("Este lançamento veio de uma venda/recorrência e deve ser revertido na origem.");
    }
    if (r.avulso) {
      await prisma.$transaction([
        prisma.capitalTransaction.deleteMany({ where: { receivableId: id } }),
        prisma.receivable.delete({ where: { id } }),
      ]);
    } else {
      // Estorna: o título volta a PENDENTE no Contas a receber.
      await markReceivablePending(id);
    }
    return;
  }

  const p = await prisma.payable.findUnique({
    where: { id },
    select: { id: true, avulso: true, vehicleId: true, partId: true, recurringId: true, consortiumId: true, employeeId: true },
  });
  if (!p) return;
  if (p.vehicleId || p.partId || p.recurringId || p.consortiumId || p.employeeId) {
    throw new Error("Este lançamento veio de outra operação e deve ser revertido na origem.");
  }
  if (p.avulso) {
    await prisma.$transaction([
      prisma.capitalTransaction.deleteMany({ where: { payableId: id } }),
      prisma.payable.delete({ where: { id } }),
    ]);
  } else {
    // Estorna: o título volta a PENDENTE no Contas a pagar.
    await markPayablePending(id);
  }
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
