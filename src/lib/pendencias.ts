import "server-only";
import { prisma } from "@/lib/prisma";
import { situacaoDocumental, seloCrlv, TITULO_TRANSFERENCIA_DA_VENDA } from "@/lib/doc-owner";
import { effectivePayableStatus, effectiveReceivableStatus } from "@/lib/status";
import { lerNfeConfig } from "@/lib/nfe-config";
import { nameKey } from "@/lib/person-keys";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * Pendências da loja: o que ainda precisa de uma ação de alguém, juntado de
 * todas as telas num lugar só. NADA aqui é regra nova — cada item usa a MESMA
 * conta da tela de onde ele vem (selos do Estoque, colunas de Financiamentos,
 * notas livres das NFS-e, vencidos do Dashboard), para a pendência sumir
 * sozinha assim que o assunto é resolvido lá.
 */

export type PendenciaItem = {
  id: string;
  titulo: string;
  detalhe?: string;
  href: string;
  valor?: number;
  /** Há quantos dias está pendente (desde a venda, o recebimento, o vencimento...). */
  dias?: number;
  /** Selo ao lado do título (ex.: situação da transferência). */
  selo?: { texto: string; tom: "danger" | "warning" | "info" | "success" };
  /** Veículo que pode ter a pendência ABONADA ali mesmo (foto do cliente). */
  abonarVehicleId?: string;
};

export type PendenciaGrupo = {
  key: string;
  icone: string;
  titulo: string;
  /** O que fazer para resolver (aparece embaixo do título). */
  comoResolver: string;
  tom: "danger" | "warning" | "info";
  href: string;
  itens: PendenciaItem[];
  /** O grupo aceita abonar (dispensar) os itens: botão em cada um e "abonar todas". */
  abonavel?: boolean;
};

const DIA = 86_400_000;
const diasDesde = (d: Date, hoje: Date) => Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / DIA));
const veiculoTxt = (v: { brand: string; model: string; plate: string }) =>
  `${v.brand} ${v.model} · ${v.plate}`.trim();

export async function getPendencias(acesso: {
  estoque: boolean;
  financeiro: boolean;
  /** Pode gerir a Folha (administrativo.folha): férias e rescisões. */
  folha?: boolean;
}): Promise<PendenciaGrupo[]> {
  const hoje = new Date();
  const [fin, docs, folha] = await Promise.all([
    acesso.financeiro ? pendenciasFinanceiras(hoje) : Promise.resolve([]),
    acesso.estoque ? pendenciasDocumentais(hoje) : Promise.resolve([]),
    acesso.folha ? pendenciasDaFolha(hoje) : Promise.resolve([]),
  ]);
  return [...fin, ...folha, ...docs].filter((g) => g.itens.length > 0);
}

/** Férias vencidas/perto de vencer e férias ou rescisões a pagar (a mesma conta da Folha). */
async function pendenciasDaFolha(hoje: Date): Promise<PendenciaGrupo[]> {
  const { alertasDaFolha } = await import("@/lib/folha-alertas");
  const alertas = (await alertasDaFolha(hoje)).filter((a) => a.tom !== "info");
  return [
    {
      key: "folha",
      icone: "🏖️",
      titulo: "Férias e rescisões",
      comoResolver: "Conceda as férias antes do prazo (depois dele, pagamento em dobro) e pague férias e rescisões no prazo da CLT.",
      tom: alertas.some((a) => a.tom === "danger") ? "danger" : "warning",
      href: "/folha",
      itens: alertas.map((a) => ({
        id: a.id,
        titulo: a.titulo,
        detalhe: a.detalhe,
        href: a.href,
        valor: a.valor,
        selo: { texto: a.selo, tom: a.tom },
      })),
    },
  ];
}

async function pendenciasFinanceiras(hoje: Date): Promise<PendenciaGrupo[]> {
  const [vendas, notasEmitidas, company, payables, receivables] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "CONCLUIDA", paymentMethod: "FINANCIADO" },
      orderBy: { saleDate: "asc" },
      select: {
        id: true,
        saleDate: true,
        financerName: true,
        financerAccountId: true,
        financerAccount: { select: { name: true } },
        financedAmount: true,
        financedAlreadyReceived: true,
        financerSettledAt: true,
        pendingFinancingDate: true,
        returnNet: true,
        returnPaidAmount: true,
        returnSettledAt: true,
        pendingReturnDate: true,
        returnNfseId: true,
        returnNfse: { select: { status: true } },
        insuranceSold: true,
        insuranceCommissionAmount: true,
        insuranceSettledAt: true,
        insurancePayer: true,
        pendingInsuranceDate: true,
        insuranceNfseId: true,
        insuranceNfse: { select: { status: true } },
        customer: { select: { name: true } },
        vehicle: { select: { brand: true, model: true, plate: true } },
      },
    }),
    prisma.notaServico.count(),
    prisma.companySettings.findUnique({ where: { id: "company" }, select: { nfeConfig: true } }),
    prisma.payable.findMany({
      // "Pago sob solicitação" fora (devido, mas só se paga quando pedido) —
      // a não ser que já tenha entrado num combo, que é a solicitação.
      where: {
        status: { not: "PAGO" },
        dueDate: { lt: hoje },
        OR: [{ sobSolicitacao: false }, { paymentComboId: { not: null } }],
      },
      orderBy: { dueDate: "asc" },
      select: { id: true, description: true, amount: true, dueDate: true, status: true },
    }),
    prisma.receivable.findMany({
      where: { status: { not: "RECEBIDO" }, dueDate: { lt: hoje } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        description: true,
        amount: true,
        dueDate: true,
        status: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  // NFS-e só é cobrada de quem usa: a loja que já emitiu alguma nota ou já
  // preencheu a inscrição municipal. Sem isso, toda loja sem o módulo veria a
  // lista cheia de "NF a emitir" que ela nunca vai emitir pelo sistema.
  const usaNfse = notasEmitidas > 0 || lerNfeConfig(company?.nfeConfig).nfseInscricaoMunicipal.trim() !== "";
  // Nota rejeitada/cancelada não conta (a mesma regra da tela de NFS-e).
  const notaValida = (id: string | null, n: { status: string } | null) =>
    Boolean(id && n && !["ERRO", "CANCELADA"].includes(n.status));
  const financeira = (v: (typeof vendas)[number]) => v.financerAccount?.name || v.financerName || "financeira";
  const base = (v: (typeof vendas)[number]) => `${v.customer.name} · ${veiculoTxt(v.vehicle)}`;
  const naFila = (d: Date | null) => (d ? ` · na fila do caixa de ${formatDate(d)}` : "");

  const nfRetorno: PendenciaItem[] = [];
  const nfSeguro: PendenciaItem[] = [];
  const aReceberFin: PendenciaItem[] = [];
  const aReceberRet: PendenciaItem[] = [];
  const aReceberSeg: PendenciaItem[] = [];
  for (const v of vendas) {
    // Financiamento: o valor financiado ainda na conta da financeira.
    if (
      v.financerAccountId &&
      (v.financedAmount ?? 0) > 0 &&
      !v.financedAlreadyReceived &&
      !v.financerSettledAt
    ) {
      aReceberFin.push({
        id: `fin-${v.id}`,
        titulo: `${financeira(v)} — ${base(v)}`,
        detalhe: `Venda de ${formatDate(v.saleDate)}${naFila(v.pendingFinancingDate)}`,
        href: "/financeiro/financiamentos",
        valor: v.financedAmount ?? 0,
        dias: diasDesde(v.saleDate, hoje),
      });
    }
    if (v.returnNet > 0 && !v.returnSettledAt) {
      aReceberRet.push({
        id: `ret-${v.id}`,
        titulo: `${financeira(v)} — ${base(v)}`,
        detalhe: `Retorno da venda de ${formatDate(v.saleDate)}${naFila(v.pendingReturnDate)}`,
        href: "/financeiro/financiamentos",
        valor: v.returnNet,
        dias: diasDesde(v.saleDate, hoje),
      });
    }
    if (v.insuranceSold && !v.insuranceSettledAt) {
      aReceberSeg.push({
        id: `seg-${v.id}`,
        titulo: `${financeira(v)} — ${base(v)}`,
        detalhe: `Seguro vendido em ${formatDate(v.saleDate)}${naFila(v.pendingInsuranceDate)}`,
        href: "/financeiro/financiamentos",
        dias: diasDesde(v.saleDate, hoje),
      });
    }
    if (!usaNfse || !v.financerAccountId) continue;
    // NF da comissão: o dinheiro já caiu e nenhuma nota válida o cobre.
    if (v.returnNet > 0 && v.returnSettledAt && !notaValida(v.returnNfseId, v.returnNfse)) {
      nfRetorno.push({
        id: `nfr-${v.id}`,
        titulo: `${financeira(v)} — ${base(v)}`,
        detalhe: `Retorno recebido em ${formatDate(v.returnSettledAt)}`,
        href: "/financeiro/nfse",
        valor: v.returnPaidAmount ?? v.returnNet,
        dias: diasDesde(v.returnSettledAt, hoje),
      });
    }
    if (v.insuranceSold && v.insuranceSettledAt && !notaValida(v.insuranceNfseId, v.insuranceNfse)) {
      nfSeguro.push({
        id: `nfs-${v.id}`,
        titulo: `${v.insurancePayer || financeira(v)} — ${base(v)}`,
        detalhe: `Comissão do seguro recebida em ${formatDate(v.insuranceSettledAt)}`,
        href: "/financeiro/nfse",
        valor: v.insuranceCommissionAmount,
        dias: diasDesde(v.insuranceSettledAt, hoje),
      });
    }
  }

  const pagarVencidas: PendenciaItem[] = payables
    .filter((p) => effectivePayableStatus(p.status, p.dueDate) === "ATRASADO")
    .map((p) => ({
      id: `pag-${p.id}`,
      titulo: p.description,
      detalhe: `Venceu em ${formatDate(p.dueDate)}`,
      href: `/financeiro/a-pagar?status=ATRASADO&q=${encodeURIComponent(p.description)}`,
      valor: p.amount,
      dias: diasDesde(p.dueDate, hoje),
    }));
  const receberVencidas: PendenciaItem[] = receivables
    .filter((r) => effectiveReceivableStatus(r.status, r.dueDate) === "ATRASADO")
    .map((r) => ({
      id: `rec-${r.id}`,
      titulo: r.customer?.name ? `${r.customer.name} — ${r.description}` : r.description,
      detalhe: `Venceu em ${formatDate(r.dueDate)}`,
      href: `/financeiro/a-receber?status=ATRASADO&q=${encodeURIComponent(r.description)}`,
      valor: r.amount,
      dias: diasDesde(r.dueDate, hoje),
    }));

  return [
    {
      key: "nf-retorno",
      icone: "🧾",
      titulo: "NF de retorno a emitir",
      comoResolver: "O retorno já caiu e ainda não tem nota de serviço. Emita em Notas de serviço (NFS-e).",
      tom: "danger",
      href: "/financeiro/nfse",
      itens: nfRetorno,
    },
    {
      key: "nf-seguro",
      icone: "🧾",
      titulo: "NF de seguro a emitir",
      comoResolver: "A comissão do seguro já caiu e ainda não tem nota de serviço. Emita em Notas de serviço (NFS-e).",
      tom: "danger",
      href: "/financeiro/nfse",
      itens: nfSeguro,
    },
    {
      key: "fin-receber",
      icone: "🏦",
      titulo: "Financiamento a receber",
      comoResolver: "O valor financiado ainda está na conta da financeira. Quando cair, dê baixa em Financiamentos.",
      tom: "warning",
      href: "/financeiro/financiamentos",
      itens: aReceberFin,
    },
    {
      key: "ret-receber",
      icone: "💵",
      titulo: "Retorno a receber",
      comoResolver: "A financeira ainda não pagou o retorno. Quando cair, use “Receber retorno” em Financiamentos.",
      tom: "warning",
      href: "/financeiro/financiamentos",
      itens: aReceberRet,
    },
    {
      key: "seg-receber",
      icone: "🛡️",
      titulo: "Comissão de seguro a receber",
      comoResolver: "Seguro vendido cuja comissão ainda não caiu. Quando cair, dê baixa em Financiamentos.",
      tom: "info",
      href: "/financeiro/financiamentos",
      itens: aReceberSeg,
    },
    {
      key: "pagar-vencidas",
      icone: "📤",
      titulo: "Contas a pagar vencidas",
      comoResolver: "Vencimento passou e a conta não foi baixada: pague, corrija a data ou confira se já foi paga.",
      tom: "danger",
      href: "/financeiro/a-pagar?status=ATRASADO",
      itens: pagarVencidas,
    },
    {
      key: "receber-vencidas",
      icone: "📥",
      titulo: "Contas a receber vencidas",
      comoResolver: "O cliente não pagou no vencimento (ou o recebimento não foi baixado).",
      tom: "danger",
      href: "/financeiro/a-receber?status=ATRASADO",
      itens: receberVencidas,
    },
  ];
}

async function pendenciasDocumentais(hoje: Date): Promise<PendenciaGrupo[]> {
  const [vehicles, preSales, company, beneficiaryNames] = await Promise.all([
    prisma.vehicle.findMany({
      where: { intermediation: false },
      orderBy: { createdAt: "asc" },
      include: {
        // O MESMO recorte que a tela de Estoque usa para os selos.
        costs: { select: { amount: true, description: true, createdAt: true } },
        payables: { select: { description: true, createdAt: true } },
        attachments: { select: { kind: true, description: true, createdAt: true } },
        sale: {
          select: {
            saleDate: true,
            transferDoneAt: true,
            transferCharged: true,
            transferAmount: true,
            payables: { where: TITULO_TRANSFERENCIA_DA_VENDA, select: { description: true, status: true } },
            ownerName: true,
            ownerDocument: true,
            customer: { select: { name: true, document: true } },
          },
        },
      },
    }),
    prisma.preSale.findMany({
      where: { status: "ABERTA" },
      orderBy: { number: "asc" },
      select: { id: true, number: true, vehicleId: true, customerId: true, createdAt: true, totalAmount: true },
    }),
    prisma.companySettings.findUnique({
      where: { id: "company" },
      select: { razaoSocial: true, nomeFantasia: true },
    }),
    prisma.capitalBeneficiary.findMany({ select: { name: true } }),
  ]);
  const houseKeys = [company?.razaoSocial, company?.nomeFantasia, ...beneficiaryNames.map((b) => b.name)]
    .map((n) => nameKey(n))
    .filter((k) => k.length >= 4);
  const preVendidos = new Set(preSales.map((p) => p.vehicleId));

  const semProcesso: PendenciaItem[] = [];
  const semComunicacao: PendenciaItem[] = [];
  const emTransferencia: PendenciaItem[] = [];
  const semFoto: PendenciaItem[] = [];
  const crlvPendente: PendenciaItem[] = [];
  const foraDaVitrine: PendenciaItem[] = [];
  for (const v of vehicles) {
    const s = situacaoDocumental({ ...v, preVendido: preVendidos.has(v.id) }, houseKeys);
    const selo = seloCrlv(s);
    const vendido = v.status === "VENDIDO";
    const comprador = v.sale?.customer.name;
    const desdeVenda = v.sale ? diasDesde(v.sale.saleDate, hoje) : undefined;
    const item = (prefixo: string, detalhe: string, dias?: number): PendenciaItem => ({
      id: `${prefixo}-${v.id}`,
      titulo: veiculoTxt(v),
      detalhe,
      href: `/estoque/${v.id}`,
      dias,
    });
    const vendidoEm = v.sale ? `Vendido em ${formatDate(v.sale.saleDate)}${comprador ? ` para ${comprador}` : ""}` : "";
    const emNomeDe = s.donoAtual ? ` · em nome de ${s.donoAtual}` : "";

    // Selo "🔄 Processo de transferência em aberto" (o filtro do Estoque).
    const emProcesso = selo.label.startsWith("🔄");
    if (vendido) {
      // Vendido e parado: nem transferido, nem com processo correndo.
      if (s.transferDoneAt == null && !s.saleTransferPending && !emProcesso) {
        semProcesso.push(item("sp", `${vendidoEm}${emNomeDe}`, desdeVenda));
      }
      // Enquanto o carro não está no nome do comprador, a comunicação de venda
      // é o que protege a loja (multa, IPVA, ponto). Depois de transferido, não
      // faz mais falta.
      if (s.transferDoneAt == null && !s.hasComunicacao) {
        // Situação da transferência ao lado: em processo, a comunicação cobre
        // só até o CRLV novo sair; sem processo, o risco é maior.
        semComunicacao.push({
          ...item("cv", `${vendidoEm}${emNomeDe}`, desdeVenda),
          selo:
            emProcesso || s.saleTransferPending
              ? { texto: "🔄 Em processo de transferência", tom: "info" }
              : { texto: "⚠ Sem processo de transferência", tom: "danger" },
        });
      }
      if (!s.hasFotoCliente && !s.fotoClienteAbonada) {
        semFoto.push({ ...item("fc", vendidoEm, desdeVenda), abonarVehicleId: v.id });
      }
    }
    if (emProcesso) {
      emTransferencia.push(
        item(
          "tr",
          vendido
            ? `${vendidoEm}${emNomeDe}`
            : `Em estoque${emNomeDe}${v.transferToName ? ` · para ${v.transferToName}` : ""}`,
          vendido ? desdeVenda : diasDesde(v.entryDate, hoje),
        ),
      );
    }
    // O mesmo selo "⚠ Fora da vitrine" do Estoque: à venda, sem pré-venda e
    // sem anúncio publicado (reservado/pré-vendido fica oculto de propósito).
    if (v.status === "ESTOQUE" && !v.published && !preVendidos.has(v.id)) {
      foraDaVitrine.push(item("vit", `Em estoque desde ${formatDate(v.entryDate)}`, diasDesde(v.entryDate, hoje)));
    }
    if (!vendido && selo.label.startsWith("⚠")) {
      crlvPendente.push(item("crlv", `Em estoque desde ${formatDate(v.entryDate)}`, diasDesde(v.entryDate, hoje)));
    }
  }

  // Pré-vendas em aberto: negociação gerada e ainda não registrada como venda.
  const porId = new Map(vehicles.map((v) => [v.id, v]));
  const clientes = await prisma.customer.findMany({
    where: { id: { in: preSales.map((p) => p.customerId) } },
    select: { id: true, name: true },
  });
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.name]));
  const preVendas: PendenciaItem[] = preSales.map((p) => {
    const v = porId.get(p.vehicleId);
    return {
      id: `pv-${p.id}`,
      titulo: `Pré-venda nº ${String(p.number).padStart(4, "0")} — ${nomeCliente.get(p.customerId) ?? "cliente"}`,
      detalhe: `${v ? veiculoTxt(v) : "veículo"} · ${formatCurrency(p.totalAmount)} · aberta em ${formatDate(p.createdAt)}`,
      href: `/vendas/pre-vendas/${p.id}`,
      dias: diasDesde(p.createdAt, hoje),
    };
  });

  const maisAntigoPrimeiro = (a: PendenciaItem, b: PendenciaItem) => (b.dias ?? 0) - (a.dias ?? 0);
  return [
    {
      key: "vendido-sem-processo",
      icone: "🚨",
      titulo: "Vendido sem processo de transferência",
      comoResolver:
        "O carro foi vendido e nenhuma transferência foi iniciada (sem orçamento, título do despachante ou marca na ficha).",
      tom: "danger",
      href: "/estoque?doc=VENDIDO_SEM_PROCESSO",
      itens: semProcesso.sort(maisAntigoPrimeiro),
    },
    {
      key: "sem-comunicacao",
      icone: "📨",
      titulo: "Vendido sem comunicação de venda",
      comoResolver:
        "O carro ainda não está no nome do comprador e a comunicação de venda não foi anexada — multas e IPVA continuam caindo para o dono anterior.",
      tom: "danger",
      href: "/estoque?status=VENDIDO",
      itens: semComunicacao.sort(maisAntigoPrimeiro),
    },
    {
      key: "em-transferencia",
      icone: "🔄",
      titulo: "Em processo de transferência",
      comoResolver: "Acompanhe com o despachante. Some daqui quando o CRLV novo for anexado ou a transferência for marcada como concluída.",
      tom: "info",
      href: "/estoque?doc=TRANSFERENCIA",
      itens: emTransferencia.sort(maisAntigoPrimeiro),
    },
    {
      key: "crlv-pendente",
      icone: "📄",
      titulo: "CRLV pendente (em estoque)",
      comoResolver: "Carro em estoque sem CRLV anexado e sem transferência lançada.",
      tom: "warning",
      href: "/estoque?doc=CRLV_PENDENTE",
      itens: crlvPendente.sort(maisAntigoPrimeiro),
    },
    {
      key: "fora-vitrine",
      icone: "🪟",
      titulo: "Em estoque fora da vitrine",
      comoResolver: "Carro à venda sem anúncio publicado: ninguém o encontra no site. Publique na ficha do veículo (Anúncio).",
      tom: "warning",
      href: "/estoque?status=ESTOQUE",
      itens: foraDaVitrine.sort(maisAntigoPrimeiro),
    },
    {
      key: "pre-vendas",
      icone: "🤝",
      titulo: "Pré-vendas em aberto",
      comoResolver: "Negociação gerada e ainda não registrada. Registre a venda ou cancele a pré-venda.",
      tom: "warning",
      href: "/vendas",
      itens: preVendas.sort(maisAntigoPrimeiro),
    },
    {
      key: "sem-foto",
      icone: "📷",
      titulo: "Vendido sem foto do cliente",
      comoResolver:
        "Anexe a foto do cliente com o carro na ficha do veículo — ou abone a pendência (ex.: venda de antes da rotina da foto).",
      tom: "info",
      href: "/estoque?status=VENDIDO",
      itens: semFoto.sort(maisAntigoPrimeiro),
      abonavel: true,
    },
  ];
}
