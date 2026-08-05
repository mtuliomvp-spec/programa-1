import { prisma } from "@/lib/prisma";
import type { CategoriaPagar } from "@prisma/client";
import { parseReferrals, sumReferrals } from "@/lib/referrals";

/**
 * Consultas dos relatórios gerenciais: DRE mensal, lucro por veículo,
 * aging de estoque e despesas por categoria.
 *
 * Convenções:
 * - Receitas/custos de venda seguem a data da venda.
 * - Despesas seguem o regime de CAIXA: contam quando pagas (data do pagamento).
 * - Custos de veículos (vehicle_costs) entram no custo do veículo vendido,
 *   nunca em despesas — a conta a pagar gerada por eles é excluída das
 *   despesas para não contar duas vezes.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function monthRange(monthsAgo: number) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo + 1, 1));
  return { start, end };
}

function monthLabel(date: Date) {
  const month = date
    .toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })
    .replace(".", "");
  const year = date.toLocaleDateString("pt-BR", { year: "2-digit", timeZone: "UTC" });
  return `${month}/${year}`;
}

export function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

// ---------------------------------------------------------------------------
// DRE mensal simplificado
// ---------------------------------------------------------------------------

export type DreMonth = {
  label: string;
  receitaVeiculos: number;
  receitaPecas: number;
  receitaTotal: number;
  custoVeiculos: number;
  custoPecas: number;
  custoTotal: number;
  lucroBruto: number;
  despesas: number;
  comissoes: number;
  transferencias: number;
  retornos: number;
  outrasReceitas: number;
  fechamentos: number;
  lucroLiquido: number;
  veiculosVendidos: number;
};

export async function getMonthlyDre(months = 12): Promise<DreMonth[]> {
  const { start: rangeStart } = monthRange(months - 1);
  const { end: rangeEnd } = monthRange(0);

  // Capital não é resultado: exclui RETIRADA das despesas e APORTE das receitas.
  const capitalTx = await prisma.capitalTransaction.findMany({
    select: { payableId: true, receivableId: true, kind: true },
  });
  const retiradaPayableIds = capitalTx
    .filter((t) => t.kind === "RETIRADA" && t.payableId)
    .map((t) => t.payableId as string);
  const aporteReceivableIds = capitalTx
    .filter((t) => t.kind === "APORTE" && t.receivableId)
    .map((t) => t.receivableId as string);

  const [sales, partSales, expenses, retornoRecs, outrasRecs] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "CONCLUIDA", saleDate: { gte: rangeStart, lt: rangeEnd } },
      include: { vehicle: { include: { costs: true } } },
    }),
    prisma.partSale.findMany({
      where: { saleDate: { gte: rangeStart, lt: rangeEnd } },
      include: { part: { select: { costPrice: true } } },
    }),
    // Despesas: regime de CAIXA — só as PAGAS, na data do pagamento. A comissão
    // de venda (saleId) fica de fora: entra por competência, na data da venda.
    prisma.payable.findMany({
      where: {
        status: "PAGO",
        paymentDate: { gte: rangeStart, lt: rangeEnd },
        category: { in: ["DESPESA_OPERACIONAL", "COMISSAO", "SALARIO", "COMBUSTIVEL", "OUTROS"] },
        vehicleCost: null, // custos de veículo já entram no custo da venda
        vehicleId: null, // idem para contas manuais ligadas a veículos
        saleId: null, // comissão de venda entra por competência (abaixo)
        id: { notIn: retiradaPayableIds }, // retirada de capital não é despesa
      },
      select: { id: true, amount: true, paymentDate: true, category: true },
    }),
    // Retorno da financeira recebido no período (regime de caixa).
    prisma.receivable.findMany({
      where: {
        category: "RETORNO_FINANCEIRA",
        status: "RECEBIDO",
        receivedDate: { gte: rangeStart, lt: rangeEnd },
      },
      select: { amount: true, receivedDate: true },
    }),
    // Outras receitas avulsas (RECEBIDO sem venda/peça/sinal/aporte).
    prisma.receivable.findMany({
      where: {
        status: "RECEBIDO",
        category: "OUTROS",
        saleId: null,
        partSaleId: null,
        vehicleId: null,
        receivedDate: { gte: rangeStart, lt: rangeEnd },
        id: { notIn: aporteReceivableIds },
      },
      select: { amount: true, receivedDate: true },
    }),
  ]);

  // Fatura de cartão: a parte dos lançamentos que virou custo de veículo ou
  // retirada de capital NÃO é despesa (o custo entra na margem do carro e o
  // capital não é resultado) — desconta do valor do título nas despesas.
  const cardSplits = await prisma.cardInvoiceItem.findMany({
    where: {
      payable: { status: "PAGO", paymentDate: { gte: rangeStart, lt: rangeEnd } },
      OR: [
        { structuralKey: "VEICULOS", vehicleId: { not: null } },
        { structuralKey: "CAPITAL", capitalBeneficiaryId: { not: null } },
      ],
    },
    select: { payableId: true, amount: true },
  });
  const cardNonExpense = new Map<string, number>();
  for (const it of cardSplits) {
    cardNonExpense.set(it.payableId, (cardNonExpense.get(it.payableId) ?? 0) + it.amount);
  }

  // Fechamentos mensais: o resultado do mês fechado migrou para o capital, então
  // a DRE do mês fechado desconta o valor transferido (fica ~zero).
  const allClosings = await prisma.monthlyClosing.findMany({
    select: { year: true, month: true, result: true },
  });

  const result: DreMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const { start, end } = monthRange(i);
    const monthSales = sales.filter((s) => s.saleDate >= start && s.saleDate < end);
    const monthPartSales = partSales.filter((p) => p.saleDate >= start && p.saleDate < end);
    const monthExpenses = expenses.filter((e) => e.paymentDate! >= start && e.paymentDate! < end);
    const retornos = retornoRecs
      .filter((r) => r.receivedDate! >= start && r.receivedDate! < end)
      .reduce((sum, r) => sum + r.amount, 0);
    const outrasReceitas = outrasRecs
      .filter((r) => r.receivedDate! >= start && r.receivedDate! < end)
      .reduce((sum, r) => sum + r.amount, 0);

    const receitaVeiculos = monthSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const receitaPecas = monthPartSales.reduce((sum, p) => sum + p.totalAmount, 0);
    const custoVeiculos = monthSales.reduce(
      (sum, s) =>
        sum +
        s.vehicle.purchasePrice +
        s.vehicle.costs.reduce((cs, c) => cs + c.amount, 0) +
        // Consignado: o valor devolvido ao proprietário é custo da venda (o carro
        // não é patrimônio comprado, então purchasePrice é 0). Reconhecido por
        // competência aqui — o destino (conta a pagar ou aporte) não muda o custo.
        (s.ownerRefundAmount || 0),
      0,
    );
    const custoPecas = monthPartSales.reduce(
      (sum, p) => sum + p.quantity * p.part.costPrice,
      0,
    );
    // Comissão de venda + indicações de venda por competência (na data da
    // venda) + comissões manuais pagas (sem venda vinculada) no mês.
    const comissoes =
      monthSales.reduce(
        (sum, s) => sum + (s.commissionAmount || 0) + sumReferrals(s.referrals) + (s.returnCommissionAmount || 0),
        0,
      ) +
      monthExpenses.filter((e) => e.category === "COMISSAO").reduce((sum, e) => sum + e.amount, 0);
    const despesas = monthExpenses
      .filter((e) => e.category !== "COMISSAO")
      .reduce((sum, e) => sum + e.amount - (cardNonExpense.get(e.id) ?? 0), 0);
    // Transferência (DETRAN) cobrada por competência no mês.
    const transferencias = monthSales.reduce(
      (sum, s) => sum + (s.transferCharged ? s.transferAmount : 0),
      0,
    );
    const fechamentos =
      allClosings.find(
        (c) => c.year === start.getUTCFullYear() && c.month === start.getUTCMonth() + 1,
      )?.result ?? 0;

    const receitaTotal = receitaVeiculos + receitaPecas;
    const custoTotal = custoVeiculos + custoPecas;
    const lucroBruto = receitaTotal - custoTotal;

    result.push({
      label: monthLabel(start),
      receitaVeiculos,
      receitaPecas,
      receitaTotal,
      custoVeiculos,
      custoPecas,
      custoTotal,
      lucroBruto,
      despesas,
      comissoes,
      transferencias,
      retornos,
      outrasReceitas,
      fechamentos,
      lucroLiquido:
        lucroBruto - despesas - comissoes - transferencias - fechamentos + retornos + outrasReceitas,
      veiculosVendidos: monthSales.length,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extrato de Lucro / Prejuízo
// Lista os lançamentos que compõem o resultado. Para veículos e peças, só o
// VALOR QUE GEROU LUCRO/PREJUÍZO (a margem = venda − custo) entra no extrato,
// nunca o valor cheio da venda. Despesas e comissões entram pelo valor total
// (com sinal negativo). A soma das linhas é o lucro/prejuízo do período.
// ---------------------------------------------------------------------------

export type PLEntryKind =
  | "VEICULO"
  | "PECA"
  | "DESPESA"
  | "COMISSAO"
  | "POS_VENDA"
  | "RETORNO"
  | "RECEITA"
  | "FECHAMENTO";

export type PLEntry = {
  id: string;
  date: Date;
  kind: PLEntryKind;
  description: string;
  detail: string | null;
  value: number; // contribuição ao resultado (+ lucro / − prejuízo)
};

export type PLStatement = {
  entries: PLEntry[];
  receitaTotal: number;
  custoTotal: number;
  lucroBruto: number;
  despesas: number;
  comissoes: number;
  posVenda: number;
  retornos: number;
  outrasReceitas: number;
  transferencias: number;
  fechamentos: number;
  lucroLiquido: number;
  veiculosVendidos: number;
};

export async function getProfitLossStatement(
  months = 12,
  opts?: { start?: Date; end?: Date; excludeFechamento?: boolean },
): Promise<PLStatement> {
  // Janela opcional (start/end) para telas que mostram um período específico
  // (período aberto ou um mês fechado). Sem opts = comportamento padrão de antes.
  const rangeStart = opts?.start ?? monthRange(months - 1).start;
  const rangeEnd = opts?.end ?? monthRange(0).end;

  // Movimentações de capital não entram no resultado: o APORTE (recebível) não é
  // receita e a RETIRADA (a pagar) não é despesa — elas mexem no capital, não no
  // lucro. O PRÓ-LABORE é despesa real e continua contando.
  const capitalTx = await prisma.capitalTransaction.findMany({
    select: { payableId: true, receivableId: true, kind: true },
  });
  const retiradaPayableIds = capitalTx
    .filter((t) => t.kind === "RETIRADA" && t.payableId)
    .map((t) => t.payableId as string);
  const aporteReceivableIds = capitalTx
    .filter((t) => t.kind === "APORTE" && t.receivableId)
    .map((t) => t.receivableId as string);

  const [sales, partSales, expenses, postSaleCosts, outrasRecs] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "CONCLUIDA", saleDate: { gte: rangeStart, lt: rangeEnd } },
      include: { vehicle: { include: { costs: true } } },
    }),
    prisma.partSale.findMany({
      where: { saleDate: { gte: rangeStart, lt: rangeEnd } },
      include: { part: { select: { name: true, costPrice: true } } },
    }),
    // Despesas: regime de CAIXA — só contam quando PAGAS, na data do pagamento.
    // A comissão de venda (saleId != null) fica de fora: ela é reconhecida por
    // COMPETÊNCIA na própria venda (abaixo), como custo direto daquela venda.
    prisma.payable.findMany({
      where: {
        status: "PAGO",
        paymentDate: { gte: rangeStart, lt: rangeEnd },
        category: { in: ["DESPESA_OPERACIONAL", "COMISSAO", "SALARIO", "COMBUSTIVEL", "OUTROS"] },
        vehicleCost: null,
        vehicleId: null,
        saleId: null,
        id: { notIn: retiradaPayableIds },
      },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        category: true,
        description: true,
        categoryLabel: true,
        cardInvoice: true,
        supplier: { select: { name: true } },
      },
    }),
    // Custos pós-venda: também só quando o pagamento é efetuado (título próprio
    // ou fatura de cartão que contém o lançamento).
    prisma.vehicleCost.findMany({
      where: {
        postSale: true,
        OR: [
          { payable: { status: "PAGO", paymentDate: { gte: rangeStart, lt: rangeEnd } } },
          { cardItem: { payable: { status: "PAGO", paymentDate: { gte: rangeStart, lt: rangeEnd } } } },
        ],
      },
      include: {
        vehicle: { select: { brand: true, model: true, plate: true } },
        payable: { select: { paymentDate: true } },
        cardItem: { select: { payable: { select: { paymentDate: true } } } },
      },
    }),
    // Outras receitas avulsas: dinheiro que entrou (RECEBIDO) sem ser venda,
    // peça, sinal (veículo) nem aporte de capital. É receita e conta no lucro.
    prisma.receivable.findMany({
      where: {
        status: "RECEBIDO",
        category: "OUTROS",
        saleId: null,
        partSaleId: null,
        vehicleId: null,
        receivedDate: { gte: rangeStart, lt: rangeEnd },
        id: { notIn: aporteReceivableIds },
      },
      select: { id: true, amount: true, receivedDate: true, description: true },
    }),
  ]);

  // Retorno da financeira: receita recebida no período (comissão de
  // financiamento). Só o RECEBIDO conta (regime de caixa).
  const retornoRecs = await prisma.receivable.findMany({
    where: {
      category: "RETORNO_FINANCEIRA",
      status: "RECEBIDO",
      receivedDate: { gte: rangeStart, lt: rangeEnd },
    },
    include: { sale: { include: { vehicle: { select: { brand: true, model: true, plate: true } } } } },
  });

  // Fatura de cartão: parte dos lançamentos vira custo de veículo (margem) ou
  // retirada de capital — essa parte sai das despesas para não contar 2x.
  const cardSplits = await prisma.cardInvoiceItem.findMany({
    where: {
      payable: { status: "PAGO", paymentDate: { gte: rangeStart, lt: rangeEnd } },
      OR: [
        { structuralKey: "VEICULOS", vehicleId: { not: null } },
        { structuralKey: "CAPITAL", capitalBeneficiaryId: { not: null } },
      ],
    },
    select: { payableId: true, amount: true },
  });
  const cardNonExpense = new Map<string, number>();
  for (const it of cardSplits) {
    cardNonExpense.set(it.payableId, (cardNonExpense.get(it.payableId) ?? 0) + it.amount);
  }

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const entries: PLEntry[] = [];
  let receitaVeiculos = 0, custoVeiculos = 0, receitaPecas = 0, custoPecas = 0;
  let despesas = 0, comissoes = 0, posVenda = 0, retornos = 0, outrasReceitas = 0, transferencias = 0;

  for (const s of sales) {
    // A margem da venda usa só os custos ATÉ a venda; pós-venda entra à parte.
    // Consignado: o valor devolvido ao proprietário é custo da venda (o carro
    // não é patrimônio comprado) — reconhecido por competência na margem.
    const custo =
      s.vehicle.purchasePrice +
      s.vehicle.costs.filter((x) => !x.postSale).reduce((c, x) => c + x.amount, 0) +
      (s.ownerRefundAmount || 0);
    const margem = s.totalAmount - custo;
    receitaVeiculos += s.totalAmount;
    custoVeiculos += custo;
    const isIntermediacao = s.saleType === "FINANCIAMENTO_TERCEIROS";
    entries.push({
      id: `v-${s.id}`,
      date: s.saleDate,
      kind: "VEICULO",
      description: isIntermediacao
        ? `Financiamento de terceiros — ${s.vehicle.brand} ${s.vehicle.model} · ${s.vehicle.plate}`
        : s.consigned
          ? `Venda (consignado) ${s.vehicle.brand} ${s.vehicle.model} · ${s.vehicle.plate}`
          : `Venda ${s.vehicle.brand} ${s.vehicle.model} · ${s.vehicle.plate}`,
      detail: isIntermediacao
        ? `lucro bruto: financiamento ${fmt(s.financingAmount)} − devolução ${fmt(s.refundAmount)} (comissões e demais despesas saem em linhas próprias)`
        : s.consigned
          ? `lucro bruto: venda ${fmt(s.totalAmount)} − devolução ao proprietário ${fmt(s.ownerRefundAmount)}${s.vehicle.costs.some((x) => !x.postSale) ? " − custos" : ""} (comissões e demais despesas da venda saem em linhas próprias)`
          : `lucro bruto: venda ${fmt(s.totalAmount)} − custo ${fmt(custo)} (comissões e demais despesas da venda saem em linhas próprias)`,
      value: margem,
    });
    // Comissão do vendedor: custo direto da venda, reconhecido por competência
    // (na data da venda), independente de já ter sido paga. Casa com a conta a
    // pagar da comissão subtraída na equação patrimonial.
    if (s.commissionAmount > 0) {
      comissoes += s.commissionAmount;
      entries.push({
        id: `com-${s.id}`,
        date: s.saleDate,
        kind: "COMISSAO",
        description: `Comissão de venda${s.sellerName ? ` — ${s.sellerName}` : ""}`,
        detail: `${s.vehicle.brand} ${s.vehicle.model} · ${s.vehicle.plate}`,
        value: -s.commissionAmount,
      });
    }
    // Indicações de venda: mesma competência da comissão do vendedor, casando
    // com as contas a pagar (Comissão) criadas no registro da venda.
    for (const [i, ref] of parseReferrals(s.referrals).entries()) {
      if (ref.amount <= 0) continue;
      comissoes += ref.amount;
      entries.push({
        id: `ind-${s.id}-${i}`,
        date: s.saleDate,
        kind: "COMISSAO",
        description: `Comissão de indicação${ref.name ? ` — ${ref.name}` : ""}`,
        detail: `${s.vehicle.brand} ${s.vehicle.model} · ${s.vehicle.plate}`,
        value: -ref.amount,
      });
    }

    // Transferência (DETRAN) cobrada: custo da venda, reconhecido por competência
    // (casa com a conta a pagar criada no registro da venda). Reduz o resultado.
    if (s.transferCharged && s.transferAmount > 0) {
      transferencias += s.transferAmount;
      entries.push({
        id: `transf-${s.id}`,
        date: s.saleDate,
        kind: "DESPESA",
        description: "Transferência DETRAN",
        detail: `${s.vehicle.brand} ${s.vehicle.model} · ${s.vehicle.plate}`,
        value: -s.transferAmount,
      });
    }

    // Comissão do vendedor sobre o retorno da financeira: custo por competência,
    // casando com a conta a pagar (Comissão) criada no registro da venda.
    if (s.returnCommissionAmount > 0) {
      comissoes += s.returnCommissionAmount;
      entries.push({
        id: `retcom-${s.id}`,
        date: s.saleDate,
        kind: "COMISSAO",
        description: `Comissão do retorno${s.sellerName ? ` — ${s.sellerName}` : ""}`,
        detail: `${s.vehicle.brand} ${s.vehicle.model} · ${s.vehicle.plate}`,
        value: -s.returnCommissionAmount,
      });
    }
  }

  for (const p of partSales) {
    const custo = p.quantity * p.part.costPrice;
    const margem = p.totalAmount - custo;
    receitaPecas += p.totalAmount;
    custoPecas += custo;
    entries.push({
      id: `p-${p.id}`,
      date: p.saleDate,
      kind: "PECA",
      description: `Venda de peça: ${p.part.name}${p.quantity > 1 ? ` (${p.quantity}x)` : ""}`,
      detail: `venda ${fmt(p.totalAmount)} − custo ${fmt(custo)}`,
      value: margem,
    });
  }

  for (const e of expenses) {
    const isComissao = e.category === "COMISSAO";
    // Fatura de cartão: só a parte "despesa" entra no resultado (o que virou
    // custo de veículo entra na margem do carro; capital não é resultado).
    const nonExpense = cardNonExpense.get(e.id) ?? 0;
    const expenseValue = Math.max(0, Math.round((e.amount - nonExpense) * 100) / 100);
    if (e.cardInvoice && expenseValue <= 0.004) continue; // fatura 100% veículos/capital
    if (isComissao) comissoes += expenseValue;
    else despesas += expenseValue;
    // O texto digitado pelo usuário é o principal; a categoria (e o
    // fornecedor, se houver) vai no detalhe — "Outros" sozinho não diz nada.
    const detailParts = [
      e.categoryLabel && e.categoryLabel !== e.description ? e.categoryLabel : null,
      e.supplier?.name ?? null,
      nonExpense > 0.004
        ? `fatura ${fmt(e.amount)} − ${fmt(nonExpense)} em custos de veículos/capital (entram em linhas próprias)`
        : null,
    ].filter(Boolean);
    entries.push({
      id: `e-${e.id}`,
      date: e.paymentDate!,
      kind: isComissao ? "COMISSAO" : "DESPESA",
      description: e.description || e.categoryLabel || "Despesa",
      detail: detailParts.length ? detailParts.join(" · ") : null,
      value: -expenseValue,
    });
  }

  for (const c of postSaleCosts) {
    posVenda += c.amount;
    entries.push({
      id: `pv-${c.id}`,
      date: c.payable?.paymentDate ?? c.cardItem?.payable?.paymentDate ?? c.date,
      kind: "POS_VENDA",
      description: `Pós-venda: ${c.description}`,
      detail: `${c.vehicle.brand} ${c.vehicle.model} · ${c.vehicle.plate}`,
      value: -c.amount,
    });
  }

  for (const r of retornoRecs) {
    retornos += r.amount;
    entries.push({
      id: `ret-${r.id}`,
      date: r.receivedDate!,
      kind: "RETORNO",
      description: r.description,
      detail: r.sale?.vehicle
        ? `${r.sale.vehicle.brand} ${r.sale.vehicle.model} · ${r.sale.vehicle.plate}`
        : null,
      value: r.amount,
    });
  }

  for (const r of outrasRecs) {
    outrasReceitas += r.amount;
    entries.push({
      id: `or-${r.id}`,
      date: r.receivedDate!,
      kind: "RECEITA",
      description: r.description,
      detail: null,
      value: r.amount,
    });
  }

  // Fechamentos mensais: o resultado do mês fechado foi transferido para o
  // capital da empresa — entra aqui como −resultado (o mês fechado zera no
  // extrato, casando com o aporte/retirada de capital na equação patrimonial).
  // Na visão de um mês fechado, mostramos o resultado REAL do mês (sem a linha
  // de fechamento que zeraria o período).
  let fechamentos = 0;
  const closings = opts?.excludeFechamento
    ? []
    : await prisma.monthlyClosing.findMany({
        select: { id: true, year: true, month: true, result: true },
      });
  for (const c of closings) {
    const closeDate = new Date(Date.UTC(c.year, c.month, 0, 12));
    if (closeDate < rangeStart || closeDate >= rangeEnd) continue;
    if (Math.abs(c.result) < 0.005) continue;
    fechamentos += c.result;
    entries.push({
      id: `fech-${c.id}`,
      date: closeDate,
      kind: "FECHAMENTO",
      description: `Fechamento mensal ${String(c.month).padStart(2, "0")}/${c.year} — ${c.result >= 0 ? "lucro" : "prejuízo"} transferido ao capital da empresa`,
      detail: null,
      value: -c.result,
    });
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());

  const receitaTotal = receitaVeiculos + receitaPecas;
  const custoTotal = custoVeiculos + custoPecas;
  const lucroBruto = receitaTotal - custoTotal;
  return {
    entries,
    receitaTotal,
    custoTotal,
    lucroBruto,
    despesas,
    comissoes,
    posVenda,
    retornos,
    outrasReceitas,
    transferencias,
    fechamentos,
    lucroLiquido:
      lucroBruto - despesas - comissoes - posVenda - transferencias - fechamentos + retornos + outrasReceitas,
    veiculosVendidos: sales.length,
  };
}

// ---------------------------------------------------------------------------
// Lucro por veículo vendido
// ---------------------------------------------------------------------------

export type VehicleProfitRow = {
  saleId: string;
  vehicleId: string;
  vehicleLabel: string;
  plate: string;
  saleDate: Date;
  purchasePrice: number;
  extraCosts: number;
  totalCost: number;
  saleAmount: number;
  /** Lucro bruto: venda − (compra + custos do veículo). */
  profit: number;
  /** Despesas da venda: comissão do vendedor, indicações e transferência DETRAN (NÃO inclui a comissão do retorno). */
  saleExpenses: number;
  /** Retorno da financeira recebido, líquido do imposto. */
  returnAmount: number;
  /** Comissão do vendedor sobre o retorno (despesa do retorno). */
  returnCommission: number;
  /** Lucro do retorno: retorno recebido − comissão do retorno. */
  returnNetProfit: number;
  /** Lucro líquido total: (bruto − despesas da venda) + lucro do retorno. */
  netProfit: number;
  /** Venda originada de anúncio de tráfego pago (informativo). */
  viaPaidTraffic: boolean;
  /** Operação de financiamento de terceiros (intermediação), não venda de estoque. */
  isIntermediation: boolean;
  marginPct: number;
  daysInStock: number;
};

export async function getVehicleProfitReport(): Promise<VehicleProfitRow[]> {
  // Inclui vendas próprias e financiamento de terceiros (intermediação). Na
  // intermediação o veículo tem custo 0 e a "venda" é a sobra do financiamento
  // (F − devolução); as linhas ficam sinalizadas para não confundir com estoque.
  const sales = await prisma.sale.findMany({
    where: { status: "CONCLUIDA" },
    include: { vehicle: { include: { costs: true } } },
    orderBy: { saleDate: "desc" },
  });

  return sales.map((s) => {
    const extraCosts = s.vehicle.costs.reduce((sum, c) => sum + c.amount, 0);
    // Consignado: a devolução ao proprietário é custo da venda (o carro não é
    // patrimônio comprado, então purchasePrice é 0).
    const totalCost = s.vehicle.purchasePrice + extraCosts + (s.ownerRefundAmount || 0);
    const profit = s.totalAmount - totalCost;
    // Despesas da VENDA (saem do lucro da venda): comissão do vendedor,
    // indicações e transferência DETRAN. A comissão do retorno NÃO entra aqui —
    // ela é despesa do RETORNO e sai do lucro do retorno (abaixo).
    const saleExpenses =
      s.commissionAmount +
      parseReferrals(s.referrals).reduce((sum, r) => sum + r.amount, 0) +
      (s.transferCharged ? s.transferAmount : 0);
    // Retorno da financeira recebido, líquido do imposto (o já pago, se
    // liquidado, senão o programado).
    const returnAmount = s.returnPaidAmount ?? s.returnNet;
    // Lucro do retorno = retorno recebido − comissão do vendedor sobre o retorno.
    const returnCommission = s.returnCommissionAmount;
    const returnNetProfit = returnAmount - returnCommission;
    // Lucro líquido total: lucro da venda + lucro do retorno (mesmo total de
    // antes — só muda a atribuição entre venda e retorno).
    const netProfit = profit - saleExpenses + returnNetProfit;
    return {
      saleId: s.id,
      vehicleId: s.vehicleId,
      vehicleLabel: `${s.vehicle.brand} ${s.vehicle.model}`,
      plate: s.vehicle.plate,
      saleDate: s.saleDate,
      purchasePrice: s.vehicle.purchasePrice,
      extraCosts,
      totalCost,
      saleAmount: s.totalAmount,
      profit,
      saleExpenses,
      returnAmount,
      returnCommission,
      returnNetProfit,
      netProfit,
      viaPaidTraffic: s.viaPaidTraffic,
      isIntermediation: s.saleType === "FINANCIAMENTO_TERCEIROS",
      marginPct: s.totalAmount > 0 ? (netProfit / s.totalAmount) * 100 : 0,
      daysInStock: daysBetween(s.vehicle.entryDate, s.saleDate),
    };
  });
}

// ---------------------------------------------------------------------------
// Tráfego pago (card informativo do dashboard)
// ---------------------------------------------------------------------------

export type PaidTrafficStats = {
  /** Total pago em títulos de tráfego pago (categoria "Tráfego pago"). */
  spend: number;
  /** Lucro líquido somado das vendas marcadas como "via tráfego pago". */
  recovered: number;
  /** recovered − spend: negativo enquanto o investimento não se pagou. */
  balance: number;
  salesCount: number;
};

/** "Tráfego Pago", "trafego pago", "Tráfego (Meta)"... contam do mesmo jeito. */
function isPaidTrafficLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const norm = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return norm.includes("trafego");
}

/**
 * Card "Tráfego pago": investimento em anúncios (títulos PAGOS com categoria
 * de tráfego) contra o lucro líquido das vendas marcadas como originadas do
 * tráfego. Puramente informativo — não altera DRE nem equação patrimonial.
 */
export async function getPaidTrafficStats(): Promise<PaidTrafficStats> {
  const [paid, rows] = await Promise.all([
    prisma.payable.findMany({
      where: { status: "PAGO" },
      select: { amount: true, categoryLabel: true },
    }),
    getVehicleProfitReport(),
  ]);
  const spend = paid
    .filter((p) => isPaidTrafficLabel(p.categoryLabel))
    .reduce((sum, p) => sum + p.amount, 0);
  const trafficSales = rows.filter((r) => r.viaPaidTraffic);
  const recovered = trafficSales.reduce((sum, r) => sum + r.netProfit, 0);
  return {
    spend,
    recovered,
    balance: Math.round((recovered - spend) * 100) / 100,
    salesCount: trafficSales.length,
  };
}

// ---------------------------------------------------------------------------
// Aging do estoque (tempo parado)
// ---------------------------------------------------------------------------

export type AgingBucket = {
  label: string;
  minDays: number;
  count: number;
  invested: number;
  saleValue: number;
};

export type AgingVehicleRow = {
  id: string;
  vehicleLabel: string;
  plate: string;
  entryDate: Date;
  daysInStock: number;
  invested: number;
  salePrice: number;
  status: "ESTOQUE" | "RESERVADO";
};

export async function getStockAging(): Promise<{
  buckets: AgingBucket[];
  vehicles: AgingVehicleRow[];
}> {
  const now = new Date();
  const inStock = await prisma.vehicle.findMany({
    where: { status: { in: ["ESTOQUE", "RESERVADO"] }, intermediation: false },
    include: { costs: true },
    orderBy: { entryDate: "asc" },
  });

  const vehicles: AgingVehicleRow[] = inStock.map((v) => ({
    id: v.id,
    vehicleLabel: `${v.brand} ${v.model}`,
    plate: v.plate,
    entryDate: v.entryDate,
    daysInStock: daysBetween(v.entryDate, now),
    invested: v.purchasePrice + v.costs.reduce((sum, c) => sum + c.amount, 0),
    salePrice: v.salePrice,
    status: v.status as "ESTOQUE" | "RESERVADO",
  }));

  const bucketDefs = [
    { label: "0 a 30 dias", min: 0, max: 30 },
    { label: "31 a 60 dias", min: 31, max: 60 },
    { label: "61 a 90 dias", min: 61, max: 90 },
    { label: "Mais de 90 dias", min: 91, max: Infinity },
  ];

  const buckets: AgingBucket[] = bucketDefs.map((b) => {
    const items = vehicles.filter((v) => v.daysInStock >= b.min && v.daysInStock <= b.max);
    return {
      label: b.label,
      minDays: b.min,
      count: items.length,
      invested: items.reduce((sum, v) => sum + v.invested, 0),
      saleValue: items.reduce((sum, v) => sum + v.salePrice, 0),
    };
  });

  return { buckets, vehicles };
}

// ---------------------------------------------------------------------------
// Despesas por categoria
// ---------------------------------------------------------------------------

export const PAYABLE_CATEGORY_LABEL: Record<CategoriaPagar, string> = {
  COMPRA_VEICULO: "Compra de veículos",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesas operacionais",
  COMISSAO: "Comissões",
  SALARIO: "Salários",
  COMBUSTIVEL: "Combustíveis",
  DEVOLUCAO_CLIENTE: "Devolução ao cliente",
  DEVOLUCAO_PROPRIETARIO: "Devolução ao proprietário",
  OUTROS: "Outros",
};

export type ExpenseCategoryRow = {
  category: CategoriaPagar;
  label: string;
  total: number;
  paid: number;
  pending: number;
  count: number;
};

export async function getExpensesByCategory(months = 12): Promise<{
  rows: ExpenseCategoryRow[];
  total: number;
  from: Date;
}> {
  const { start } = monthRange(months - 1);
  const payables = await prisma.payable.findMany({
    where: { dueDate: { gte: start } },
    select: { category: true, amount: true, status: true },
  });

  const categories = Object.keys(PAYABLE_CATEGORY_LABEL) as CategoriaPagar[];
  const rows: ExpenseCategoryRow[] = categories
    .map((category) => {
      const items = payables.filter((p) => p.category === category);
      const paid = items
        .filter((p) => p.status === "PAGO")
        .reduce((sum, p) => sum + p.amount, 0);
      const total = items.reduce((sum, p) => sum + p.amount, 0);
      return {
        category,
        label: PAYABLE_CATEGORY_LABEL[category],
        total,
        paid,
        pending: total - paid,
        count: items.length,
      };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.total - a.total);

  return {
    rows,
    total: rows.reduce((sum, r) => sum + r.total, 0),
    from: start,
  };
}

// ---------------------------------------------------------------------------
// Indicadores extras do dashboard
// ---------------------------------------------------------------------------

export async function getPerformanceStats() {
  const { start: monthStart, end: monthEnd } = monthRange(0);
  const now = new Date();

  const [monthSales, inStock] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "CONCLUIDA", saleDate: { gte: monthStart, lt: monthEnd } },
      include: { vehicle: { include: { costs: true } } },
    }),
    prisma.vehicle.findMany({
      where: { status: { in: ["ESTOQUE", "RESERVADO"] }, intermediation: false },
      include: { costs: true },
    }),
  ]);

  const profitThisMonth = monthSales.reduce((sum, s) => {
    const cost =
      s.vehicle.purchasePrice +
      s.vehicle.costs.reduce((cs, c) => cs + c.amount, 0) +
      // Consignado: devolução ao proprietário é custo da venda.
      (s.ownerRefundAmount || 0);
    return sum + (s.totalAmount - cost);
  }, 0);

  const avgTicket =
    monthSales.length > 0
      ? monthSales.reduce((sum, s) => sum + s.totalAmount, 0) / monthSales.length
      : 0;

  const investedInStock = inStock.reduce(
    (sum, v) => sum + v.purchasePrice + v.costs.reduce((cs, c) => cs + c.amount, 0),
    0,
  );

  const avgDaysInStock =
    inStock.length > 0
      ? Math.round(
          inStock.reduce((sum, v) => sum + daysBetween(v.entryDate, now), 0) /
            inStock.length,
        )
      : 0;

  return { profitThisMonth, avgTicket, investedInStock, avgDaysInStock };
}
