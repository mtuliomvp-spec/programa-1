import "server-only";
import { prisma } from "@/lib/prisma";
import { textoDoPdf } from "@/lib/pdf-text";
import { createManualPayable, resolveSupplierByName } from "@/lib/finance";

/**
 * Comunicação de venda (SICOVE) — a cobrança da prestadora lançada sozinha.
 *
 * A loja comunica a venda ao SENATRAN por uma prestadora (hoje a R30), que
 * cobra por serviço prestado e fatura tudo num boleto mensal. Cada comprovante
 * anexado na ficha do carro vira UM título a pagar vinculado àquele veículo —
 * assim o custo cai na margem do carro certo, e o boleto único do mês é pago
 * marcando os títulos em lote (ou por um combo de pagamento).
 *
 * A leitura é DETERMINÍSTICA, sem IA: o comprovante é sempre o mesmo formulário
 * com camada de texto. Sai de graça, na hora, e não erra dígito.
 */

export type ServicoSicove = "COMUNICACAO" | "CANCELAMENTO";

export type ComprovanteSicove = {
  tipo: ServicoSicove;
  /** Nº do registro no SICOVE, ex. "55.00054580/26" — identidade do serviço. */
  numero: string | null;
  placa: string | null;
  /** Data do envio à Base Nacional (é ela que define o mês da fatura). */
  enviadoEm: Date | null;
};

const soDigitos = (s: string) => s.replace(/\D/g, "");

/** dd/mm/aaaa → Date ao meio-dia (evita o vai-e-vem de fuso). */
function dataBr(texto: string | undefined): Date | null {
  if (!texto) return null;
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00.000Z`);
}

/**
 * Reconhece um comprovante do SICOVE. Devolve null quando o arquivo não é um
 * (um contrato, uma nota) — nesse caso nada é cobrado.
 */
export function lerComprovanteSicove(buffer: Buffer): ComprovanteSicove | null {
  let texto: string;
  try {
    texto = textoDoPdf(buffer);
  } catch {
    return null;
  }
  if (!texto) return null;
  const limpo = texto.replace(/\s+/g, " ");

  // A FATURA mensal também fala de SICOVE e lista "CANCELAMENTO" como serviço —
  // ela é a cobrança do conjunto, não o comprovante de um serviço. Descarta
  // antes de qualquer coisa, senão anexá-la viraria uma cobrança fantasma.
  if (/RELAT[ÓO]RIO DE DETALHAMENTO DE FATURA/i.test(limpo)) return null;

  // O comprovante se identifica pelo cabeçalho ou pelo par "sob o número" +
  // "Placa:", que só ele tem.
  const ehComprovante =
    /COMPROVANTE DE (COMUNICA|CANCELAMENTO)/i.test(limpo) ||
    (/sob o n[úu]mero/i.test(limpo) && /Placa:/i.test(limpo));
  if (!ehComprovante) return null;

  // Cancelamento só pelo cabeçalho: a palavra solta aparece no texto legal do
  // próprio comunicado e faria um serviço de 24,90 ser cobrado como 11,90.
  const cancelamento =
    /COMPROVANTE DE CANCELAMENTO/i.test(limpo) || /CANCELAMENTO DE COMUNICA/i.test(limpo);
  const numero = limpo.match(/n[úu]mero\s+(\d{2}\.\d{8}\/\d{2})/i)?.[1] ?? null;
  const placa = limpo.match(/Placa:\s*([A-Z0-9]{7})/i)?.[1]?.toUpperCase() ?? null;
  const enviadoEm =
    dataBr(limpo.match(/Data de Envio Base Nacional:\s*([\d/]+)/i)?.[1]) ??
    dataBr(limpo.match(/Data da Venda:\s*([\d/]+)/i)?.[1]);

  return { tipo: cancelamento ? "CANCELAMENTO" : "COMUNICACAO", numero, placa, enviadoEm };
}

/**
 * Vencimento da fatura que vai cobrar este serviço: o dia configurado, no mês
 * SEGUINTE ao do envio (a prestadora fecha o mês e vence no dia 10 do outro).
 */
export function vencimentoDaFatura(enviadoEm: Date, dia: number): Date {
  const ano = enviadoEm.getUTCFullYear();
  const mes = enviadoEm.getUTCMonth() + 1;
  // Dia 31 num mês de 30: o construtor normaliza para o mês seguinte, então
  // limita ao último dia do mês de destino.
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia), 12, 0, 0));
}

export type CobrancaLancada = {
  ok: boolean;
  /** Texto pronto para a tela: o que foi lançado, ou por que não foi. */
  mensagem?: string;
};

/**
 * Lança a cobrança do comprovante recém-anexado. Silenciosa por natureza: se o
 * arquivo não for um comprovante, se a configuração estiver vazia ou se o
 * serviço já tiver sido cobrado, não faz nada e não atrapalha o anexo.
 */
export async function lancarCobrancaSicove(input: {
  vehicleId: string;
  buffer: Buffer;
}): Promise<CobrancaLancada> {
  const comprovante = lerComprovanteSicove(input.buffer);
  if (!comprovante) return { ok: false };

  const company = await prisma.companySettings.findFirst({
    select: {
      sicoveFornecedor: true,
      sicoveComunicado: true,
      sicoveCancelamento: true,
      sicoveVencimentoDia: true,
    },
  });
  const fornecedor = (company?.sicoveFornecedor || "").trim();
  const valor =
    comprovante.tipo === "CANCELAMENTO" ? company?.sicoveCancelamento : company?.sicoveComunicado;
  if (!fornecedor || !valor || valor <= 0) {
    return {
      ok: false,
      mensagem:
        "Comprovante reconhecido, mas a cobrança não foi lançada: configure a prestadora e os valores em Parâmetros › Comunicação de venda.",
    };
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { id: true, plate: true, brand: true, model: true },
  });
  if (!vehicle) return { ok: false };

  // Comprovante de outro carro: não lança no veículo errado.
  const placaFicha = vehicle.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (comprovante.placa && comprovante.placa !== placaFicha) {
    return {
      ok: false,
      mensagem: `Este comprovante é da placa ${comprovante.placa}, e a ficha é da ${placaFicha} — a cobrança não foi lançada.`,
    };
  }

  // Idempotência pelo número do registro: o mesmo serviço nunca é cobrado duas
  // vezes, mesmo que o arquivo seja anexado de novo. Sem número (formato
  // diferente do esperado), não arrisca duplicar.
  if (!comprovante.numero) {
    return {
      ok: false,
      mensagem:
        "Comprovante reconhecido, mas sem o número do registro — a cobrança precisa ser lançada à mão.",
    };
  }
  const jaExiste = await prisma.payable.findFirst({
    where: { documentNumber: comprovante.numero },
    select: { id: true },
  });
  if (jaExiste) {
    return { ok: false, mensagem: "Este serviço já estava lançado em Contas a pagar." };
  }

  const enviadoEm = comprovante.enviadoEm ?? new Date();
  const dueDate = vencimentoDaFatura(enviadoEm, company?.sicoveVencimentoDia || 10);
  const supplierId = await resolveSupplierByName(fornecedor);
  const rotulo = comprovante.tipo === "CANCELAMENTO" ? "Cancelamento" : "Comunicação de venda";

  await createManualPayable({
    description: `${rotulo} (SICOVE) - placa ${vehicle.plate}`,
    category: "DESPESA_OPERACIONAL",
    categoryLabel: "Comunicação de venda",
    documentNumber: comprovante.numero,
    amount: valor,
    dueDate,
    supplierId,
    // Vinculado ao veículo: o título vira custo daquele carro e entra na margem.
    vehicleId: vehicle.id,
    structuralKey: "VEICULOS",
    notes: `Registro ${comprovante.numero} enviado em ${enviadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Cobrado na fatura mensal da prestadora.`,
    alreadyPaid: false,
  });

  const brl = valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const venc = dueDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return {
    ok: true,
    mensagem: `${rotulo} reconhecida: título de ${brl} lançado em Contas a pagar, vencendo em ${venc}, como custo deste veículo.`,
  };
}

/** Digitos do CNPJ da prestadora, quando informado junto do nome. */
export const sicoveCnpjDoTexto = (s: string): string | null => {
  const m = s.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  return m ? soDigitos(m[0]) : null;
};

// ---------------------------------------------------------------------------
// Fatura mensal: ler o detalhamento e conferir contra o que foi lançado
// ---------------------------------------------------------------------------

export type ItemFatura = {
  tipo: ServicoSicove;
  numero: string;
  placa: string;
  enviadoEm: Date | null;
  valor: number;
};

export type FaturaSicove = {
  numero: string | null;
  periodoInicio: Date | null;
  periodoFim: Date | null;
  vencimento: Date | null;
  itens: ItemFatura[];
  /** Soma dos itens lidos. */
  total: number;
};

/** "1.234,56" → 1234.56 */
const valorBr = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/**
 * Lê o "Relatório de detalhamento de fatura" do SICOVE.
 *
 * O valor de cada item NÃO é lido dígito a dígito: no PDF o IP vem grudado no
 * valor ("177.99.2.2524,90") e as duas leituras são gramaticalmente válidas
 * ("25" + "24,90" ou "252" + "4,90"). O que não é ambíguo é o TOTAL da seção e
 * a quantidade de itens dela — então o unitário sai da divisão, e o total da
 * seção serve de conferência do próprio parse.
 */
export function lerFaturaSicove(buffer: Buffer): FaturaSicove | null {
  let texto: string;
  try {
    texto = textoDoPdf(buffer);
  } catch {
    return null;
  }
  const limpo = texto.replace(/\s+/g, " ");
  if (!/RELAT[ÓO]RIO DE DETALHAMENTO DE FATURA/i.test(limpo)) return null;

  // Sem espaço antes do próximo rótulo ("...-52PERÍODO:"), então o número só
  // pode conter dígitos e hífen.
  const numero = limpo.match(/N[ºo°]?\s*DA FATURA:\s*([\d-]+)/i)?.[1] ?? null;
  const periodo = limpo.match(/PER[ÍI]ODO:\s*([\d/]+)\s*[ÀA]\s*([\d/]+)/i);
  const vencimento = dataBr(limpo.match(/VENCIMENTO\s*([\d/]{10})/i)?.[1]);

  // Cada bloco começa em "<SERVIÇO>DESCRIÇÃO DO SERVIÇO:" e termina no
  // "TOTAL:" dele. O mesmo serviço pode ter vários blocos (um por página).
  const itens: ItemFatura[] = [];
  const blocos = [...limpo.matchAll(/([A-ZÇÃÕÁÉÍÓÚ ]{4,})DESCRI[ÇC][ÃA]O DO SERVI[ÇC]O:/gi)];
  for (let i = 0; i < blocos.length; i++) {
    const bloco = blocos[i];
    const inicio = bloco.index + bloco[0].length;
    const fim = i + 1 < blocos.length ? blocos[i + 1].index : limpo.length;
    const trecho = limpo.slice(inicio, fim);
    const tipo: ServicoSicove = /CANCELAMENTO/i.test(bloco[1]) ? "CANCELAMENTO" : "COMUNICACAO";

    const linhas = [
      ...trecho.matchAll(
        /(\d{2}\/\d{2}\/\d{4}) \d{2}:\d{2}:\d{2}[^]*?(\d{2}\.\d{8}\/\d{2})([A-Z]{3}\d[A-Z0-9]\d{2})/g,
      ),
    ];
    if (!linhas.length) continue;
    const totalBloco = trecho.match(/TOTAL:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    const unitario = totalBloco ? valorBr(totalBloco[1]) / linhas.length : 0;

    for (const l of linhas) {
      itens.push({
        tipo,
        numero: l[2],
        placa: l[3].toUpperCase(),
        enviadoEm: dataBr(l[1]),
        valor: Math.round(unitario * 100) / 100,
      });
    }
  }

  // Um mesmo item pode aparecer duas vezes se o bloco for repetido no PDF.
  const vistos = new Set<string>();
  const unicos = itens.filter((i) => (vistos.has(i.numero) ? false : (vistos.add(i.numero), true)));

  return {
    numero,
    periodoInicio: dataBr(periodo?.[1]),
    periodoFim: dataBr(periodo?.[2]),
    vencimento,
    itens: unicos,
    total: Math.round(unicos.reduce((s, i) => s + i.valor, 0) * 100) / 100,
  };
}
