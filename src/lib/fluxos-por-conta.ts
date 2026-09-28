import "server-only";
import { prisma } from "@/lib/prisma";
import { effectiveStructuralKey, type StructuralKey } from "@/lib/structural-flows";

const round2 = (n: number) => Math.round(n * 100) / 100;

const PAGAR_LABEL: Record<string, string> = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  DEVOLUCAO_CLIENTE: "Devolução ao cliente",
  DEVOLUCAO_PROPRIETARIO: "Devolução ao proprietário",
  OUTROS: "Outros",
};
const RECEBER_LABEL: Record<string, string> = {
  VENDA_VEICULO: "Venda de veículo",
  VENDA_PECA: "Venda de peça",
  RETORNO_FINANCEIRA: "Retorno financeira",
  COMISSAO_SEGURO: "Comissão de seguro",
  OUTROS: "Outros",
};

export type FluxoRelatorio = StructuralKey | "TRANSFERENCIA";

export type LinhaFluxo = {
  fluxo: FluxoRelatorio;
  /** Sócio (Capital), placa (Veículos) ou categoria (Peças/Administrativo). */
  item: string;
  /** Aporte/Retirada/Pró-labore no Capital; Entrada/Saída nos demais. */
  tipo: string;
  direcao: "entrada" | "saida" | "transferencia";
  conta: string;
  qtd: number;
  valor: number;
};

export type TotalConta = { conta: string; entradas: number; saidas: number };

/**
 * Relatório CONSOLIDADO dos fluxos por conta financeira, num período: tudo o
 * que foi efetivamente pago/recebido (e as transferências entre contas),
 * somado por fluxo + sócio/placa/categoria + tipo + conta. Ex.: três saques do
 * Marco — 100 e 50 no BB e 20 no cofre — viram duas linhas: "Marco · Retirada
 * · BB 150" e "Marco · Retirada · Cofre 20".
 *
 * O detalhe lançamento a lançamento está no Livro caixa; aqui é o resumo para
 * alimentar outro sistema. Mesmas regras de classificação das telas:
 * - fluxo = centro de custo estrutural do título ("Veículos" sem carro vira
 *   Administrativo); título com sócio do Capital é sempre Capital;
 * - fatura de cartão paga é aberta pelos itens (cada item tem o seu fluxo,
 *   carro ou sócio); a sobra sem item fica na categoria da fatura.
 */
export async function fluxosPorConta(de: Date, ate: Date): Promise<{
  linhas: LinhaFluxo[];
  porConta: TotalConta[];
}> {
  const periodoPago = { gte: de, lte: ate };
  const veiculoSel = { select: { plate: true, brand: true, model: true } } as const;
  const [pagos, recebidos, transferencias] = await Promise.all([
    prisma.payable.findMany({
      where: { status: "PAGO", paymentDate: periodoPago },
      select: {
        id: true,
        amount: true,
        category: true,
        categoryLabel: true,
        vehicleId: true,
        partId: true,
        vehicle: veiculoSel,
        sale: { select: { vehicle: veiculoSel } },
        capitalBeneficiaryId: true,
        capitalBeneficiary: { select: { name: true } },
        capitalCoverGroup: true,
        costCenter: { select: { key: true } },
        account: { select: { name: true } },
        cardItems: {
          select: {
            amount: true,
            structuralKey: true,
            vehicleId: true,
            vehicle: veiculoSel,
            capitalBeneficiaryId: true,
            capitalBeneficiary: { select: { name: true } },
          },
        },
      },
    }),
    prisma.receivable.findMany({
      where: { status: "RECEBIDO", receivedDate: periodoPago },
      select: {
        id: true,
        amount: true,
        category: true,
        vehicleId: true,
        vehicle: veiculoSel,
        sale: { select: { vehicle: veiculoSel } },
        capitalBeneficiaryId: true,
        capitalBeneficiary: { select: { name: true } },
        capitalCoverGroup: true,
        costCenter: { select: { key: true } },
        account: { select: { name: true } },
      },
    }),
    prisma.accountTransfer.findMany({
      where: { date: periodoPago },
      select: { amount: true, from: { select: { name: true } }, to: { select: { name: true } } },
    }),
  ]);

  // Movimentação de capital ligada ao título: diz de quem é e se é retirada ou
  // pró-labore (o título nem sempre carrega o sócio — ex.: fechamento mensal).
  const movs = await prisma.capitalTransaction.findMany({
    where: {
      OR: [
        { payableId: { in: pagos.map((p) => p.id) } },
        { receivableId: { in: recebidos.map((r) => r.id) } },
      ],
    },
    select: { payableId: true, receivableId: true, kind: true, beneficiary: { select: { name: true } } },
  });
  const movPorPagavel = new Map(movs.filter((m) => m.payableId).map((m) => [m.payableId!, m]));
  const movPorRecebivel = new Map(movs.filter((m) => m.receivableId).map((m) => [m.receivableId!, m]));

  const grupos = new Map<string, LinhaFluxo>();
  const somar = (l: Omit<LinhaFluxo, "qtd">) => {
    if (Math.abs(l.valor) < 0.005) return;
    const chave = [l.fluxo, l.item, l.tipo, l.conta].join("|");
    const atual = grupos.get(chave);
    if (atual) {
      atual.qtd += 1;
      atual.valor = round2(atual.valor + l.valor);
    } else {
      grupos.set(chave, { ...l, qtd: 1, valor: round2(l.valor) });
    }
  };
  const placa = (v: { plate: string; brand: string; model: string } | null | undefined) =>
    v ? `${v.plate} · ${v.brand} ${v.model}` : "Veículo sem placa";

  for (const p of pagos) {
    const conta = p.account?.name ?? "Sem conta";
    const categoria = p.categoryLabel?.trim() || PAGAR_LABEL[p.category] || p.category;
    // Fatura de cartão: cada item vai para o seu fluxo; a sobra fica na fatura.
    if (p.cardItems.length > 0) {
      let usado = 0;
      for (const it of p.cardItems) {
        usado += it.amount;
        const fluxo = it.capitalBeneficiaryId
          ? "CAPITAL"
          : effectiveStructuralKey(it.structuralKey, it.vehicleId);
        somar({
          fluxo,
          item:
            fluxo === "CAPITAL"
              ? (it.capitalBeneficiary?.name ?? "Capital")
              : fluxo === "VEICULOS"
                ? placa(it.vehicle)
                : categoria,
          tipo: fluxo === "CAPITAL" ? "Retirada" : "Saída",
          direcao: "saida",
          conta,
          valor: it.amount,
        });
      }
      const sobra = round2(p.amount - usado);
      if (Math.abs(sobra) >= 0.005) {
        somar({ fluxo: "ADMINISTRATIVO", item: categoria, tipo: "Saída", direcao: "saida", conta, valor: sobra });
      }
      continue;
    }
    const mov = movPorPagavel.get(p.id);
    const veiculo = p.vehicle ?? p.sale?.vehicle ?? null;
    const fluxo: StructuralKey =
      p.capitalBeneficiaryId || mov || p.capitalCoverGroup
        ? "CAPITAL"
        : effectiveStructuralKey(
            // Sem centro de custo: o próprio título diz (carro ou peça).
            p.costCenter?.key ?? (veiculo ? "VEICULOS" : p.partId ? "PECAS" : null),
            p.vehicleId ?? (p.sale?.vehicle ? "venda" : null),
          );
    somar({
      fluxo,
      item:
        fluxo === "CAPITAL"
          ? p.capitalCoverGroup
            ? "Cobertura de capital"
            : (mov?.beneficiary.name ?? p.capitalBeneficiary?.name ?? categoria)
          : fluxo === "VEICULOS"
            ? placa(veiculo)
            : categoria,
      tipo:
        fluxo === "CAPITAL"
          ? mov?.kind === "PRO_LABORE"
            ? "Pró-labore"
            : p.capitalCoverGroup
              ? "Cobertura (saída)"
              : "Retirada"
          : "Saída",
      direcao: "saida",
      conta,
      valor: p.amount,
    });
  }

  for (const r of recebidos) {
    const conta = r.account?.name ?? "Sem conta";
    const categoria = RECEBER_LABEL[r.category] || r.category;
    const mov = movPorRecebivel.get(r.id);
    const veiculo = r.vehicle ?? r.sale?.vehicle ?? null;
    const fluxo: StructuralKey =
      r.capitalBeneficiaryId || mov || r.capitalCoverGroup
        ? "CAPITAL"
        : effectiveStructuralKey(r.costCenter?.key ?? (veiculo ? "VEICULOS" : null), r.vehicleId ?? (veiculo ? "venda" : null));
    somar({
      fluxo,
      item:
        fluxo === "CAPITAL"
          ? r.capitalCoverGroup
            ? "Cobertura de capital"
            : (mov?.beneficiary.name ?? r.capitalBeneficiary?.name ?? categoria)
          : fluxo === "VEICULOS"
            ? placa(veiculo)
            : categoria,
      tipo: fluxo === "CAPITAL" ? (r.capitalCoverGroup ? "Cobertura (entrada)" : "Aporte") : "Entrada",
      direcao: "entrada",
      conta,
      valor: r.amount,
    });
  }

  for (const t of transferencias) {
    somar({
      fluxo: "TRANSFERENCIA",
      item: `${t.from.name} → ${t.to.name}`,
      tipo: "Transferência",
      direcao: "transferencia",
      conta: t.from.name,
      valor: t.amount,
    });
  }

  const ordemFluxo: Record<FluxoRelatorio, number> = {
    CAPITAL: 0,
    VEICULOS: 1,
    ADMINISTRATIVO: 2,
    PECAS: 3,
    TRANSFERENCIA: 4,
  };
  const linhas = [...grupos.values()].sort(
    (a, b) =>
      ordemFluxo[a.fluxo] - ordemFluxo[b.fluxo] ||
      a.item.localeCompare(b.item, "pt-BR") ||
      a.tipo.localeCompare(b.tipo, "pt-BR") ||
      a.conta.localeCompare(b.conta, "pt-BR"),
  );

  // Totais por conta: entradas e saídas de verdade (transferência entra na
  // conta de destino e sai da de origem).
  const contas = new Map<string, TotalConta>();
  const conta = (nome: string) => {
    const c = contas.get(nome) ?? { conta: nome, entradas: 0, saidas: 0 };
    contas.set(nome, c);
    return c;
  };
  for (const l of linhas) {
    if (l.direcao === "entrada") conta(l.conta).entradas = round2(conta(l.conta).entradas + l.valor);
    if (l.direcao === "saida") conta(l.conta).saidas = round2(conta(l.conta).saidas + l.valor);
  }
  for (const t of transferencias) {
    conta(t.from.name).saidas = round2(conta(t.from.name).saidas + t.amount);
    conta(t.to.name).entradas = round2(conta(t.to.name).entradas + t.amount);
  }
  const porConta = [...contas.values()].sort((a, b) => a.conta.localeCompare(b.conta, "pt-BR"));
  return { linhas, porConta };
}
