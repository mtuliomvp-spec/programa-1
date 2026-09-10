"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { createManualPayable, resolveSupplierByName } from "@/lib/finance";
import { formatCompetenciaMes } from "@/lib/competencia";
import { nameKey } from "@/lib/person-keys";
import {
  lerBoletoSicove,
  lerFaturaSicove,
  vencimentoDaFatura,
  type BoletoSicove,
  type FaturaSicove,
  type ServicoSicove,
} from "@/lib/sicove";

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
  /**
   * O título foi achado pela PLACA, não pelo nº do registro: ele foi lançado
   * por outro caminho (à mão, ou pelo comprovante antes desta tela existir) e
   * ficou sem o número. Ao lançar/unificar, o número é gravado nele — é isso
   * que impede o serviço de virar dois títulos.
   */
  porPlaca?: boolean;
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
  /** O boleto anexado junto, quando houver: é ele que se paga. */
  boleto?: {
    valor: number;
    vencimento: string | null;
    linhaDigitavel: string;
    numeroFatura: string | null;
    /** Divergências entre o boleto e a fatura (não impedem nada sozinhas). */
    avisos: string[];
  };
  linhas?: LinhaConferencia[];
  /** Títulos do SICOVE no período que a fatura NÃO cobrou. */
  sobrando?: {
    id: string;
    descricao: string;
    numero: string | null;
    valor: number;
    /** A placa dele está na fatura, cobrada em outro título: sobra duplicada. */
    duplicado?: boolean;
  }[];
  resumo?: { totalFatura: number; totalLancado: number; faltando: number; divergentes: number };
  /** Borderô que já unificou esta fatura (quando ela já foi unificada). */
  unificado?: { comboId: string; nome: string; titulos: number; status: string } | null;
};

const dia = (d: Date | null) =>
  d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * A prestadora cadastrada como fornecedor — SEM criar nada (a conferência não
 * grava). Null quando ela ainda não virou fornecedor.
 */
async function prestadoraCadastrada(): Promise<string | null> {
  const company = await prisma.companySettings.findFirst({ select: { sicoveFornecedor: true } });
  const nome = (company?.sicoveFornecedor || "").trim();
  if (!nome) return null;
  const exato = await prisma.supplier.findFirst({
    where: { name: { equals: nome, mode: "insensitive" } },
    select: { id: true },
  });
  if (exato) return exato.id;
  const chave = nameKey(nome);
  if (!chave) return null;
  const todos = await prisma.supplier.findMany({ select: { id: true, name: true } });
  return todos.find((s) => nameKey(s.name) === chave)?.id ?? null;
}

type CandidatoSemRegistro = {
  id: string;
  description: string;
  amount: number;
  supplierId: string | null;
  categoryLabel: string | null;
};

/**
 * Títulos de comunicação de venda SEM o nº do registro — os que a conferência
 * não conseguiria casar pelo número.
 *
 * Existem porque o serviço pode ter sido lançado por fora: à mão, ou pelo
 * comprovante anexado antes de a tela de conferência existir. Sem olhar para
 * eles, a fatura os dava como "falta lançar" e criava um segundo título para o
 * mesmo serviço — o carro ficava cobrado duas vezes.
 *
 * O casamento é pela PLACA na descrição, e só vale para título que já se
 * apresenta como comunicação de venda (fornecedor, categoria ou descrição):
 * "Compra do veículo Fiat Strada (TCZ9A42)" também traz a placa e não pode ser
 * confundido com a cobrança do SICOVE.
 */
async function candidatosSemRegistro(
  placas: string[],
  supplierId: string | null,
): Promise<CandidatoSemRegistro[]> {
  if (!placas.length) return [];
  const rows = await prisma.payable.findMany({
    where: {
      status: { not: "PAGO" },
      documentNumber: null,
      OR: placas.map((p) => ({ description: { contains: p, mode: "insensitive" as const } })),
    },
    select: { id: true, description: true, amount: true, supplierId: true, categoryLabel: true },
  });
  return rows.filter(
    (r) =>
      (supplierId && r.supplierId === supplierId) ||
      r.categoryLabel === "Comunicação de venda" ||
      /comunica|sicove/i.test(r.description),
  );
}

/** O candidato desta placa que ainda não foi usado por outra linha da fatura. */
function acharPelaPlaca(
  placa: string,
  candidatos: CandidatoSemRegistro[],
  usados: Set<string>,
): CandidatoSemRegistro | null {
  return (
    candidatos.find(
      (c) => !usados.has(c.id) && c.description.toUpperCase().includes(placa.toUpperCase()),
    ) ?? null
  );
}

/** Nome do borderô que unifica uma fatura — é ele que dá a idempotência. */
const nomeDoBordero = (numeroFatura: string | null) =>
  `Fatura SICOVE ${numeroFatura ?? "sem número"}`;

/**
 * Confere o boleto contra a fatura detalhada: mesmo número, mesmo total, mesma
 * data. Nada aqui bloqueia — a divergência é informação para quem vai pagar
 * (juros de boleto reemitido, por exemplo, são legítimos).
 */
function conferirBoleto(
  boleto: BoletoSicove,
  fatura: FaturaSicove,
): { valor: number; vencimento: string | null; numeroFatura: string | null; avisos: string[] } {
  const avisos: string[] = [];
  if (boleto.numeroFatura && fatura.numero && boleto.numeroFatura !== fatura.numero) {
    avisos.push(
      `o boleto é da fatura ${boleto.numeroFatura} e o relatório é da ${fatura.numero} — confira se os dois arquivos são do mesmo mês`,
    );
  }
  if (Math.abs(boleto.valor - fatura.total) > 0.005) {
    avisos.push(
      `o boleto cobra ${brl(boleto.valor)} e os serviços da fatura somam ${brl(fatura.total)}`,
    );
  }
  if (
    boleto.vencimento &&
    fatura.vencimento &&
    boleto.vencimento.toISOString().slice(0, 10) !== fatura.vencimento.toISOString().slice(0, 10)
  ) {
    avisos.push(
      `o boleto vence em ${dia(boleto.vencimento)} e a fatura diz ${dia(fatura.vencimento)}`,
    );
  }
  return {
    valor: boleto.valor,
    vencimento: dia(boleto.vencimento),
    numeroFatura: boleto.numeroFatura,
    avisos,
  };
}

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

  // O BOLETO é opcional na conferência: com ele, dá para unificar os títulos
  // num borderô só — que é como o boleto vai ser pago.
  const boletoFile = formData.get("boleto");
  let boleto: ConferenciaFatura["boleto"];
  if (boletoFile instanceof File && boletoFile.size > 0) {
    if (boletoFile.size > MAX_BYTES) return { ok: false, error: "O boleto é grande demais (máximo 15 MB)." };
    const lido = lerBoletoSicove(Buffer.from(await boletoFile.arrayBuffer()));
    if (!lido) {
      return {
        ok: false,
        error:
          "Não achei a linha digitável neste PDF. Anexe o boleto da fatura — o arquivo com o código de barras.",
      };
    }
    boleto = { ...conferirBoleto(lido, fatura), linhaDigitavel: lido.linhaDigitavel };
  }

  const numeros = fatura.itens.map((i) => i.numero);
  const placas = fatura.itens.map((i) => i.placa);
  const supplierId = await prestadoraCadastrada();
  const [lancados, veiculos, semRegistro] = await Promise.all([
    prisma.payable.findMany({
      where: { documentNumber: { in: numeros } },
      select: { id: true, documentNumber: true, amount: true },
    }),
    prisma.vehicle.findMany({
      where: { plate: { in: placas } },
      orderBy: { createdAt: "desc" },
      select: { id: true, plate: true, brand: true, model: true },
    }),
    candidatosSemRegistro(placas, supplierId),
  ]);
  const porNumero = new Map(lancados.map((p) => [p.documentNumber, p]));
  const porPlacaVeiculo = new Map(veiculos.map((v) => [v.plate.toUpperCase(), v]));

  // Casados pela placa (título lançado por fora, sem o nº do registro): a
  // conferência só MOSTRA — o número é gravado na hora de lançar/unificar.
  const usados = new Set<string>();
  const linhas: LinhaConferencia[] = fatura.itens.map((i) => {
    const porNum = porNumero.get(i.numero);
    const adotado = porNum ? null : acharPelaPlaca(i.placa, semRegistro, usados);
    if (adotado) usados.add(adotado.id);
    const titulo = porNum ?? adotado;
    const v = porPlacaVeiculo.get(i.placa);
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
      porPlaca: Boolean(adotado),
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
            AND: [
              {
                // Não só os rotulados "Comunicação de venda": o mesmo serviço
                // lançado à mão pode ter ido para outra categoria, e é
                // justamente esse que corre o risco de virar título duplicado.
                OR: [
                  { categoryLabel: "Comunicação de venda" },
                  ...(supplierId ? [{ supplierId }] : []),
                  { description: { contains: "SICOVE", mode: "insensitive" as const } },
                ],
              },
              {
                // Sem o `null` explícito o título SEM número ficava de fora:
                // em SQL, `NULL NOT IN (...)` não é verdadeiro. Era justamente
                // ele que sumia daqui — o lançado por fora, que duplica.
                OR: [{ documentNumber: null }, { documentNumber: { notIn: numeros } }],
              },
            ],
            dueDate: {
              gte: new Date(Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), 1)),
              lt: new Date(Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth() + 1, 1)),
            },
          },
          select: { id: true, description: true, documentNumber: true, amount: true },
        })
      )
        // O que foi casado pela placa não sobra: ele É o título do serviço.
        .filter((p) => !usados.has(p.id))
        .map((p) => ({
          id: p.id,
          descricao: p.description,
          numero: p.documentNumber,
          valor: p.amount,
          // A placa está na fatura e já tem título com o nº do registro: são
          // dois títulos para o mesmo serviço.
          duplicado: placas.some((placa) => p.description.toUpperCase().includes(placa)),
        }))
    : [];

  const totalLancado = linhas
    .filter((l) => l.situacao !== "FALTA")
    .reduce((s, l) => s + (l.valorLancado ?? 0), 0);

  // Esta fatura já virou borderô? O nome é a chave — unificar de novo só
  // completa o que existe, nunca cria um segundo.
  const bordero = await prisma.paymentCombo.findFirst({
    where: { name: nomeDoBordero(fatura.numero), status: { not: "CANCELADO" } },
    select: { id: true, name: true, status: true, _count: { select: { payables: true } } },
  });

  return {
    ok: true,
    boleto,
    unificado: bordero
      ? { comboId: bordero.id, nome: bordero.name, titulos: bordero._count.payables, status: bordero.status }
      : null,
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

/** Lança os serviços que a fatura cobrou e o sistema não tinha. */
export async function lancarFaltantesSicoveAction(
  itens: { numero: string; tipo: ServicoSicove; placa: string; enviadoEm: string | null }[],
): Promise<LancamentoEmLote> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!itens.length) return { ok: false, error: "Nada a lançar." };
  const r = await lancarItensDaFatura(itens);
  if (r.error) return { ok: false, error: r.error };

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/comunicacao-venda");
  return { ok: true, criados: r.criados, avisos: r.avisos };
}

/**
 * Cria os títulos dos serviços que ainda não existem. O valor NÃO vem da tela:
 * é relido da configuração pelo tipo do serviço — o que chega do navegador só
 * diz QUAL serviço lançar, nunca quanto. Já lançado (mesmo número de registro)
 * é pulado, então rodar duas vezes não duplica nada.
 *
 * Antes de criar, procura o serviço lançado por FORA (à mão, ou pelo
 * comprovante), que não tem o nº do registro: achando pela placa, ele ADOTA o
 * número em vez de nascer um segundo título para o mesmo serviço.
 */
async function lancarItensDaFatura(
  itens: { numero: string; tipo: ServicoSicove; placa: string; enviadoEm: string | null }[],
): Promise<{ criados: number; avisos: string[]; adotados?: number; error?: string }> {
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
    return { criados: 0, avisos: [], error: "Configure a prestadora em Parâmetros › Comunicação de venda." };
  }
  const supplierId = await resolveSupplierByName(fornecedor);
  const avisos: string[] = [];
  let criados = 0;
  let adotados = 0;
  const semRegistro = await candidatosSemRegistro(
    itens.map((i) => i.placa),
    supplierId,
  );
  const usados = new Set<string>();

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

    // O serviço já pode estar lançado sem o número (à mão, ou pelo
    // comprovante): adotar é o que impede o título duplicado.
    const antigo = acharPelaPlaca(item.placa, semRegistro, usados);
    if (antigo) {
      usados.add(antigo.id);
      await prisma.payable.update({
        where: { id: antigo.id },
        data: { documentNumber: item.numero },
      });
      adotados += 1;
      if (Math.abs(antigo.amount - valor) > 0.005) {
        avisos.push(
          `${item.placa}: o título que já existia está em ${brl(antigo.amount)} e a fatura cobra ${brl(valor)} — confira o valor.`,
        );
      }
      continue;
    }

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

  if (adotados > 0) {
    avisos.push(
      `${adotados} serviço(s) já tinham título lançado por fora — aproveitei o que existia e gravei o nº do registro neles (não criei título novo).`,
    );
  }
  return { criados, avisos, adotados };
}

// ---------------------------------------------------------------------------
// Unificar: a fatura e o boleto viram UM borderô com os títulos do mês
// ---------------------------------------------------------------------------

export type UnificacaoFatura = {
  ok: boolean;
  error?: string;
  comboId?: string;
  /** Quantos títulos ficaram dentro do borderô. */
  titulos?: number;
  /** Soma deles (o que a baixa vai debitar). */
  total?: number;
  /** Quantos precisaram ser lançados na hora. */
  criados?: number;
  avisos?: string[];
};

/**
 * Une os títulos do mês num BORDERÔ só — o boleto — assim que a fatura e o
 * boleto chegam, sem esperar o pagamento.
 *
 * A prestadora manda um boleto por mês e uma linha por veículo. Cada linha
 * continua sendo um título (é o que põe o custo no carro certo), mas quem paga
 * paga um valor só: então os títulos entram num combo de pagamento SOLICITADO,
 * que em Contas a pagar aparece como um pagamento único e é baixado de uma vez.
 * Os dois PDFs ficam anexados nele, e a linha digitável na observação.
 *
 * Rodar de novo com a mesma fatura não cria um segundo borderô: completa o que
 * existe (serviço lançado depois, título que faltava).
 */
export async function unificarFaturaSicoveAction(formData: FormData): Promise<UnificacaoFatura> {
  try {
    await assertCan("financeiro", "criar");
    await assertCan("combos", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const file = formData.get("file");
  const boletoFile = formData.get("boleto");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecione o PDF da fatura." };
  if (!(boletoFile instanceof File) || boletoFile.size === 0) {
    return { ok: false, error: "Anexe também o boleto: é ele que unifica os títulos num pagamento só." };
  }
  if (file.size > MAX_BYTES || boletoFile.size > MAX_BYTES) {
    return { ok: false, error: "Arquivo muito grande (máximo 15 MB)." };
  }

  const faturaBuffer = Buffer.from(await file.arrayBuffer());
  const boletoBuffer = Buffer.from(await boletoFile.arrayBuffer());
  const fatura = lerFaturaSicove(faturaBuffer);
  if (!fatura || fatura.itens.length === 0) {
    return { ok: false, error: "Não consegui ler o relatório de detalhamento da fatura." };
  }
  const boleto = lerBoletoSicove(boletoBuffer);
  if (!boleto) {
    return { ok: false, error: "Não achei a linha digitável no PDF do boleto." };
  }
  if (boleto.numeroFatura && fatura.numero && boleto.numeroFatura !== fatura.numero) {
    return {
      ok: false,
      error: `O boleto é da fatura ${boleto.numeroFatura} e o relatório é da ${fatura.numero}. Anexe os dois arquivos do mesmo mês.`,
    };
  }

  // 1) O que a fatura cobrou e ainda não tinha título vira título agora: o
  //    borderô só faz sentido cobrindo a fatura inteira.
  const lancamento = await lancarItensDaFatura(
    fatura.itens.map((i) => ({
      numero: i.numero,
      tipo: i.tipo,
      placa: i.placa,
      enviadoEm: i.enviadoEm ? i.enviadoEm.toISOString().slice(0, 10) : null,
    })),
  );
  if (lancamento.error) return { ok: false, error: lancamento.error };
  const avisos = [...lancamento.avisos];

  // 2) Os títulos da fatura, pelo número do registro (a identidade do serviço).
  const numeros = fatura.itens.map((i) => i.numero);
  const titulos = await prisma.payable.findMany({
    where: { documentNumber: { in: numeros } },
    select: { id: true, amount: true, status: true, paymentComboId: true, description: true },
  });
  const pagos = titulos.filter((t) => t.status === "PAGO");
  if (pagos.length) {
    avisos.push(`${pagos.length} título(s) desta fatura já estão pagos e ficaram de fora.`);
  }

  const bordero = await prisma.paymentCombo.findFirst({
    where: { name: nomeDoBordero(fatura.numero), status: { not: "CANCELADO" } },
    select: { id: true, status: true },
  });
  if (bordero && bordero.status === "PAGO") {
    return { ok: false, error: "O borderô desta fatura já foi pago." };
  }
  const emOutroCombo = titulos.filter(
    (t) => t.status !== "PAGO" && t.paymentComboId && t.paymentComboId !== bordero?.id,
  );
  if (emOutroCombo.length) {
    avisos.push(
      `${emOutroCombo.length} título(s) já estão em outro combo de pagamento e ficaram de fora.`,
    );
  }

  // A linha digitável tem campo próprio (é ela que se copia para pagar); a
  // observação fica com o que se lê de relance.
  const observacao = [
    `Boleto ${brl(boleto.valor)}${boleto.vencimento ? ` · vence ${dia(boleto.vencimento)}` : ""}`,
    fatura.periodoInicio && fatura.periodoFim
      ? `Serviços de ${dia(fatura.periodoInicio)} a ${dia(fatura.periodoFim)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const comboId =
    bordero?.id ??
    (
      await prisma.paymentCombo.create({
        // Sem `userId`: o borderô é da prestadora, não de um sócio — com dono
        // o pagamento abateria capital de quem não tem nada a ver com isto.
        data: {
          name: nomeDoBordero(fatura.numero),
          notes: observacao,
          barcode: boleto.linhaDigitavel,
          userId: null,
        },
        select: { id: true },
      })
    ).id;
  if (bordero) {
    await prisma.paymentCombo.update({
      where: { id: comboId },
      data: { notes: observacao, barcode: boleto.linhaDigitavel },
    });
  }

  // 3) Os títulos entram no borderô e passam a valer pelo que o boleto diz:
  //    o vencimento é o dele, e a competência é o mês dos serviços.
  const entrar = titulos.filter((t) => t.status !== "PAGO" && !t.paymentComboId);
  const competencia = fatura.periodoFim
    ? formatCompetenciaMes(fatura.periodoFim.getUTCFullYear(), fatura.periodoFim.getUTCMonth() + 1)
    : null;
  if (entrar.length) {
    await prisma.payable.updateMany({
      where: { id: { in: entrar.map((t) => t.id) } },
      data: {
        paymentComboId: comboId,
        ...(boleto.vencimento ? { dueDate: boleto.vencimento } : {}),
        ...(competencia ? { referencePeriod: competencia } : {}),
      },
    });
  }

  // 4) Os dois PDFs ficam no borderô — é onde quem paga vai procurá-los.
  for (const [descricao, arquivo, buffer] of [
    ["Boleto da fatura", boletoFile, boletoBuffer],
    ["Relatório de detalhamento da fatura", file, faturaBuffer],
  ] as const) {
    await prisma.comboAttachment.deleteMany({ where: { comboId, kind: "OUTRO", description: descricao } });
    await prisma.comboAttachment.create({
      data: {
        comboId,
        kind: "OUTRO",
        description: descricao,
        filename: arquivo.name || `${descricao}.pdf`,
        mimeType: arquivo.type || "application/pdf",
        size: buffer.byteLength,
        data: buffer,
      },
    });
  }

  // 5) SOLICITADO: em Contas a pagar o borderô vira UM pagamento, com baixa
  //    única — que é exatamente como o boleto se paga.
  const dentro = await prisma.payable.findMany({
    where: { paymentComboId: comboId, status: { not: "PAGO" } },
    select: { amount: true },
  });
  await prisma.paymentCombo.update({
    where: { id: comboId },
    data: { status: "SOLICITADO", requestedAt: new Date() },
  });

  const total = Math.round(dentro.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  if (Math.abs(total - boleto.valor) > 0.005) {
    avisos.push(
      `o borderô soma ${brl(total)} e o boleto cobra ${brl(boleto.valor)} — a baixa sai pelos títulos`,
    );
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/combos");
  revalidatePath(`/financeiro/combos/${comboId}`);
  revalidatePath("/financeiro/comunicacao-venda");
  return { ok: true, comboId, titulos: dentro.length, total, criados: lancamento.criados, avisos };
}

// ---------------------------------------------------------------------------
// Comprovante avulso: lançar sem passar pela ficha do veículo
// ---------------------------------------------------------------------------

export type ComprovanteAvulsoResult = {
  ok: boolean;
  /** Texto pronto para a tela — o que foi lançado ou por que não foi. */
  mensagem?: string;
  /** Título criado, para a tela oferecer o link. */
  payableId?: string;
};

/**
 * Lança a cobrança de um comprovante do SICOVE SEM passar pela ficha do carro.
 *
 * É o caminho de quem não tem ficha para anexar: o carro foi vendido antes da
 * implantação do sistema, ou nunca esteve nele (a loja entrou só como agente da
 * comunicação). O sistema procura a placa lida: achando o carro, o custo entra
 * nele como sempre (pós-venda, se já vendido); só a placa desconhecida vira
 * despesa ADMINISTRATIVA, sem vínculo com carro nenhum.
 *
 * O comprovante fica anexado ao próprio título — é onde ele faz falta na hora
 * de conferir a fatura — e também na ficha do carro, quando existe uma.
 */
export async function lancarComprovanteAvulsoAction(
  formData: FormData,
): Promise<ComprovanteAvulsoResult> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : "Sem permissão." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, mensagem: "Selecione o PDF do comprovante." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { ok: false, mensagem: "Arquivo muito grande (máximo 15 MB)." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/pdf";

  const { lancarCobrancaSicove, motivoNaoReconhecido } = await import("@/lib/sicove");
  const cobranca = await lancarCobrancaSicove({
    buffer,
    mimeType,
    // Aqui o arquivo SEMPRE se propõe a ser um comprovante: o aviso do que deu
    // errado é o próprio conteúdo da tela.
    descricao: "Comunicação de venda",
  });
  if (!cobranca.ok || !cobranca.payableId) {
    return { ok: false, mensagem: cobranca.mensagem || motivoNaoReconhecido(buffer, mimeType) };
  }

  // O documento acompanha o título (e a ficha do carro, quando há uma).
  await prisma.payableAttachment.create({
    data: {
      payableId: cobranca.payableId,
      kind: "OUTRO",
      description: "Comunicação de venda (SICOVE)",
      filename: file.name || "comunicacao-de-venda.pdf",
      mimeType,
      size: buffer.byteLength,
      data: buffer,
    },
  });
  if (cobranca.vehicleId) {
    await prisma.vehicleAttachment.create({
      data: {
        vehicleId: cobranca.vehicleId,
        kind: "DOCUMENTO",
        description: "Comunicação de venda",
        filename: file.name || "comunicacao-de-venda.pdf",
        mimeType,
        size: buffer.byteLength,
        data: buffer,
      },
    });
    revalidatePath(`/estoque/${cobranca.vehicleId}`);
    revalidatePath("/estoque");
  }

  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/comunicacao-venda");
  return { ok: true, mensagem: cobranca.mensagem, payableId: cobranca.payableId };
}
