import "server-only";
import { prisma } from "@/lib/prisma";
import { docKey, nameKey } from "@/lib/person-keys";

/**
 * Em nome de quem o veículo está (proprietário lido do CRLV) — é da CASA, do
 * COMPRADOR ou de terceiro? Regras compartilhadas pela listagem do estoque,
 * pela ficha e pela leitura do CRLV.
 */

/** Chaves de nome da casa: loja (razão social e fantasia) + sócios do capital. */
export async function houseNameKeys(): Promise<string[]> {
  const [company, beneficiaries] = await Promise.all([
    prisma.companySettings.findUnique({
      where: { id: "company" },
      select: { razaoSocial: true, nomeFantasia: true },
    }),
    prisma.capitalBeneficiary.findMany({ select: { name: true } }),
  ]);
  return [company?.razaoSocial, company?.nomeFantasia, ...beneficiaries.map((b) => b.name)]
    .map((n) => nameKey(n))
    .filter((k) => k.length >= 4);
}

/**
 * O veículo está no nome da CASA (a loja ou um dos sócios) ou de terceiro?
 *
 * A comparação é por `nameKey` (sem acento/pontuação/espaço) e por CONTINÊNCIA
 * nos dois sentidos, porque o CRLV traz a razão social completa enquanto o
 * cadastro costuma ter a forma curta: "MVP VEICULOS LTDA" (documento) casa com
 * "MVP Veículos" (Parâmetros). Terceiro — "FABIANO FROES NEGOCIOS LTDA" — não
 * casa com nenhuma das nossas.
 */
export function isOwnName(ownerName: string, houseKeys: string[]): boolean {
  const key = nameKey(ownerName);
  if (!key) return false;
  return houseKeys.some((h) => h.length >= 4 && (key.includes(h) || h.includes(key)));
}

/**
 * O proprietário do CRLV é esta pessoa (o comprador da venda)? Bate pelo
 * CPF/CNPJ quando os dois estão completos; senão pelo nome, com a mesma
 * continência da casa ("G A GONCALVES JUNIOR LTDA" × "G A Gonçalves Junior").
 */
export function sameParty(
  ownerName: string | null | undefined,
  ownerDoc: string | null | undefined,
  person: { name: string; document: string | null },
): boolean {
  const d1 = docKey(ownerDoc);
  const d2 = docKey(person.document);
  if (d1 && d2) return d1 === d2;
  const k1 = nameKey(ownerName);
  const k2 = nameKey(person.name);
  if (k1.length < 6 || k2.length < 6) return false;
  return k1.includes(k2) || k2.includes(k1);
}

/** "01/09/2026" (data impressa no CRLV) → Date ao meio-dia UTC; null se inválida. */
export function parseDataBr(texto: string | null | undefined): Date | null {
  const m = (texto || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Veículo VENDIDO com o CRLV mais recente já em nome de terceiro (não da
 * casa), anexado depois da venda ou em nome do próprio comprador: a
 * transferência ao comprador CONCLUIU, mesmo que ninguém tenha marcado.
 * Usado como leitura derivada na listagem e na ficha (a leitura do CRLV grava
 * a conclusão de fato, com a data do documento).
 */
export function crlvNoNomeDoComprador(v: {
  status: string;
  docOwnerName: string | null;
  docOwnerIsOurs: boolean;
  lastCrlvAt: Date | null;
  sale: {
    saleDate: Date;
    transferDoneAt: Date | null;
    customer: { name: string; document: string | null };
    /** Vendedor/proprietário do documento na operação (financiamento de
     *  terceiros). Vazio nas vendas de estoque, onde o carro era da loja. */
    ownerName?: string | null;
    ownerDocument?: string | null;
  } | null;
}): boolean {
  if (v.status !== "VENDIDO" || !v.sale || v.sale.transferDoneAt) return false;
  if (!v.docOwnerName || v.docOwnerIsOurs) return false;
  if (sameParty(v.docOwnerName, null, v.sale.customer)) return true;
  // Documento ainda no nome do VENDEDOR da operação (financiamento de
  // terceiros: o carro nunca foi da loja). Nada foi transferido — e o CRLV
  // dele costuma ser anexado no dia da operação, o que fazia a regra de baixo
  // concluir "transferido" só porque o anexo é posterior à venda.
  if (
    v.sale.ownerName &&
    sameParty(v.docOwnerName, null, { name: v.sale.ownerName, document: v.sale.ownerDocument ?? null })
  ) {
    return false;
  }
  return v.lastCrlvAt != null && v.lastCrlvAt.getTime() > v.sale.saleDate.getTime();
}

/**
 * O que a documentação de um veículo precisa mostrar na tela: CRLV, orçamento
 * de transferência, comunicação de venda, foto do cliente, ATPV-e e — o que
 * mais importa depois da venda — se o carro já saiu do nome do dono anterior.
 *
 * Vale para QUALQUER veículo com ficha, esteja ele no estoque da loja ou seja
 * de terceiro (financiamento de terceiros): as perguntas são as mesmas, e a
 * resposta sai dos mesmos anexos, custos e títulos.
 */
export type VeiculoDocumental = {
  status: string;
  docOwnerName: string | null;
  transferInProgress: boolean;
  attachments: { kind: string; description: string; createdAt: Date }[];
  costs: { description: string; createdAt: Date }[];
  payables: { description: string; createdAt: Date }[];
  sale: {
    saleDate: Date;
    transferDoneAt: Date | null;
    customer: { name: string; document: string | null };
    /** Transferência cobrada na venda: existe título do despachante a pagar. */
    transferCharged?: boolean;
    transferAmount?: number;
    /** Vendedor/proprietário do documento (financiamento de terceiros). */
    ownerName?: string | null;
    ownerDocument?: string | null;
  } | null;
  /** Ainda em estoque, mas com pré-venda aberta (conta como "saindo"). */
  preVendido?: boolean;
};

export type SituacaoDocumental = {
  hasCrlv: boolean;
  crlvYear: string | null;
  hasComunicacao: boolean;
  hasFotoCliente: boolean;
  hasAtpv: boolean;
  hasTransferQuote: boolean;
  docOwnerIsOurs: boolean;
  docOwnerOk: boolean;
  transferStarted: boolean;
  transferInProgress: boolean;
  transferDoneAt: Date | null;
  transferDoneByCrlv: boolean;
  soldTransferred: boolean;
  saleTransferPending: boolean;
};

/** Descrição do anexo que identifica o orçamento/recibo do despachante. */
export const ORCAMENTO_TRANSFERENCIA_RE = /^or[çc]amento de transfer/i;

export function situacaoDocumental(
  v: VeiculoDocumental,
  houseKeys: string[],
): SituacaoDocumental {
  // Momento do ÚLTIMO lançamento de transferência (custo/conta com a palavra)
  // e do ÚLTIMO CRLV anexado. Um CRLV no NOSSO nome anexado DEPOIS do
  // lançamento significa que a transferência paga era a mudança para o nosso
  // nome e ela CONCLUIU — o selo "em processo" deve dar lugar ao
  // "Transferido" (o caso contrário — CRLV antigo, transferência ao comprador
  // em andamento — mantém o "em processo").
  const transferSignals = [
    ...v.costs.filter((c) => /transfer[eê]ncia/i.test(c.description)),
    ...v.payables.filter((p) => /transfer[eê]ncia/i.test(p.description)),
  ].map((x) => x.createdAt.getTime());
  const lastTransferAt = transferSignals.length ? Math.max(...transferSignals) : null;
  const crlvTimes = v.attachments
    .filter((a) => a.kind === "CRLV")
    .map((a) => a.createdAt.getTime());
  const lastCrlvAt = crlvTimes.length ? Math.max(...crlvTimes) : null;
  const docOwnerIsOurs = v.docOwnerName ? isOwnName(v.docOwnerName, houseKeys) : false;
  const transferConcluded =
    docOwnerIsOurs && lastCrlvAt != null && lastTransferAt != null && lastCrlvAt > lastTransferAt;
  const crlvDoComprador = crlvNoNomeDoComprador({
    status: v.status,
    docOwnerName: v.docOwnerName,
    docOwnerIsOurs,
    lastCrlvAt: lastCrlvAt != null ? new Date(lastCrlvAt) : null,
    sale: v.sale,
  });
  // Quando a transferência ao comprador concluiu: a data marcada na venda ou,
  // faltando ela, a do CRLV no nome do comprador.
  const transferDoneAt: Date | null =
    v.sale?.transferDoneAt ?? (crlvDoComprador && lastCrlvAt != null ? new Date(lastCrlvAt) : null);
  const saindo = v.status === "VENDIDO" || Boolean(v.preVendido);
  // Orçamento do despachante anexado.
  const temOrcamento = v.attachments.some(
    (a) => a.kind === "DOCUMENTO" && ORCAMENTO_TRANSFERENCIA_RE.test(a.description),
  );
  // Sinais de que o processo está correndo POR CONTA DA VENDA: o título
  // "Transferência DETRAN" nasce preso à venda (não ao veículo), então ele não
  // aparece em costs/payables do carro — sem isto, o veículo com transferência
  // cobrada e orçamento anexado não acendia nenhum selo de processo.
  const processoDaVenda =
    temOrcamento || Boolean(v.sale?.transferCharged && (v.sale.transferAmount ?? 0) > 0);

  return {
    hasCrlv: v.attachments.some((a) => a.kind === "CRLV"),
    // Ano em exercício do CRLV mais recente (guardado no description "CRLV 2025").
    crlvYear:
      v.attachments
        .filter((a) => a.kind === "CRLV")
        .map((a) => a.description.match(/(\d{4})/)?.[1] ?? "")
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    hasComunicacao: v.attachments.some((a) => /comunica/i.test(a.description)),
    hasFotoCliente: v.attachments.some((a) => a.kind === "FOTO_CLIENTE"),
    // ATPV-e anexada (card próprio na ficha). Só gera selo POSITIVO — sem
    // ATPV-e não aparece nada (nem "pendente").
    hasAtpv: v.attachments.some((a) => a.kind === "DOCUMENTO" && /atpv/i.test(a.description)),
    // Orçamento da transferência (despachante) anexado — só selo positivo.
    hasTransferQuote: temOrcamento,
    // Documento no nome da loja/sócio (verde) ou de terceiro (vermelho).
    docOwnerIsOurs,
    // Nome no documento é o esperado: da casa — ou, em veículo vendido já
    // transferido, do comprador (também verde: é onde o carro deve estar).
    docOwnerOk: docOwnerIsOurs || (v.status === "VENDIDO" && transferDoneAt != null),
    // Processo de transferência iniciado quando qualquer um: marca manual
    // (casos antigos); custo do veículo com "transferência"; conta a pagar com
    // "transferência" (pagamento ao despachante), mesmo fora da ficha de venda;
    // o ORÇAMENTO do despachante anexado (é o começo do processo, e na venda
    // que já reservou a transferência ele é o único sinal no carro, porque o
    // título fica preso à venda, não ao veículo); ou a transferência cobrada na
    // própria venda.
    transferStarted: v.transferInProgress || lastTransferAt != null || processoDaVenda,
    transferInProgress: v.transferInProgress,
    // Transferência no DETRAN concluída (só faz sentido em veículo vendido):
    // marcada na venda ou provada pelo CRLV no nome do comprador.
    transferDoneAt,
    transferDoneByCrlv: !v.sale?.transferDoneAt && transferDoneAt != null,
    soldTransferred: v.status === "VENDIDO" && transferDoneAt != null,
    // Em veículo VENDIDO/PRÉ-VENDIDO ainda no nosso nome, uma transferência
    // lançada (custo/conta com "transferência") significa a transferência ao
    // COMPRADOR em andamento — então o selo "em processo" deve vencer o
    // "Transferido". Em estoque puro isso não vale (senão todo carro comprado,
    // que teve custo de transferência ao entrar, ficaria eternamente "em
    // processo"). Não vale se a baixa no DETRAN já foi marcada como concluída.
    saleTransferPending:
      saindo &&
      transferDoneAt == null &&
      (v.transferInProgress ||
        // Detecção automática só enquanto o processo NÃO concluiu (CRLV no
        // nosso nome anexado depois do lançamento encerra o aviso); a marca
        // MANUAL continua valendo até ser desfeita na ficha.
        (!transferConcluded && (lastTransferAt != null || processoDaVenda))),
  };
}

/**
 * Selo de documentação do veículo, em três estados:
 *  - "⚠ CRLV pendente": sem CRLV anexado e sem transferência lançada;
 *  - "🔄 Processo de transferência em aberto": custo de transferência (DETRAN)
 *    lançado e o CRLV novo ainda não anexado — o processo está correndo;
 *  - "✓ CRLV {ano}" (ou "✓ Transferido · CRLV {ano}"): o CRLV no nome da
 *    loja/sócio foi anexado — documentação em dia. Em veículo VENDIDO,
 *    "Transferido" é a transferência ao COMPRADOR.
 */
export function seloCrlv({
  hasCrlv,
  crlvYear: year,
  transferStarted,
  docOwnerIsOurs,
  transferInProgress: transferManual,
  saleTransferPending,
  soldTransferred,
}: Pick<
  SituacaoDocumental,
  | "hasCrlv"
  | "crlvYear"
  | "transferStarted"
  | "docOwnerIsOurs"
  | "transferInProgress"
  | "saleTransferPending"
  | "soldTransferred"
>): { label: string; tone: "success" | "warning" | "info" } {
  const crlv = `CRLV${year ? ` ${year}` : ""}`;
  // Vendido e já no nome do comprador: processo encerrado, inclusive a marca
  // manual (o CRLV novo é a prova de que a transferência concluiu).
  if (soldTransferred) return { label: `✓ Transferido · ${crlv}`, tone: "success" };
  // Marca MANUAL "em processo de transferência" vence tudo: o usuário afirmou
  // que a transferência ainda está correndo (ex.: veículo vendido cujo CRLV
  // ainda está no nome de um sócio, não do comprador). Desfazer a marca na ficha
  // libera os demais estados.
  if (transferManual) return { label: "🔄 Processo de transferência em aberto", tone: "info" };
  // Veículo vendido/pré-vendido, ainda no nosso nome, com transferência lançada:
  // é a transferência ao COMPRADOR em andamento — vence o "Transferido".
  if (saleTransferPending) return { label: "🔄 Processo de transferência em aberto", tone: "info" };
  // Documento JÁ no nome da loja/sócio → transferência concluída de fato. Ter
  // CRLV anexado não basta: pode ser o do dono anterior (ex.: implantação de
  // estoque com o CRLV antigo).
  if (hasCrlv && docOwnerIsOurs) return { label: `✓ Transferido · ${crlv}`, tone: "success" };
  // Processo em aberto (custo de transferência) e ainda NÃO no nosso nome —
  // mesmo com o CRLV do dono anterior anexado.
  if (transferStarted) return { label: "🔄 Processo de transferência em aberto", tone: "info" };
  // Tem CRLV, sem processo e sem confirmação de que está no nosso nome.
  if (hasCrlv) return { label: `✓ ${crlv}`, tone: "success" };
  return { label: "⚠ CRLV pendente", tone: "warning" };
}
