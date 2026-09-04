import { prisma, type TransactionClient } from "@/lib/prisma";
import { getDefaultAccountId, getNeutralAccountId } from "@/lib/accounts";
import { structuralCenterId } from "@/lib/structural";
import { syncCardInvoiceDerived } from "@/lib/card-invoice";
import { computeReturn, retornoLabel } from "@/lib/retorno";
import { effectiveStructuralKey, type StructuralKey } from "@/lib/structural-flows";
import { resolveDespesaCategory } from "@/lib/categories";
import { nameKey } from "@/lib/person-keys";
import { timed } from "@/lib/perf";
import {
  chassiOrNull,
  renavamOrNull,
  missingVehicleDocs,
  missingVehicleDocsError,
} from "@/lib/vehicle-doc";
import {
  parseDebtItems,
  debtsDiff,
  AJUSTE_DEBITOS_DESC,
  AJUSTE_QUITACAO_DESC,
  type VehicleDebtItem,
} from "@/lib/vehicle-debts";
import { parseDateInput } from "@/lib/format";
import type {
  CategoriaCustoVeiculo,
  CategoriaPagar,
  CategoriaReceber,
  FormaPagamento,
  Prisma,
} from "@prisma/client";

/** R$ formatado, para as notas dos lançamentos. */
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

/**
 * Título que É a compra do carro (aquisição, quitação, repasse do consignado).
 * Esse valor já está no `Vehicle.purchasePrice`, então ele NUNCA pode virar um
 * `VehicleCost`: o custo do veículo é calculado como
 * `purchasePrice + soma(VehicleCost)` (estoque/[id]/page.tsx e estoque/page.tsx)
 * e o mesmo dinheiro apareceria duas vezes, estourando o custo e a margem.
 */
export function isVehiclePurchase(category: CategoriaPagar): boolean {
  return category === "COMPRA_VEICULO";
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
  /** Detalhamento opcional dos débitos (uma conta a pagar por linha). */
  debtsItems?: unknown;
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
  const debtsItems = parseDebtItems(input.debtsItems);
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
        chassi: chassiOrNull(input.chassi),
        renavam: renavamOrNull(input.renavam),
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
        debtsItems: debtsItems,
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
        debtsItems,
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
  tx: TransactionClient,
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
    /** Quitação REAL (boleto), quando diverge do acordado — ver Vehicle. */
    payoffActualAmount?: number | null;
    payoffTo?: string | null;
    debtsAmount?: number;
    /** Detalhamento dos débitos: uma conta a pagar por linha. */
    debtsItems?: VehicleDebtItem[];
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
  // Quitação REAL (boleto do banco): o título sai pelo real; o ACORDADO
  // (payoffAmount) segue ancorando o líquido ao vendedor. A diferença vira
  // custo de ajuste — boleto maior é custo do carro, menor reduz o custo —
  // mesma regra dos débitos (guias × acordado).
  const payoffActual = (input.payoffActualAmount ?? 0) > 0
    ? Math.round((input.payoffActualAmount as number) * 100) / 100
    : payoffAmount;
  const debtsAmount = Math.max(0, input.debtsAmount ?? 0);

  // Repasse: quitação do financiamento (banco) e débitos do veículo (órgãos)
  // são contas a pagar separadas, com credores próprios, abatendo o valor
  // negociado. O que sobra é o líquido pago ao vendedor.
  if (payoffAmount > 0) {
    await tx.payable.create({
      data: {
        ...base,
        description: `Quitação do financiamento ${input.label}${input.payoffTo ? ` (${input.payoffTo})` : ""}`,
        amount: payoffActual,
        dueDate: input.dueDate,
        status: "PENDENTE",
        supplierId: null,
      },
    });
    const payoffDiff = Math.round((payoffActual - payoffAmount) * 100) / 100;
    if (Math.abs(payoffDiff) > 0.005) {
      // Mesmo racional do ajuste de débitos: o título soma o REAL e o farol
      // pede pagáveis == purchasePrice + Σ custos, então a diferença fecha a
      // conta como custo (positivo) ou redução de custo (negativo).
      await tx.vehicleCost.create({
        data: {
          vehicleId: input.vehicleId,
          description: AJUSTE_QUITACAO_DESC,
          category: "OUTROS",
          amount: payoffDiff,
          date: input.entryDate,
          postSale: false,
          notes: `Boleto ${brl(payoffActual)} · acordado com o vendedor ${brl(payoffAmount)}`,
        },
      });
    }
  }
  if (debtsAmount > 0) {
    // Detalhado (IPVA, multa, licenciamento...): um título por linha, cada um
    // com o seu vencimento. Sem detalhamento, o título único de sempre.
    const items = (input.debtsItems ?? []).filter((d) => d.amount > 0);
    if (items.length) {
      for (const item of items) {
        await tx.payable.create({
          data: {
            ...base,
            description: `Débitos do veículo: ${item.description || "sem descrição"} ${input.label}`,
            amount: item.amount,
            dueDate: item.dueDate ? parseDateInput(item.dueDate) : input.dueDate,
            status: "PENDENTE",
            supplierId: null,
          },
        });
      }
    } else {
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

    // As guias reais podem não bater com o ACORDADO (debtsAmount, que é o que
    // foi descontado do antigo dono e ancora o líquido). A diferença é custo do
    // veículo: positiva quando as guias vieram maiores, negativa quando vieram
    // menores. O farol pede `pagáveis == purchasePrice + Σ VehicleCost`, e como
    // os títulos somam o REAL, essa linha fecha a conta sem tocar no
    // purchasePrice (que segue sendo o valor negociado, o que vai no contrato).
    //
    // Sem Payable de propósito: o dinheiro dela já está dentro dos títulos de
    // débito. Um VehicleCost solto só desequilibraria se NÃO houvesse esse
    // excedente do lado dos títulos — não é o caso.
    const { real, diff } = debtsDiff(debtsAmount, items);
    if (Math.abs(diff) > 0.005) {
      await tx.vehicleCost.create({
        data: {
          vehicleId: input.vehicleId,
          description: AJUSTE_DEBITOS_DESC,
          category: "OUTROS",
          amount: diff,
          date: input.entryDate,
          postSale: false,
          notes: `Guias ${brl(real)} · acordado com o antigo dono ${brl(debtsAmount)}`,
        },
      });
    }
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
    // O custo de ajuste dos débitos é recriado junto com os títulos — sem isto
    // cada edição do veículo somaria mais uma linha.
    await tx.vehicleCost.deleteMany({
      where: {
        vehicleId,
        payableId: null,
        description: { in: [AJUSTE_DEBITOS_DESC, AJUSTE_QUITACAO_DESC] },
      },
    });

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
        payoffActualAmount: vehicle.payoffActualAmount,
        payoffTo: vehicle.payoffTo,
        debtsAmount: vehicle.debtsAmount,
        // Detalhamento vem do veículo: é por isso que ele é gravado lá, e não
        // só no formulário — aqui os títulos são apagados e recriados.
        debtsItems: parseDebtItems(vehicle.debtsItems),
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
  // Custo custeado pelo CAPITAL de um sócio (veículo atrelado a ele): vira uma
  // RETIRADA do capital do sócio — ele é o dono do resultado do carro, então o
  // custo sai do capital dele e NÃO conta como despesa/pós-venda da empresa. Só
  // vale para veículo já VENDIDO (pós-venda).
  capitalBeneficiaryId?: string | null;
}) {
  if (input.capitalBeneficiaryId) {
    return addPostSaleCostFromCapital({
      vehicleId: input.vehicleId,
      description: input.description,
      category: input.category,
      amount: input.amount,
      date: input.date,
      notes: input.notes ?? null,
      supplierId: input.supplierId ?? null,
      alreadyPaid: input.alreadyPaid,
      capitalBeneficiaryId: input.capitalBeneficiaryId,
    });
  }
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

/**
 * Lança um custo PÓS-VENDA custeado pelo CAPITAL de um sócio (veículo atrelado a
 * ele). O sócio é o dono do resultado do carro, então o custo sai do CAPITAL
 * dele — vira uma RETIRADA — e NÃO conta como despesa/pós-venda da empresa.
 *
 * O título é do fluxo CAPITAL (categoria OUTROS, com capitalBeneficiaryId): ao
 * ser pago (na conta), gera a retirada do sócio (caixa −X, capital −X → a
 * equação não muda) e fica de fora da DRE (não é despesa da loja). O VehicleCost
 * guarda o mesmo capitalBeneficiaryId para ser excluído da margem/Lucro/Prejuízo.
 *
 * Só vale para veículo já VENDIDO. Respeita "já paguei no ato": pago agora vira
 * retirada na hora; senão fica PENDENTE (retirada quando for pago no a-pagar).
 */
async function addPostSaleCostFromCapital(input: {
  vehicleId: string;
  description: string;
  category: CategoriaCustoVeiculo;
  amount: number;
  date: Date;
  notes: string | null;
  supplierId: string | null;
  alreadyPaid: boolean;
  capitalBeneficiaryId: string;
}) {
  const [capitalCenterId, defaultAccountId] = await Promise.all([
    structuralCenterId("CAPITAL"),
    input.alreadyPaid ? getDefaultAccountId() : Promise.resolve(null),
  ]);
  const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
  if (vehicle.status !== "VENDIDO") {
    throw new Error(
      "Atrelar o custo ao capital do sócio só vale para pós-venda (veículo já vendido).",
    );
  }
  const beneficiary = await prisma.capitalBeneficiary.findUniqueOrThrow({
    where: { id: input.capitalBeneficiaryId },
    select: { active: true },
  });
  if (!beneficiary.active) throw new Error("Sócio (beneficiário do capital) inativo.");

  const suffix = `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`;
  const payable = await prisma.$transaction(async (tx) => {
    const payable = await tx.payable.create({
      data: {
        description: `${input.description} - ${suffix}`,
        // Fluxo Capital: categoria OUTROS + capitalBeneficiaryId → vira retirada
        // na baixa. Não é despesa da loja (excluída da DRE por retirada e por ter
        // veículo/custo vinculados).
        category: "OUTROS",
        amount: input.amount,
        dueDate: input.date,
        paymentDate: input.alreadyPaid ? input.date : null,
        status: input.alreadyPaid ? "PAGO" : "PENDENTE",
        supplierId: input.supplierId || null,
        vehicleId: vehicle.id,
        capitalBeneficiaryId: input.capitalBeneficiaryId,
        accountId: input.alreadyPaid ? defaultAccountId : null,
        costCenterId: capitalCenterId,
        notes: input.notes || null,
      },
    });
    await tx.vehicleCost.create({
      data: {
        vehicleId: vehicle.id,
        description: input.description,
        category: input.category,
        amount: input.amount,
        date: input.date,
        postSale: true,
        // Marca o custo como custeado pelo capital do sócio: fica FORA da
        // margem do carro e do Lucro/Prejuízo (é custo do sócio, não da loja).
        capitalBeneficiaryId: input.capitalBeneficiaryId,
        notes: input.notes || null,
        payableId: payable.id,
      },
    });
    return payable;
  });

  // Pago no ato: gera a retirada do capital agora (syncPayableCapital roda na baixa).
  if (input.alreadyPaid) await syncPayableCapital(payable.id);

  return prisma.vehicleCost.findFirstOrThrow({ where: { payableId: payable.id } });
}

export async function deleteVehicleCost(costId: string) {
  return prisma.$transaction(async (tx) => {
    const cost = await tx.vehicleCost.findUniqueOrThrow({
      where: { id: costId },
    });
    if (cost.cardItemId) {
      throw new Error(
        "Este custo vem de um lançamento da fatura do cartão — exclua o lançamento dentro do título da fatura.",
      );
    }
    await tx.vehicleCost.delete({ where: { id: costId } });
    // Peça do almoxarifado: as unidades voltam para o estoque.
    if (cost.partId && cost.partQuantity) {
      await tx.part.update({
        where: { id: cost.partId },
        data: { quantity: { increment: cost.partQuantity } },
      });
    }
    if (cost.payableId) {
      // Custo custeado pelo capital do sócio: o título é uma retirada; a
      // movimentação de capital vinculada sai junto (senão o capital não volta).
      await tx.capitalTransaction.deleteMany({ where: { payableId: cost.payableId } });
      await tx.payable.delete({ where: { id: cost.payableId } });
    }
  });
}

/**
 * Remove o custo do veículo MANTENDO a conta a pagar vinculada: o título perde o
 * vínculo com o carro e volta ao Contas a pagar como lançamento administrativo
 * (título sem veículo não fica no fluxo Veículos). Para desfazer um vínculo
 * errado sem perder o título — a exclusão de verdade é deleteVehicleCost.
 */
export async function detachVehicleCost(costId: string) {
  const adminCenterId = await structuralCenterId("ADMINISTRATIVO");
  return prisma.$transaction(async (tx) => {
    const cost = await tx.vehicleCost.findUniqueOrThrow({
      where: { id: costId },
    });
    if (cost.cardItemId) {
      throw new Error(
        "Este custo vem de um lançamento da fatura do cartão — ajuste o lançamento dentro do título da fatura.",
      );
    }
    await tx.vehicleCost.delete({ where: { id: costId } });
    if (cost.partId && cost.partQuantity) {
      await tx.part.update({
        where: { id: cost.partId },
        data: { quantity: { increment: cost.partQuantity } },
      });
    }
    if (cost.payableId) {
      await tx.payable.update({
        where: { id: cost.payableId },
        data: { vehicleId: null, costCenterId: adminCenterId },
      });
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
  /** Conta de onde saiu o dinheiro — obrigatória quando já foi paga. */
  accountId?: string | null;
  dueDate?: Date | null;
}) {
  const contaPagamento = input.alreadyPaid
    ? input.accountId || (await getDefaultAccountId())
    : null;
  const pecasCenterId = await structuralCenterId("PECAS");
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
          partQuantity: input.quantity,
          accountId: contaPagamento,
          costCenterId: pecasCenterId,
        },
      });
    }

    return part;
  });
}

/**
 * Entrada de estoque de uma peça que já existe.
 *
 * O custo da peça passa a ser o CUSTO MÉDIO PONDERADO entre o que já havia em
 * estoque e o que está entrando. Antes o custo era simplesmente substituído
 * pelo da última compra: como o almoxarifado é avaliado por
 * `quantidade × custo`, trocar o custo revalorizava todo o estoque sem que
 * dinheiro nenhum tivesse se movido — e o farol acusava a diferença.
 */
export async function addPartStockWithPayable(input: {
  partId: string;
  quantity: number;
  costPrice: number;
  supplierId?: string | null;
  alreadyPaid: boolean;
  /** Conta de onde saiu o dinheiro — obrigatória quando já foi paga. */
  accountId?: string | null;
  dueDate?: Date | null;
  /** Data do movimento (lançamento pelo caixa); padrão hoje. */
  date?: Date | null;
  description?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
}) {
  const contaPagamento = input.alreadyPaid
    ? input.accountId || (await getDefaultAccountId())
    : null;
  const pecasCenterId = await structuralCenterId("PECAS");
  return prisma.$transaction(async (tx) => {
    const atual = await tx.part.findUniqueOrThrow({
      where: { id: input.partId },
      select: { quantity: true, costPrice: true },
    });
    // Custo médio ponderado: (estoque atual + entrada) / quantidade total.
    const quantidadeTotal = atual.quantity + input.quantity;
    const custoMedio =
      quantidadeTotal > 0
        ? (atual.quantity * atual.costPrice + input.quantity * input.costPrice) / quantidadeTotal
        : input.costPrice;

    const part = await tx.part.update({
      where: { id: input.partId },
      data: {
        quantity: { increment: input.quantity },
        // Guardado SEM arredondar: o almoxarifado vale quantidade × custo, e
        // arredondar o unitário multiplicaria o erro pela quantidade (26 un. a
        // 18,00 + 20 a 30,00 dariam 1.068,12 em vez de 1.068,00 — e o farol
        // acusaria os 12 centavos). As telas continuam exibindo 2 casas.
        costPrice: custoMedio,
        supplierId: input.supplierId || undefined,
      },
    });

    const totalCost = input.costPrice * input.quantity;
    const movimento = input.date || new Date();
    // A quantidade entra na DESCRIÇÃO do título: é ela que aparece no Livro
    // caixa, no extrato da conta e no Contas a pagar. Sem isso, um lançamento
    // "Pastilha de freio · R$ 950,00" não diz se foram 2 ou 12 peças.
    const textoUsuario = input.description?.trim() || "";
    const descricao = textoUsuario
      ? textoUsuario.toLowerCase().includes(part.name.toLowerCase())
        ? `${textoUsuario} (${input.quantity} un.)`
        : `${textoUsuario} — ${part.name} (${input.quantity} un.)`
      : `Reposição de estoque: ${part.name} (${input.quantity} un.)`;
    if (totalCost > 0) {
      await tx.payable.create({
        data: {
          description: descricao,
          documentNumber: input.documentNumber || null,
          notes: input.notes || null,
          category: "COMPRA_PECA" as CategoriaPagar,
          amount: totalCost,
          dueDate: input.alreadyPaid ? movimento : input.dueDate || movimento,
          paymentDate: input.alreadyPaid ? movimento : null,
          status: input.alreadyPaid ? "PAGO" : "PENDENTE",
          supplierId: input.supplierId || null,
          partId: part.id,
          partQuantity: input.quantity,
          accountId: contaPagamento,
          costCenterId: pecasCenterId,
        },
      });
    }

    return part;
  });
}

/**
 * Aplica uma peça do ALMOXARIFADO em um veículo do estoque.
 *
 * Não gera conta a pagar: a compra da peça já foi lançada quando ela entrou no
 * almoxarifado. O que acontece aqui é uma TROCA DE ATIVO — o valor sai do
 * estoque de peças e entra no custo do carro, pelo custo médio da peça. Quando
 * o carro for vendido, esse custo entra na margem da venda, como qualquer outro.
 *
 * Só vale para carro que ainda está no estoque: num carro já vendido o custo
 * pós-venda só é reconhecido quando pago, e aqui não há pagamento nenhum — a
 * peça sairia do almoxarifado sem contrapartida e o farol acusaria.
 */
export async function applyPartToVehicle(input: {
  partId: string;
  vehicleId: string;
  quantity: number;
  date: Date;
  category?: CategoriaCustoVeiculo;
  notes?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const part = await tx.part.findUniqueOrThrow({ where: { id: input.partId } });
    const vehicle = await tx.vehicle.findUniqueOrThrow({
      where: { id: input.vehicleId },
      select: { id: true, status: true, brand: true, model: true, plate: true },
    });
    if (vehicle.status === "VENDIDO") {
      throw new Error(
        "Este veículo já foi vendido. Peça do almoxarifado só pode ser aplicada em carro que ainda está no estoque.",
      );
    }
    if (input.quantity < 1) throw new Error("Informe a quantidade de peças.");
    if (part.quantity < input.quantity) {
      throw new Error(`Estoque insuficiente de "${part.name}". Disponível: ${part.quantity}.`);
    }

    await tx.part.update({
      where: { id: part.id },
      data: { quantity: { decrement: input.quantity } },
    });

    return tx.vehicleCost.create({
      data: {
        vehicleId: vehicle.id,
        description: `Peça do almoxarifado: ${part.name} (${input.quantity} un.)`,
        category: input.category || "MECANICA",
        amount: input.quantity * part.costPrice,
        date: input.date,
        postSale: false,
        notes: input.notes || null,
        partId: part.id,
        partQuantity: input.quantity,
      },
    });
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
/**
 * REGISTRA um sinal / entrada antecipada como PENDENTE (aguardando crédito): o
 * vendedor informa o valor, a conta em que o cliente depositou e a data do
 * depósito. Ainda NÃO entra no caixa — o dinheiro só é creditado quando o caixa
 * for aberto na data do depósito e alguém confirmar (creditVehicleAdvance). Um
 * recebível PENDENTE com veículo e sem venda é neutro na equação/caixa.
 */
export async function registerVehicleAdvance(input: {
  vehicleId: string;
  amount: number;
  depositDate: Date;
  accountId: string;
  customerId?: string | null;
  proofAttachmentId?: string | null;
  notes?: string | null;
}) {
  const veiculosCenterId = await structuralCenterId("VEICULOS");
  const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } });
  return prisma.receivable.create({
    data: {
      description: `Sinal / entrada antecipada - ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
      category: "VENDA_VEICULO",
      amount: input.amount,
      // Vencimento = data do depósito (é quando o valor "existe"); o crédito no
      // caixa acontece na baixa, com a data de trabalho do caixa.
      dueDate: input.depositDate,
      status: "PENDENTE",
      customerId: input.customerId || null,
      vehicleId: input.vehicleId,
      accountId: input.accountId,
      costCenterId: veiculosCenterId,
      proofAttachmentId: input.proofAttachmentId || null,
      notes: input.notes || null,
    },
  });
}

/**
 * CREDITA um sinal pendente: baixa o recebível na conta indicada, com a data de
 * trabalho do caixa (`creditDate`). A partir daí segue o fluxo normal do sinal
 * (abatido do cliente no fechamento da venda). Só credita sinal PENDENTE ligado
 * a um veículo e ainda sem venda.
 */
export async function creditVehicleAdvance(receivableId: string, creditDate: Date) {
  const r = await prisma.receivable.findUniqueOrThrow({
    where: { id: receivableId },
    select: { status: true, vehicleId: true, saleId: true, accountId: true },
  });
  if (r.status !== "PENDENTE") throw new Error("Este sinal já foi creditado.");
  if (!r.vehicleId || r.saleId) throw new Error("Este título não é um sinal pendente.");
  const accountId = r.accountId ?? (await getDefaultAccountId());
  await markReceivableReceived(receivableId, creditDate, accountId);
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
  /** Em nome de quem está o documento (proprietário lido do CRLV). */
  docOwnerName?: string | null;
  /** 0 km: sem placa/RENAVAM até o emplacamento (identificado pelo chassi). */
  zeroKm?: boolean;
  /** Montadora/concessionária emitente da nota fiscal do 0 km. */
  manufacturerName?: string | null;
}) {
  return prisma.vehicle.create({
    data: {
      docOwnerName: input.docOwnerName || null,
      zeroKm: Boolean(input.zeroKm),
      manufacturerName: input.manufacturerName || null,
      brand: input.brand,
      model: input.model,
      version: input.version || null,
      manufactureYear: input.manufactureYear,
      modelYear: input.modelYear,
      plate: input.plate.toUpperCase(),
      chassi: chassiOrNull(input.chassi),
      renavam: renavamOrNull(input.renavam),
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

export const registerVehicleSale = (...a: Parameters<typeof vehicleSale>) =>
  timed("registrar venda", () => vehicleSale(...a));

async function vehicleSale(input: {
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
  // Quitação do financiamento anterior (financiamento de terceiros; contrato).
  payoffBank?: string | null;
  payoffAmount?: number | null;
  payoffBarcode?: string | null;
  payoffDueDate?: Date | null;
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
  /** Seguro vendido junto ao financiamento: fica pendente até o valor cair. */
  insuranceSold?: boolean | null;
  // Informativo: venda originada de anúncio de tráfego pago (card do dashboard).
  viaPaidTraffic?: boolean | null;
  notes?: string | null;
  // Financiamento: banco/financeira e valor financiado (repasse). O que sobrar
  // do valor a cobrar (billable − financiado) é a entrada paga agora.
  financerName?: string | null;
  financedAmount?: number | null;
  // Financiamento JÁ recebido (está no sinal/entradas já recebidas): não gera
  // repasse a receber do banco nem devolução ao cliente (evita duplicidade).
  financedAlreadyReceived?: boolean;
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
  // Comissão do vendedor aplicada no capital dele (aporte) em vez de virar conta
  // a pagar — só quando o vendedor (sellerId) é beneficiário do capital.
  commissionToCapital?: boolean;
}) {
  const defaultAccountId = await getDefaultAccountId();
  // Trava única de documentos: TODO caminho que efetiva uma venda passa por
  // aqui (conversão de pré-venda, venda direta e conversão de intermediação) —
  // o único `sale.create` do sistema está logo abaixo. Vender sem RENAVAM ou
  // sem chassi deixa o contrato de compra e o termo de troca com uma linha em
  // branco para preencher à mão, então o registro é recusado.
  const docs = await prisma.vehicle.findUniqueOrThrow({
    where: { id: input.vehicleId },
    select: { chassi: true, renavam: true },
  });
  const faltando = missingVehicleDocs(docs);
  if (faltando.length) throw new Error(missingVehicleDocsError(faltando));

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
        financedAlreadyReceived:
          input.paymentMethod === "FINANCIADO" ? Boolean(input.financedAlreadyReceived) : false,
        financerAccountId: input.paymentMethod === "FINANCIADO" ? input.financerAccountId || null : null,
        returnLevel: input.paymentMethod === "FINANCIADO" ? Math.max(0, input.returnLevel ?? 0) : 0,
        // Só marca; nada é lançado até a comissão do seguro cair.
        insuranceSold: input.paymentMethod === "FINANCIADO" && !!input.insuranceSold,
        commissionAmount: commission,
        referrals,
        transferCharged,
        transferAmount,
        // Valor RESERVADO no registro da venda: não muda quando o orçamento do
        // despachante ajusta a transferência (é a referência do "de → para").
        transferReservedAmount: transferCharged ? transferAmount : null,
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
        payoffBank: input.payoffBank || null,
        payoffAmount: input.payoffAmount ?? null,
        payoffBarcode: input.payoffBarcode || null,
        payoffDueDate: input.payoffDueDate ?? null,
        notes: input.notes || null,
        tradeInVehicleId: input.tradeInVehicleId || null,
        consigned: Boolean(input.consigned),
        ownerRefundAmount: input.consigned ? ownerRefund : 0,
        ownerRefundToCapital: Boolean(input.consigned && input.ownerRefundToCapital),
        ownerRefundBeneficiaryId:
          input.consigned && input.ownerRefundToCapital ? input.ownerRefundBeneficiaryId || null : null,
        commissionToCapital: Boolean(input.commissionToCapital),
      },
    });

    await tx.vehicle.update({
      where: { id: input.vehicleId },
      data: { status: "VENDIDO" },
    });

    // Comissão no capital: quando a flag está ligada e o vendedor é beneficiário
    // do capital, a comissão do vendedor (e a do retorno) vira APORTE no capital
    // dele em vez de conta a pagar. Sem beneficiário vinculado → conta a pagar.
    const commissionBeneficiary =
      input.commissionToCapital && input.sellerId
        ? await tx.capitalBeneficiary.findUnique({
            where: { userId: input.sellerId },
            select: { id: true },
          })
        : null;

    // Comissão do vendedor: conta a pagar avulsa (categoria Comissão, centro
    // Administrativo), vinculada à venda. NÃO é custo do veículo (vehicleId
    // nulo) — é despesa de venda, entra no resultado quando for paga.
    // Quando aplicada no capital, vira APORTE puro (sem conta a pagar); o custo
    // continua reconhecido na DRE por competência (sale.commissionAmount).
    if (commission > 0 && adminCenterId) {
      if (commissionBeneficiary) {
        await tx.capitalTransaction.create({
          data: {
            beneficiaryId: commissionBeneficiary.id,
            kind: "APORTE",
            amount: commission,
            date: input.saleDate,
            saleId: sale.id,
            description: `Aporte — comissão de venda${input.sellerName ? ` (${input.sellerName})` : ""} — ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
          },
        });
      } else {
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
    // (Administrativo, vencendo na data da venda). NÃO é custo do veículo
    // (vehicleId nulo) — não mexe na margem do carro.
    // A categoria interna é COMISSAO (é ela que diz à equação patrimonial que
    // isto é custo da venda, já reconhecido no resultado por competência); o
    // rótulo exibido é "Documentação de veículo", que descreve o gasto.
    if (transferAmount > 0 && adminCenterId) {
      await tx.payable.create({
        data: {
          description: `Transferência DETRAN — ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
          category: "COMISSAO",
          categoryLabel: "Documentação de veículo",
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
      // Financiamento JÁ recebido (está no sinal/entradas já recebidas): o valor
      // financiado não é dinheiro NOVO — não vira repasse a receber nem gera
      // devolução do excedente. Evita a duplicidade (contar o mesmo dinheiro no
      // sinal e no repasse).
      const financedAlreadyIn = input.paymentMethod === "FINANCIADO" && Boolean(input.financedAlreadyReceived);
      // Excedente do financiamento sobre o restante soma na devolução (que já
      // pode conter o excedente da troca + sinal). No refinanciamento a loja não
      // devolve nada (a financeira paga F direto ao financiado).
      if (input.refinancing || financedAlreadyIn) {
        devolucaoCliente = input.refinancing ? 0 : devolucaoCliente;
      } else {
        devolucaoCliente = Math.round((devolucaoCliente + Math.max(0, financed - billable)) * 100) / 100;
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
        // Financiamento já recebido: o repasse já entrou (no sinal), então não
        // vira um novo título a receber (seria duplicidade).
        if (!input.refinancing && !financedAlreadyIn) {
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
                // Igual à comissão de venda: no capital vira APORTE puro; senão
                // conta a pagar. Custo reconhecido na DRE por competência.
                if (commissionBeneficiary) {
                  await tx.capitalTransaction.create({
                    data: {
                      beneficiaryId: commissionBeneficiary.id,
                      kind: "APORTE",
                      amount: returnCommission,
                      date: input.saleDate,
                      saleId: sale.id,
                      description: `Aporte — comissão do retorno${input.sellerName ? ` (${input.sellerName})` : ""} — ${vehicle.brand} ${vehicle.model} (${vehicle.plate})`,
                    },
                  });
                } else {
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
                }
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
      // MESMA regra do veículo próprio: os títulos saem pelo valor REAL
      // (boleto/guias) e o ACORDADO com o dono não muda — a devolução fica a
      // combinada. A diferença é da loja: acréscimo é perda (custo do veículo),
      // desconto é ganho (custo negativo). O custo entra por competência
      // (postSale false), então Lucro/Prejuízo e equação patrimonial fecham
      // juntos com o título pendente.
      if (payoff > 0) {
        const payoffActual =
          (vehicle.payoffActualAmount ?? 0) > 0
            ? Math.round((vehicle.payoffActualAmount as number) * 100) / 100
            : payoff;
        await tx.payable.create({
          data: {
            description: `Quitação do financiamento ${repasseLabel}${vehicle.payoffTo ? ` (${vehicle.payoffTo})` : ""}`,
            category: "COMPRA_VEICULO",
            amount: payoffActual,
            dueDate: input.saleDate,
            status: "PENDENTE",
            vehicleId: input.vehicleId,
            costCenterId: veiculosCenterId,
          },
        });
        const payoffDiff = Math.round((payoffActual - payoff) * 100) / 100;
        if (Math.abs(payoffDiff) > 0.005) {
          await tx.vehicleCost.create({
            data: {
              vehicleId: input.vehicleId,
              description: AJUSTE_QUITACAO_DESC,
              category: "OUTROS",
              amount: payoffDiff,
              date: input.saleDate,
              postSale: false,
              notes: `Boleto ${brl(payoffActual)} · descontado do proprietário ${brl(payoff)}`,
            },
          });
        }
      }
      // Débitos detalhados (IPVA, multa, licenciamento...): um título por guia,
      // cada um com o seu vencimento. A soma REAL das guias × o descontado do
      // dono (debtsAmount) segue a regra acima: diferença vira custo (ou ganho).
      const debtItems = parseDebtItems(vehicle.debtsItems).filter((d) => d.amount > 0);
      const debtsReal = debtItems.length
        ? Math.round(debtItems.reduce((s, d) => s + d.amount, 0) * 100) / 100
        : debts;
      if (debtItems.length) {
        for (const item of debtItems) {
          await tx.payable.create({
            data: {
              description: `Débitos do veículo: ${item.description || "sem descrição"} ${repasseLabel}`,
              category: "COMPRA_VEICULO",
              amount: item.amount,
              dueDate: item.dueDate ? parseDateInput(item.dueDate) : input.saleDate,
              status: "PENDENTE",
              vehicleId: input.vehicleId,
              costCenterId: veiculosCenterId,
            },
          });
        }
        const debtsDiffValue = Math.round((debtsReal - debts) * 100) / 100;
        if (Math.abs(debtsDiffValue) > 0.005) {
          await tx.vehicleCost.create({
            data: {
              vehicleId: input.vehicleId,
              description: AJUSTE_DEBITOS_DESC,
              category: "OUTROS",
              amount: debtsDiffValue,
              date: input.saleDate,
              postSale: false,
              notes: `Guias ${brl(debtsReal)} · descontado do proprietário ${brl(debts)}`,
            },
          });
        }
      } else if (debts > 0) {
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
      // Líquido ao proprietário = valor acertado − quitação − débitos, todos
      // ACORDADOS (a devolução do dono não muda com boleto maior/menor).
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
      include: { vehicle: { select: { plate: true, consigned: true } } },
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
    //     pago, o dinheiro volta ao caixa). Se a comissão foi "aplicada no
    //     capital" (Pagar comissão), o título PAGO no Banco Neutro também tem
    //     saleId e cai aqui; o recebível do aporte (par no Banco Neutro) cai no
    //     passo 2 e a movimentação de capital no passo 2d — o trio some junto.
    await tx.payable.deleteMany({ where: { saleId, category: "COMISSAO" } });

    // 2c-bis) Venda paga com o capital de um sócio: o recebível (RECEBIDO no
    //     Banco Neutro) cai no passo 2 — a retirada-par (PAGA no mesmo neutro)
    //     precisa sair junto, senão o neutro trava desbalanceado e o capital do
    //     sócio não volta. O lançamento de capital está ligado ao título
    //     (payableId, sem cascade), então sai primeiro.
    const capitalPairs = await tx.payable.findMany({
      where: { saleId, capitalBeneficiaryId: { not: null }, category: "OUTROS" },
      select: { id: true },
    });
    if (capitalPairs.length) {
      const ids = capitalPairs.map((p) => p.id);
      await tx.capitalTransaction.deleteMany({ where: { payableId: { in: ids } } });
      await tx.payable.deleteMany({ where: { id: { in: ids } } });
    }

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
    // Consignado: os custos de AJUSTE (boleto/guias × descontado do dono) só
    // existem por causa do fechamento — saem junto com os títulos de repasse.
    // (Num veículo próprio o ajuste é da COMPRA e fica.)
    if (sale.vehicle?.consigned) {
      await tx.vehicleCost.deleteMany({
        where: {
          vehicleId: sale.vehicleId,
          payableId: null,
          description: { in: [AJUSTE_DEBITOS_DESC, AJUSTE_QUITACAO_DESC] },
        },
      });
    }
    await tx.capitalTransaction.deleteMany({ where: { saleId } });

    // 2e) Desconto concedido na baixa de um recebível desta venda: o par do
    //     Banco Neutro precisa sair inteiro. O recebível já caiu no passo 2
    //     (−diff no neutro); sem apagar o título PAGO o neutro travaria
    //     negativo. O VehicleCost não sai por cascade (payable é SetNull).
    const descontos = await tx.payable.findMany({
      where: { saleId, categoryLabel: DISCOUNT_CATEGORY_LABEL },
      select: { id: true },
    });
    if (descontos.length) {
      const ids = descontos.map((d) => d.id);
      await tx.vehicleCost.deleteMany({ where: { payableId: { in: ids } } });
      await tx.payable.deleteMany({ where: { id: { in: ids } } });
    }

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

    // 3c) Comissão de seguro já recebida: apaga o recebimento e a comissão do
    //     vendedor (conta a pagar ou aporte no capital).
    if (sale.insuranceSettledAt) {
      await tx.receivable.deleteMany({ where: { saleId, category: "COMISSAO_SEGURO" } });
      await tx.payable.deleteMany({
        where: { saleId, category: "COMISSAO", description: { startsWith: "Comissão do seguro" } },
      });
      await tx.capitalTransaction.deleteMany({
        where: { saleId, description: { startsWith: "Aporte — comissão do seguro" } },
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
  /** Conta em que o dinheiro entra — obrigatória na venda à vista. */
  accountId?: string | null;
  notes?: string | null;
}) {
  const contaRecebimento =
    input.paymentMethod === "A_VISTA" ? input.accountId || (await getDefaultAccountId()) : null;
  const pecasCenterId = await structuralCenterId("PECAS");
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
        // Congela o custo do almoxarifado no momento da venda: é ele que vai
        // formar a margem no Lucro/Prejuízo, mesmo que a peça seja reposta
        // depois por um preço diferente.
        unitCost: part.costPrice,
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
        accountId: contaRecebimento,
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
      data: receivablesData.map((r) => ({ ...r, costCenterId: pecasCenterId })),
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
  // Retirada paga com SUBSTITUIÇÃO (a fatia aplicada trocou de dono): ao estornar
  // o título, a troca da fatia também é desfeita — senão o aplicado do substituto
  // fica pendurado sem a retirada correspondente.
  if (p.status !== "PAGO") {
    await prisma.investmentAllocation.deleteMany({ where: { payableId: p.id } });
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

export const markPayablePaid = (...a: Parameters<typeof payablePaid>) =>
  timed("baixa: pagar título", () => payablePaid(...a));

async function payablePaid(id: string, paymentDate: Date, accountId?: string | null) {
  const account = accountId ?? (await getDefaultAccountId());
  const updated = await prisma.payable.update({
    where: { id },
    data: { status: "PAGO", paymentDate, accountId: account },
  });
  await syncPayableCapital(id);
  // Fatura de cartão: a baixa lança as retiradas dos itens CAPITAL.
  if (updated.cardInvoice) await syncCardInvoiceDerived(id);
  if (updated.purchaseRequestId) await syncPurchaseRequestStatus(updated.purchaseRequestId);
  return updated;
}

export async function markPayablePending(id: string) {
  const updated = await prisma.payable.update({
    where: { id },
    data: { status: "PENDENTE", paymentDate: null, accountId: null },
  });
  await syncPayableCapital(id);
  // Fatura de cartão: o estorno desfaz as retiradas dos itens CAPITAL.
  if (updated.cardInvoice) await syncCardInvoiceDerived(id);
  if (updated.purchaseRequestId) await syncPurchaseRequestStatus(updated.purchaseRequestId);
  return updated;
}

export const markReceivableReceived = (...a: Parameters<typeof receivableReceived>) =>
  timed("baixa: receber título", () => receivableReceived(...a));

async function receivableReceived(id: string, receivedDate: Date, accountId?: string | null) {
  const account = accountId ?? (await getDefaultAccountId());
  const updated = await prisma.receivable.update({
    where: { id },
    data: { status: "RECEBIDO", receivedDate, accountId: account },
  });
  await syncReceivableCapital(id);
  return updated;
}

/**
 * Recebe um título ABATENDO DO CAPITAL de um sócio: o título é baixado no
 * BANCO NEUTRO e nasce uma retirada de capital PAGA no mesmo neutro — o par se
 * anula (nenhum dinheiro real se move), a receita é reconhecida e o capital do
 * sócio diminui, como se ele tivesse sacado o valor e pago em dinheiro. É a
 * rotina de vender um veículo pago com o capital de um sócio (o cliente do
 * contrato pode ser qualquer pessoa — o sócio é só quem paga).
 *
 * A retirada herda o saleId do título: se a venda for cancelada, o
 * cancelamento apaga o par inteiro (recebível + retirada + lançamento de
 * capital) e o neutro segue zerado.
 */
export async function settleReceivableFromCapital(
  receivableId: string,
  beneficiaryId: string,
  date: Date,
) {
  const r = await prisma.receivable.findUniqueOrThrow({
    where: { id: receivableId },
    select: { status: true, amount: true, description: true, saleId: true },
  });
  if (r.status === "RECEBIDO") throw new Error("Este título já foi recebido.");
  const beneficiary = await prisma.capitalBeneficiary.findUniqueOrThrow({
    where: { id: beneficiaryId },
    select: { name: true, active: true },
  });
  if (!beneficiary.active) throw new Error("Sócio (beneficiário do capital) inativo.");

  const [neutralAccountId, capitalCenterId] = await Promise.all([
    getNeutralAccountId(),
    structuralCenterId("CAPITAL"),
  ]);
  // Recebe pelo caminho oficial (sync de capital e compras inclusos)...
  await markReceivableReceived(receivableId, date, neutralAccountId);
  // ...e a contrapartida: retirada do sócio paga no mesmo Banco Neutro.
  const retirada = await prisma.payable.create({
    data: {
      costCenterId: capitalCenterId,
      description: `Abatido do capital — ${beneficiary.name} — ${r.description}`,
      category: "OUTROS",
      amount: r.amount,
      dueDate: date,
      status: "PENDENTE",
      capitalBeneficiaryId: beneficiaryId,
      saleId: r.saleId,
      notes:
        "Título recebido abatendo do capital do sócio (par no Banco Neutro — sem dinheiro em caixa).",
    },
  });
  await markPayablePaid(retirada.id, date, neutralAccountId);
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
  /** Observação de quem recebeu ("pix do irmão", "pagou em espécie"...). */
  note?: string | null,
) {
  const account = accountId ?? (await getDefaultAccountId());
  const r = await prisma.receivable.findUniqueOrThrow({ where: { id } });
  if (r.status === "RECEBIDO") return r;
  const pay = Math.min(Math.max(0, Math.round(amount * 100) / 100), r.amount);
  if (pay <= 0) return r;
  const obs = (note || "").trim() || null;

  // Pagamento integral (ou do valor cheio): baixa o próprio título.
  if (pay >= r.amount) {
    const updated = await prisma.receivable.update({
      where: { id },
      data: {
        status: "RECEBIDO",
        receivedDate,
        accountId: account,
        // A observação SOMA às notas que o título já tinha — não substitui.
        ...(obs ? { notes: [r.notes, obs].filter(Boolean).join(" · ") } : {}),
      },
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
        // A observação é do PAGAMENTO, então fica na parcela recebida.
        notes: obs,
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

/** Rótulo da categoria de despesa do desconto concedido (marca o par no neutro). */
export const DISCOUNT_CATEGORY_LABEL = "Desconto concedido";

/**
 * Recebe um título por MENOS do que o valor cheio e baixa a diferença como
 * DESCONTO CONCEDIDO — o título é quitado por inteiro, sem deixar resto
 * pendente. Caso típico: a entrada da venda estava em 4.152,80, foi acertado
 * depois que a cliente pagaria 3.153,00; os 999,80 viram custo PÓS-VENDA do
 * carro e reduzem o lucro dele. Só vale para título ligado a um veículo.
 *
 * Como fecha o farol: baixar por menos derruba só o lado patrimonial (caixa
 * sobe o recebido, "a receber de vendas" cai o cheio). A DRE não se mexe — a
 * receita da venda já foi reconhecida por competência. Para os dois lados
 * caírem juntos, a diferença precisa virar custo pós-venda PAGO (a DRE só
 * reconhece pós-venda quando pago), sem dinheiro real sair: é o par do BANCO
 * NEUTRO, o mesmo padrão da comissão aplicada no capital, da diferença de
 * retorno e da remuneração do estoque.
 *   - resto do título → RECEBIDO no Banco Neutro (+diff)
 *   - despesa "Desconto concedido" → PAGA no Banco Neutro (−diff)
 * O Banco Neutro volta a zero e as duas pontas nascem na mesma transação (meio
 * par deixaria o Check 1 vermelho).
 */
export async function receiveWithDiscount(input: {
  receivableId: string;
  /** Valor efetivamente recebido na conta real. */
  amount: number;
  date: Date;
  accountId: string;
  notes?: string | null;
}): Promise<{ received: number; discount: number; vehicleId: string | null }> {
  const r = await prisma.receivable.findUniqueOrThrow({
    where: { id: input.receivableId },
    include: { sale: { select: { vehicleId: true } } },
  });
  if (r.status === "RECEBIDO") throw new Error("Título já recebido.");

  const pay = Math.min(Math.max(0, Math.round(input.amount * 100) / 100), r.amount);
  const diff = Math.round((r.amount - pay) * 100) / 100;
  if (diff <= 0.005) {
    // Sem diferença: é uma baixa cheia comum.
    await markReceivableReceived(r.id, input.date, input.accountId);
    return { received: r.amount, discount: 0, vehicleId: null };
  }
  if (pay < 0) throw new Error("Valor recebido inválido.");

  const vehicleId = r.vehicleId ?? r.sale?.vehicleId ?? null;
  // Só título ligado a um carro: aí a diferença tem onde cair (custo pós-venda)
  // e os dois lados do farol descem juntos. Em título solto o resultado
  // dependeria da categoria e poderia desequilibrar — deixa pendente mesmo.
  if (!vehicleId) {
    throw new Error(
      "O desconto só vale para títulos ligados a um veículo (a diferença vira custo pós-venda do carro).",
    );
  }
  const cat = await resolveDespesaCategory(DISCOUNT_CATEGORY_LABEL);
  const [neutralAccountId, adminCenterId] = await Promise.all([
    getNeutralAccountId(),
    // Custo pós-venda mora no Administrativo (o carro não está mais no estoque).
    structuralCenterId("ADMINISTRATIVO"),
  ]);
  const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const breakdown = `Título de ${money(r.amount)} · recebido ${money(pay)} · desconto ${money(diff)}.`;

  const createdIds = await prisma.$transaction(async (tx) => {
    // 1) A parte efetivamente recebida, na conta real (só quando houver).
    let partialId: string | null = null;
    if (pay > 0) {
      const created = await tx.receivable.create({
        data: {
          description: `${r.description} - Pagamento parcial`,
          category: r.category,
          categoryLabel: r.categoryLabel,
          amount: pay,
          dueDate: r.dueDate,
          receivedDate: input.date,
          status: "RECEBIDO",
          customerId: r.customerId,
          saleId: r.saleId,
          vehicleId: r.vehicleId,
          installmentNumber: r.installmentNumber,
          totalInstallments: r.totalInstallments,
          costCenterId: r.costCenterId,
          capitalBeneficiaryId: r.capitalBeneficiaryId,
          accountId: input.accountId,
        },
      });
      partialId = created.id;
    }

    // 2) O que sobrou vira o desconto: baixado no Banco Neutro.
    await tx.receivable.update({
      where: { id: r.id },
      data: {
        description: `${r.description} (desconto concedido)`,
        amount: diff,
        status: "RECEBIDO",
        receivedDate: input.date,
        accountId: neutralAccountId,
        notes: [r.notes, breakdown, input.notes].filter(Boolean).join(" · "),
      },
    });

    // 3) A contrapartida: despesa PAGA no Banco Neutro (o par zera a conta) que,
    //    havendo veículo, entra como custo pós-venda dele.
    const payable = await tx.payable.create({
      data: {
        description: `Desconto concedido — ${r.description}`,
        category: cat.category,
        categoryLabel: cat.label,
        amount: diff,
        dueDate: input.date,
        paymentDate: input.date,
        status: "PAGO",
        accountId: neutralAccountId,
        costCenterId: adminCenterId,
        vehicleId,
        saleId: r.saleId,
        notes: [breakdown, input.notes].filter(Boolean).join(" · "),
      },
    });
    await tx.vehicleCost.create({
      data: {
        vehicleId,
        description: `${cat.label}: ${r.description}`,
        category: "OUTROS",
        amount: diff,
        date: input.date,
        // Sempre pós-venda: o desconto é acertado depois da venda fechada.
        postSale: true,
        payableId: payable.id,
        notes: breakdown,
      },
    });
    return { partialId };
  });

  // Capital (só age se o título tiver sócio): sincroniza as duas pontas.
  if (createdIds.partialId) await syncReceivableCapital(createdIds.partialId);
  await syncReceivableCapital(r.id);

  return { received: pay, discount: diff, vehicleId };
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
 * Resolve um fornecedor pelo nome: reaproveita se já existir ou cadastra um
 * novo. Usado para lançar tarifas com o próprio banco como fornecedor sem
 * precisar cadastrá-lo antes.
 *
 * A comparação ignora acento, maiúscula, pontuação e espaço (`nameKey`) — era
 * a comparação estrita daqui que enchia o cadastro de repetições ("Rogerio
 * venturini" virando um segundo "Rogério Venturini"). Ela SEMPRE reaproveita e
 * nunca recusa: é chamada de todos os caminhos de gravação financeira, e um
 * erro aqui derrubaria um lançamento ou uma importação inteira.
 */
export async function resolveSupplierByName(name: string): Promise<string> {
  const trimmed = name.trim();
  // Caminho rápido: nome idêntico. Resolve a esmagadora maioria com uma consulta.
  const exact = await prisma.supplier.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (exact) return exact.id;
  // Só quando ia criar mesmo: compara pela chave normalizada.
  const key = nameKey(trimmed);
  if (key) {
    const all = await prisma.supplier.findMany({ select: { id: true, name: true } });
    const found = all.find((s) => nameKey(s.name) === key);
    if (found) return found.id;
  }
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
/**
 * Baixa da COMISSÃO DE SEGURO vendido junto ao financiamento.
 *
 * Ao contrário do retorno, nada foi pré-lançado: enquanto pendente, a venda só
 * carrega a marcação `insuranceSold` e não existe recebível, receita nem caixa
 * — é neutro no farol. Toda a contabilização acontece aqui, quando o dinheiro
 * cai e o valor finalmente é conhecido.
 *
 * Por isso é bem mais simples que `settleReturn`: não há valor programado, não
 * há diferença a acertar, não há transferência da financeira nem Banco Neutro.
 * A seguradora/financeira paga direto numa conta da empresa.
 *
 * A comissão do vendedor segue a mesma regra do retorno: aporte no capital
 * quando ele é beneficiário, senão conta a pagar. O `saleId` no título é o que
 * a mantém fora das despesas da DRE (ela entra por competência, ver reports.ts).
 *
 * Farol: caixa +valor e DRE +valor (categoria COMISSAO_SEGURO, somada ao balde
 * dos retornos); a comissão desce os dois lados na mesma medida.
 */
export async function settleInsurance(
  saleId: string,
  accountId: string,
  amount: number,
  commission: number,
  date: Date,
) {
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: saleId },
    include: {
      customer: { select: { name: true } },
      vehicle: { select: { brand: true, model: true, plate: true } },
    },
  });
  if (!sale.insuranceSold) throw new Error("Esta venda não tem seguro marcado.");
  if (sale.insuranceSettledAt) throw new Error("A comissão de seguro desta venda já foi recebida.");
  if (sale.financerAccountId === accountId) {
    throw new Error("Escolha uma conta da empresa (diferente da financeira).");
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const valor = round2(amount);
  if (!Number.isFinite(valor) || valor <= 0) throw new Error("Informe o valor recebido do seguro.");
  const comissao = Math.max(0, round2(commission || 0));
  if (comissao > valor) throw new Error("A comissão não pode ser maior que o valor recebido.");

  const label = `${sale.customer.name} · ${sale.vehicle.brand} ${sale.vehicle.model} (${sale.vehicle.plate})`;
  const adminCenterId = await structuralCenterId("ADMINISTRATIVO");
  // Vendedor beneficiário do capital: a comissão vira aporte, não dinheiro.
  const beneficiary = sale.sellerId
    ? await prisma.capitalBeneficiary.findFirst({ where: { userId: sale.sellerId } })
    : null;

  return prisma.$transaction(async (tx) => {
    await tx.receivable.create({
      data: {
        // Prefixo próprio: os estornos do retorno apagam por texto + placa e
        // engoliriam esta perna se ela dissesse "Retorno financiamento".
        description: `Comissão de seguro — ${label}`,
        category: "COMISSAO_SEGURO",
        amount: valor,
        dueDate: date,
        receivedDate: date,
        status: "RECEBIDO",
        accountId,
        saleId,
        vehicleId: sale.vehicleId,
        customerId: sale.customerId,
        costCenterId: adminCenterId,
      },
    });
    if (comissao > 0 && adminCenterId) {
      if (beneficiary) {
        await tx.capitalTransaction.create({
          data: {
            beneficiaryId: beneficiary.id,
            kind: "APORTE",
            amount: comissao,
            date,
            saleId,
            description: `Aporte — comissão do seguro${sale.sellerName ? ` (${sale.sellerName})` : ""} — ${sale.vehicle.brand} ${sale.vehicle.model} (${sale.vehicle.plate})`,
          },
        });
      } else {
        await tx.payable.create({
          data: {
            description: `Comissão do seguro${sale.sellerName ? ` — ${sale.sellerName}` : ""} — ${sale.vehicle.brand} ${sale.vehicle.model} (${sale.vehicle.plate})`,
            category: "COMISSAO",
            amount: comissao,
            dueDate: date,
            status: "PENDENTE",
            costCenterId: adminCenterId,
            saleId,
            beneficiaryUserId: sale.sellerId || null,
          },
        });
      }
    }
    return tx.sale.update({
      where: { id: saleId },
      data: {
        insuranceAmount: valor,
        insuranceCommissionAmount: comissao,
        insuranceSettledAt: date,
      },
    });
  });
}

/** Desfaz a baixa da comissão de seguro (recebimento e comissão do vendedor). */
export async function reverseInsurance(saleId: string) {
  const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });
  if (!sale.insuranceSettledAt) {
    throw new Error("A comissão de seguro desta venda ainda não foi recebida.");
  }
  return prisma.$transaction(async (tx) => {
    await tx.receivable.deleteMany({ where: { saleId, category: "COMISSAO_SEGURO" } });
    await tx.payable.deleteMany({
      where: { saleId, category: "COMISSAO", description: { startsWith: "Comissão do seguro" } },
    });
    await tx.capitalTransaction.deleteMany({
      where: { saleId, description: { startsWith: "Aporte — comissão do seguro" } },
    });
    return tx.sale.update({
      where: { id: saleId },
      data: { insuranceAmount: null, insuranceCommissionAmount: 0, insuranceSettledAt: null },
    });
  });
}

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
  let vehicleCapitalBenef: string | null = null;
  if (input.vehicleId) {
    const v = await prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { status: true, postSaleCapitalBeneficiaryId: true },
    });
    vehicleSold = v?.status === "VENDIDO";
    // Veículo VENDIDO e ATRELADO ao capital de um sócio: a despesa é do sócio
    // (dono do resultado do carro) — vira RETIRADA do capital dele, não
    // despesa/pós-venda da loja. Vale para QUALQUER origem que crie a despesa
    // (movimento de caixa diário, contas a pagar, conciliação...).
    if (vehicleSold && v?.postSaleCapitalBeneficiaryId && !isVehiclePurchase(input.category)) {
      vehicleCapitalBenef = v.postSaleCapitalBeneficiaryId;
    }
  }
  // Sócio efetivo do capital: o informado explicitamente OU o do veículo atrelado.
  const capitalBeneficiaryId = input.capitalBeneficiaryId || vehicleCapitalBenef;
  const centerId =
    input.costCenterId ||
    (capitalBeneficiaryId
      ? await structuralCenterId("CAPITAL")
      : input.vehicleId
        ? await structuralCenterId(vehicleSold ? "ADMINISTRATIVO" : "VEICULOS")
        : // Sem veículo indicado, "Veículos" vira Administrativo (o gasto é da
          // loja, não de um carro).
          await structuralCenterId(effectiveStructuralKey(input.structuralKey, input.vehicleId)));
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
        capitalBeneficiaryId: capitalBeneficiaryId || null,
        notes: input.notes || null,
        avulso: input.avulso ?? false,
        purchaseRequestId: input.purchaseRequestId || null,
      },
    });
    if (input.vehicleId && !isVehiclePurchase(input.category)) {
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
          // Atrelado ao capital do sócio: marca o custo para ficar FORA da
          // margem do carro e do Lucro/Prejuízo (é custo do sócio, não da loja).
          capitalBeneficiaryId: capitalBeneficiaryId || null,
          notes: input.notes || null,
          payableId: payable.id,
        },
      });
    }
    // Capital (retirada) só se move junto com o dinheiro: cria aqui quando o
    // título já nasce PAGO; se nascer pendente, a retirada é lançada na baixa
    // (markPayablePaid → syncPayableCapital), mantendo o farol consistente.
    if (capitalBeneficiaryId && input.paid) {
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: capitalBeneficiaryId,
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
 * Edita um título a receber MANUAL e ainda não recebido. Só chega aqui o que a
 * action liberou (sem origem em venda/peça/recorrência), então não há nada a
 * ressincronizar além do capital: se o título tiver um sócio, o aporte nasce na
 * baixa já com o valor novo (enquanto pendente, nenhuma movimentação existe).
 */
export async function updateManualReceivable(input: {
  id: string;
  description: string;
  category: CategoriaReceber;
  categoryLabel?: string | null;
  documentNumber?: string | null;
  amount: number;
  dueDate: Date;
  customerId?: string | null;
  capitalBeneficiaryId?: string | null;
  costCenterId?: string | null;
  structuralKey?: StructuralKey;
  notes?: string | null;
}) {
  const centerId =
    input.costCenterId ||
    (input.capitalBeneficiaryId
      ? await structuralCenterId("CAPITAL")
      : await structuralCenterId(effectiveStructuralKey(input.structuralKey, null)));

  const receivable = await prisma.receivable.update({
    where: { id: input.id },
    data: {
      description: input.description,
      category: input.category,
      categoryLabel: input.categoryLabel || null,
      documentNumber: input.documentNumber || null,
      amount: input.amount,
      dueDate: input.dueDate,
      customerId: input.customerId || null,
      capitalBeneficiaryId: input.capitalBeneficiaryId || null,
      costCenterId: centerId,
      notes: input.notes || null,
    },
  });
  await syncReceivableCapital(input.id);
  return receivable;
}

/**
 * Cria de uma vez TODAS as parcelas de um lançamento parcelado (mesmo destino,
 * mesmo fornecedor/categoria — muda só descrição, valor e vencimento).
 *
 * Existe por desempenho: criar parcela a parcela repetia, por título, a busca do
 * centro de custo e do veículo mais uma transação própria — 360 parcelas viravam
 * mais de mil idas ao banco. Aqui o destino é resolvido UMA vez e as parcelas
 * entram num único `createMany` (os custos de veículo, em outro).
 *
 * As parcelas sempre nascem PENDENTES, então não há caixa nem retirada de
 * capital envolvidos (o capital se move na baixa, via `syncPayableCapital`).
 */
export async function createInstallmentPayables(input: {
  parcels: { description: string; amount: number; dueDate: Date }[];
  category: CategoriaPagar;
  categoryLabel?: string | null;
  documentNumber?: string | null;
  supplierId?: string | null;
  vehicleId?: string | null;
  capitalBeneficiaryId?: string | null;
  costCenterId?: string | null;
  structuralKey?: StructuralKey;
  notes?: string | null;
  purchaseRequestId?: string | null;
  /** Ids dos títulos criados, na ordem das parcelas. */
}): Promise<string[]> {
  if (input.parcels.length === 0) return [];

  // Mesma regra de destino de createExpensePayable — resolvida uma única vez.
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
        : await structuralCenterId(effectiveStructuralKey(input.structuralKey, input.vehicleId)));

  const data: Prisma.PayableCreateManyInput[] = input.parcels.map((p) => ({
    description: p.description,
    category: input.category,
    categoryLabel: input.categoryLabel || null,
    documentNumber: input.documentNumber || null,
    amount: p.amount,
    dueDate: p.dueDate,
    status: "PENDENTE",
    costCenterId: centerId,
    supplierId: input.supplierId || null,
    vehicleId: input.vehicleId || null,
    capitalBeneficiaryId: input.capitalBeneficiaryId || null,
    notes: input.notes || null,
    purchaseRequestId: input.purchaseRequestId || null,
  }));

  // A descrição é única dentro do lote ("Parcela i/N"), então serve de chave
  // para casar cada título criado com a sua parcela.
  const byDescription = new Map(input.parcels.map((p) => [p.description, p]));
  const idsInOrder = (created: { id: string; description: string }[]) => {
    const byDesc = new Map(created.map((row) => [row.description, row.id]));
    return input.parcels.map((p) => byDesc.get(p.description)!).filter(Boolean);
  };

  // Sem veículo — ou sendo a própria compra do carro, que não vira custo dele.
  if (!input.vehicleId || isVehiclePurchase(input.category)) {
    const created = await prisma.payable.createManyAndReturn({
      data,
      select: { id: true, description: true },
    });
    return idsInOrder(created);
  }

  // Com veículo, cada parcela também vira custo do carro.
  return prisma.$transaction(async (tx) => {
    const created = await tx.payable.createManyAndReturn({
      data,
      select: { id: true, description: true },
    });
    await tx.vehicleCost.createMany({
      data: created.map((row) => {
        const p = byDescription.get(row.description)!;
        return {
          vehicleId: input.vehicleId!,
          description: input.categoryLabel
            ? `${input.categoryLabel}: ${p.description}`
            : p.description,
          category: "OUTROS" as const,
          amount: p.amount,
          date: p.dueDate,
          postSale: vehicleSold,
          notes: input.notes || null,
          payableId: row.id,
        };
      }),
    });
    return idsInOrder(created);
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
  /** Linha digitável do boleto/fatura (Ordem de Pagamento). */
  barcode?: string | null;
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
      : // Sem veículo indicado, "Veículos" vira Administrativo.
        await structuralCenterId(effectiveStructuralKey(input.structuralKey, input.vehicleId));

  return prisma.$transaction(async (tx) => {
    const payable = await tx.payable.update({
      where: { id: input.id },
      data: {
        description: input.description,
        category: input.category,
        categoryLabel: input.categoryLabel || null,
        documentNumber: input.documentNumber || null,
        // Só mexe quando o chamador informa: outras rotinas (aplicar boleto,
        // ajustes) atualizam o título sem tocar na linha digitável já guardada.
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        amount: input.amount,
        dueDate: input.dueDate,
        supplierId: input.supplierId || null,
        notes: input.notes || null,
        vehicleId: input.vehicleId || null,
        capitalBeneficiaryId: input.capitalBeneficiaryId || null,
        costCenterId: centerId,
      },
    });

    // Sincroniza o custo do veículo com o novo destino. O título da COMPRA do
    // carro fica de fora (o valor já é o preço de compra do veículo) — e se um
    // custo desses já tiver sido criado por engano, ele sai aqui.
    const existing = await tx.vehicleCost.findUnique({ where: { payableId: input.id } });
    if (input.vehicleId && !isVehiclePurchase(input.category)) {
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
        : // Sem veículo indicado, "Veículos" vira Administrativo.
          await structuralCenterId(effectiveStructuralKey(input.structuralKey, input.vehicleId));
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

/**
 * Estorna TODAS as baixas (pagamentos e recebimentos) com data = `workDate` —
 * o "zerar o caixa do dia". Aplica, em lote, a mesma regra do estorno
 * individual (deleteCashEntry):
 *  - lançamento AVULSO → apagado (com a movimentação de capital vinculada);
 *  - TÍTULO baixado comum → volta a PENDENTE (desfaz retirada/aporte de capital,
 *    fatura de cartão e solicitação de compra pelos syncs);
 *  - baixa de origem (venda, peça, recorrência, consórcio, funcionário) → NÃO é
 *    tocada e entra em `pulados`: precisa ser revertida na própria origem
 *    (ex.: cancelar a venda), porque desfazê-la aqui deixaria a origem
 *    inconsistente.
 *
 * Reverte os dois lados juntos (pagáveis e recebíveis do dia), então os pares no
 * Banco Neutro (comissão no capital, título pago com capital) voltam inteiros e
 * o farol continua consistente.
 */
export async function revertCashboxBaixas(workDate: Date): Promise<{
  revertidos: number;
  pulados: number;
  puladosDescricoes: string[];
}> {
  const dayStart = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 0, 0, 0));
  const dayEnd = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 23, 59, 59, 999));
  const range = { gte: dayStart, lte: dayEnd };

  const [receivables, payables] = await Promise.all([
    prisma.receivable.findMany({
      where: { status: "RECEBIDO", receivedDate: range },
      select: { id: true, description: true, avulso: true, saleId: true, partSaleId: true, recurringId: true, installmentNumber: true },
    }),
    prisma.payable.findMany({
      where: { status: "PAGO", paymentDate: range },
      select: { id: true, description: true, avulso: true, vehicleId: true, partId: true, recurringId: true, consortiumId: true, employeeId: true },
    }),
  ]);

  let revertidos = 0;
  let pulados = 0;
  const puladosDescricoes: string[] = [];

  // Recebíveis: avulso apaga; título comum estorna; origem é pulada.
  for (const r of receivables) {
    if (r.saleId || r.partSaleId || r.recurringId || r.installmentNumber != null) {
      pulados++;
      puladosDescricoes.push(r.description);
      continue;
    }
    if (r.avulso) {
      await prisma.$transaction([
        prisma.capitalTransaction.deleteMany({ where: { receivableId: r.id } }),
        prisma.receivable.delete({ where: { id: r.id } }),
      ]);
    } else {
      await markReceivablePending(r.id);
    }
    revertidos++;
  }

  // Pagáveis: mesma regra (origem = veículo/peça/recorrência/consórcio/funcionário).
  for (const p of payables) {
    if (p.vehicleId || p.partId || p.recurringId || p.consortiumId || p.employeeId) {
      pulados++;
      puladosDescricoes.push(p.description);
      continue;
    }
    if (p.avulso) {
      await prisma.$transaction([
        prisma.capitalTransaction.deleteMany({ where: { payableId: p.id } }),
        prisma.payable.delete({ where: { id: p.id } }),
      ]);
    } else {
      await markPayablePending(p.id);
    }
    revertidos++;
  }

  return { revertidos, pulados, puladosDescricoes };
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
      // Conta a receber manual não tem veículo — "Veículos" vira Administrativo.
      costCenterId:
        input.costCenterId ||
        (await structuralCenterId(effectiveStructuralKey(input.structuralKey, null))),
      accountId: defaultAccountId,
      notes: input.notes || null,
    },
  });
}

/**
 * Corrige a DATA DE UMA BAIXA já feita (o dia em que o dinheiro entrou ou saiu),
 * sem desfazer nada.
 *
 * Existe porque a data da baixa nunca é digitada: ela vem da data de trabalho do
 * caixa aberto. Baixar com o caixa no dia errado só se corrigia fechando o
 * caixa, reabrindo na data certa, revertendo e refazendo a baixa — e no caminho
 * se perdia a conta escolhida.
 *
 * O que se move junto é só o que está ligado por chave estrangeira, para o
 * resultado ser previsível: a movimentação de capital gerada pela baixa e, no
 * caso de um título a pagar, o custo do veículo que ele originou. Nada é
 * descoberto por semelhança de data ou de descrição.
 *
 * Vencimento (`dueDate`) NÃO muda: vencer e pagar são coisas diferentes.
 */

/** O que uma correção de data mexeu, para avisar na tela. */
export type DateFixResult = { movedCapital: boolean; movedVehicleCost: boolean };

export async function correctReceivedDate(
  receivableId: string,
  newDate: Date,
): Promise<DateFixResult> {
  const r = await prisma.receivable.findUniqueOrThrow({
    where: { id: receivableId },
    select: { id: true, status: true, receivedDate: true },
  });
  if (r.status !== "RECEBIDO") throw new Error("Só dá para corrigir a data de um título já recebido.");

  return prisma.$transaction(async (tx) => {
    await tx.receivable.update({ where: { id: r.id }, data: { receivedDate: newDate } });
    // A movimentação de capital copia a data da baixa quando é criada
    // (finance.ts, syncReceivableCapital) e nunca é reescrita depois.
    const cap = await tx.capitalTransaction.updateMany({
      where: { receivableId: r.id },
      data: { date: newDate },
    });
    return { movedCapital: cap.count > 0, movedVehicleCost: false };
  });
}

export async function correctPaymentDate(
  payableId: string,
  newDate: Date,
): Promise<DateFixResult> {
  const p = await prisma.payable.findUniqueOrThrow({
    where: { id: payableId },
    select: { id: true, status: true, paymentDate: true },
  });
  if (p.status !== "PAGO") throw new Error("Só dá para corrigir a data de um título já pago.");

  return prisma.$transaction(async (tx) => {
    await tx.payable.update({ where: { id: p.id }, data: { paymentDate: newDate } });
    const cap = await tx.capitalTransaction.updateMany({
      where: { payableId: p.id },
      data: { date: newDate },
    });
    // Custo de veículo gerado por este título (peça, serviço, combustível,
    // desconto concedido): a data do custo tem de acompanhar a do pagamento,
    // senão o Lucro/Prejuízo e a ficha do carro apontam meses diferentes.
    const cost = await tx.vehicleCost.updateMany({
      where: { payableId: p.id },
      data: { date: newDate },
    });
    return { movedCapital: cap.count > 0, movedVehicleCost: cost.count > 0 };
  });
}
