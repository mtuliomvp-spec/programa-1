"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { createManualPayable, resolveSupplierByName } from "@/lib/finance";
import { lerFaturaSicove, vencimentoDaFatura, type ServicoSicove } from "@/lib/sicove";

const MAX_BYTES = 15 * 1024 * 1024;

export type LinhaConferencia = {
  numero: string;
  tipo: ServicoSicove;
  placa: string;
  /** ISO (yyyy-mm-dd) do envio à Base Nacional. */
  enviadoEm: string | null;
  valorFatura: number;
  /** Situação no sistema. */
  situacao: "LANCADO" | "FALTA" | "DIVERGENTE";
  /** Valor do título já lançado, quando houver. */
  valorLancado?: number;
  /** Veículo encontrado pela placa (quando existe). */
  veiculo?: { id: string; label: string } | null;
};

export type ConferenciaFatura = {
  ok: boolean;
  error?: string;
  fatura?: {
    numero: string | null;
    periodo: string | null;
    vencimento: string | null;
    total: number;
    itens: number;
  };
  linhas?: LinhaConferencia[];
  /** Títulos do SICOVE no período que a fatura NÃO cobrou. */
  sobrando?: { id: string; descricao: string; numero: string | null; valor: number }[];
  resumo?: { totalFatura: number; totalLancado: number; faltando: number; divergentes: number };
};

const dia = (d: Date | null) =>
  d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;

/**
 * Confere a fatura mensal da prestadora contra o que o sistema registrou:
 * o que foi cobrado e não está lançado, o que está lançado com valor diferente
 * e o que foi lançado sem constar na fatura. Não grava nada.
 */
export async function conferirFaturaSicoveAction(formData: FormData): Promise<ConferenciaFatura> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecione o PDF da fatura." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Arquivo muito grande (máximo 15 MB)." };

  const fatura = lerFaturaSicove(Buffer.from(await file.arrayBuffer()));
  if (!fatura) {
    return {
      ok: false,
      error:
        "Este PDF não parece o relatório de detalhamento da fatura. Anexe o arquivo da fatura, não o boleto nem o comprovante.",
    };
  }
  if (fatura.itens.length === 0) {
    return { ok: false, error: "A fatura foi reconhecida, mas nenhum serviço foi lido nela." };
  }

  const numeros = fatura.itens.map((i) => i.numero);
  const [lancados, veiculos] = await Promise.all([
    prisma.payable.findMany({
      where: { documentNumber: { in: numeros } },
      select: { id: true, documentNumber: true, amount: true },
    }),
    prisma.vehicle.findMany({
      where: { plate: { in: fatura.itens.map((i) => i.placa) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, plate: true, brand: true, model: true },
    }),
  ]);
  const porNumero = new Map(lancados.map((p) => [p.documentNumber, p]));
  const porPlaca = new Map(veiculos.map((v) => [v.plate.toUpperCase(), v]));

  const linhas: LinhaConferencia[] = fatura.itens.map((i) => {
    const titulo = porNumero.get(i.numero);
    const v = porPlaca.get(i.placa);
    const situacao: LinhaConferencia["situacao"] = !titulo
      ? "FALTA"
      : Math.abs(titulo.amount - i.valor) > 0.005
        ? "DIVERGENTE"
        : "LANCADO";
    return {
      numero: i.numero,
      tipo: i.tipo,
      placa: i.placa,
      enviadoEm: i.enviadoEm ? i.enviadoEm.toISOString().slice(0, 10) : null,
      valorFatura: i.valor,
      situacao,
      valorLancado: titulo?.amount,
      veiculo: v ? { id: v.id, label: `${v.brand} ${v.model} · ${v.plate}` } : null,
    };
  });

  // O outro lado: títulos do SICOVE que vencem nesta fatura e não foram
  // cobrados nela — lançamento a mais, ou serviço que a prestadora esqueceu.
  const vencimento = fatura.vencimento;
  const sobrando = vencimento
    ? (
        await prisma.payable.findMany({
          where: {
            categoryLabel: "Comunicação de venda",
            dueDate: {
              gte: new Date(Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), 1)),
              lt: new Date(Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth() + 1, 1)),
            },
            documentNumber: { notIn: numeros },
          },
          select: { id: true, description: true, documentNumber: true, amount: true },
        })
      ).map((p) => ({ id: p.id, descricao: p.description, numero: p.documentNumber, valor: p.amount }))
    : [];

  const totalLancado = linhas
    .filter((l) => l.situacao !== "FALTA")
    .reduce((s, l) => s + (l.valorLancado ?? 0), 0);

  return {
    ok: true,
    fatura: {
      numero: fatura.numero,
      periodo:
        fatura.periodoInicio && fatura.periodoFim
          ? `${dia(fatura.periodoInicio)} a ${dia(fatura.periodoFim)}`
          : null,
      vencimento: dia(fatura.vencimento),
      total: fatura.total,
      itens: fatura.itens.length,
    },
    linhas,
    sobrando,
    resumo: {
      totalFatura: fatura.total,
      totalLancado: Math.round(totalLancado * 100) / 100,
      faltando: linhas.filter((l) => l.situacao === "FALTA").length,
      divergentes: linhas.filter((l) => l.situacao === "DIVERGENTE").length,
    },
  };
}

export type LancamentoEmLote = { ok: boolean; error?: string; criados?: number; avisos?: string[] };

/**
 * Lança os serviços que a fatura cobrou e o sistema não tinha. O valor NÃO vem
 * da tela: é relido da configuração pelo tipo do serviço — o que chega do
 * navegador só diz QUAL serviço lançar, nunca quanto.
 */
export async function lancarFaltantesSicoveAction(
  itens: { numero: string; tipo: ServicoSicove; placa: string; enviadoEm: string | null }[],
): Promise<LancamentoEmLote> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!itens.length) return { ok: false, error: "Nada a lançar." };

  const company = await prisma.companySettings.findFirst({
    select: {
      sicoveFornecedor: true,
      sicoveComunicado: true,
      sicoveCancelamento: true,
      sicoveVencimentoDia: true,
    },
  });
  const fornecedor = (company?.sicoveFornecedor || "").trim();
  if (!fornecedor) {
    return { ok: false, error: "Configure a prestadora em Parâmetros › Comunicação de venda." };
  }
  const supplierId = await resolveSupplierByName(fornecedor);
  const avisos: string[] = [];
  let criados = 0;

  for (const item of itens) {
    const valor = item.tipo === "CANCELAMENTO" ? company?.sicoveCancelamento : company?.sicoveComunicado;
    if (!valor || valor <= 0) {
      avisos.push(`${item.placa}: valor do serviço não configurado — não lancei.`);
      continue;
    }
    // Idempotência: o número do registro é a identidade do serviço.
    const existe = await prisma.payable.findFirst({
      where: { documentNumber: item.numero },
      select: { id: true },
    });
    if (existe) continue;

    const veiculo = await prisma.vehicle.findFirst({
      where: { plate: item.placa },
      orderBy: { createdAt: "desc" },
      select: { id: true, plate: true },
    });
    const enviadoEm = item.enviadoEm ? new Date(`${item.enviadoEm}T12:00:00.000Z`) : new Date();
    const rotulo = item.tipo === "CANCELAMENTO" ? "Cancelamento" : "Comunicação de venda";

    await createManualPayable({
      description: `${rotulo} (SICOVE) - placa ${item.placa}`,
      category: "DESPESA_OPERACIONAL",
      categoryLabel: "Comunicação de venda",
      documentNumber: item.numero,
      amount: valor,
      dueDate: vencimentoDaFatura(enviadoEm, company?.sicoveVencimentoDia || 10),
      supplierId,
      // Sem o carro no sistema (negócio de terceiro), o custo é administrativo.
      vehicleId: veiculo?.id ?? null,
      structuralKey: veiculo ? "VEICULOS" : "ADMINISTRATIVO",
      notes: `Lançado pela conferência da fatura. Registro ${item.numero}.`,
      alreadyPaid: false,
    });
    if (!veiculo) avisos.push(`${item.placa}: veículo não está no sistema — lancei como administrativo.`);
    criados += 1;
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/comunicacao-venda");
  return { ok: true, criados, avisos };
}
