import "server-only";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * FILA DE ESPERA DO CAIXA.
 *
 * O comprovante do banco chega antes de o movimento de caixa alcançar o dia do
 * pagamento: paga-se o boleto no dia 08 com o caixa ainda aberto no dia 04. A
 * regra do sistema é que todo lançamento tem a data do caixa aberto — mexer
 * nela seria furar a única trava que mantém caixa e extrato conversando.
 *
 * Então o título fica PRÉ-LANÇADO: guarda o que o comprovante diz (data, valor
 * e conta debitada) e espera. Quando o caixa daquele dia é aberto, o
 * pré-lançamento aparece pronto em "Contas e caixas" e um ok faz a baixa de
 * verdade. Nada é debitado sem esse ok.
 *
 * O que o comprovante diz vale mais que o título: pago com desconto, com juros
 * ou com multa, a baixa sai pelo valor do comprovante — é o que saiu do banco.
 * A divergência fica registrada na observação do título.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/**
 * Mesmo número, ignorando o dígito verificador: o comprovante imprime
 * "205986-7" e o cadastro pode ter "205986" (ou o contrário).
 */
function mesmoNumero(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = digitos(a);
  const y = digitos(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.slice(0, -1) === y || y.slice(0, -1) === x;
}

function mesmoBanco(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) =>
    (v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b(banco|s\.?a\.?|sa|do brasil|brasil)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export type ContaDoComprovante = {
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  contaDebitada?: string | null;
};

/**
 * Qual conta financeira cadastrada foi debitada. Vai do mais forte para o mais
 * fraco: número da conta, depois agência + banco, depois só o banco (e só
 * quando ele identifica UMA conta — dois Bradescos cadastrados não dá para
 * adivinhar). Null = o usuário escolhe a conta na hora do ok.
 */
export async function contaDoComprovante(r: ContaDoComprovante): Promise<string | null> {
  const contas = await prisma.financialAccount.findMany({
    where: { active: true, structural: false, isInvestment: false },
    select: { id: true, name: true, bankName: true, agency: true, accountNumber: true },
  });
  if (contas.length === 0) return null;

  const texto = `${r.contaDebitada ?? ""} ${r.banco ?? ""} ${r.agencia ?? ""} ${r.conta ?? ""}`;

  // Número da conta: o campo lido, ou qualquer número solto do texto do
  // comprovante quando a IA não separou os campos.
  const numerosDoTexto = texto.match(/\d[\d.\-]{3,}/g) ?? [];
  const porConta = contas.filter(
    (c) =>
      digitos(c.accountNumber).length >= 4 &&
      (mesmoNumero(c.accountNumber, r.conta) || numerosDoTexto.some((n) => mesmoNumero(c.accountNumber, n))),
  );
  if (porConta.length === 1) return porConta[0].id;

  const porAgencia = contas.filter(
    (c) => mesmoNumero(c.agency, r.agencia) && mesmoBanco(c.bankName ?? c.name, r.banco ?? r.contaDebitada),
  );
  if (porAgencia.length === 1) return porAgencia[0].id;

  const porBanco = contas.filter((c) => mesmoBanco(c.bankName ?? c.name, r.banco ?? r.contaDebitada));
  if (porBanco.length === 1) return porBanco[0].id;

  return null;
}

/**
 * Palavras que não identificam ninguém: forma societária, conectivo e termo
 * genérico de ramo. Duas empresas diferentes compartilham "comércio" ou
 * "condomínio" sem serem a mesma — quem identifica é o nome próprio.
 */
const PALAVRAS_GENERICAS = new Set([
  // Conectivos que sobram nos nomes ("dos Reis", "de Souza").
  "dos",
  "das",
  "com",
  "ltda",
  "me",
  "epp",
  "eireli",
  "cia",
  "sociedade",
  "empresa",
  "comercio",
  "comercial",
  "servico",
  "servicos",
  "distribuidora",
  "industria",
  "condominio",
  "edificio",
  "banco",
  "brasil",
  "nacional",
  "veiculos",
  "automoveis",
  "transportes",
  "pagamento",
  "pagamentos",
  "titulo",
  "boleto",
]);

/**
 * Palavras que identificam um nome: 3+ letras/dígitos e não genéricas. Três
 * caracteres porque muito fornecedor é sigla ("PMZ", "L.F."), e é justamente a
 * sigla que identifica.
 */
function palavrasFortes(nome: string | null | undefined): string[] {
  return (nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !PALAVRAS_GENERICAS.has(w));
}

/**
 * O beneficiário do comprovante é quem devia receber? Basta UMA palavra forte
 * em comum ("Bahrein" em "Condomínio Edifício Bahrein" × "MJr Cond. Bahrein
 * apt 701"): o objetivo é avisar quando o dinheiro claramente foi para outro,
 * não implicar com a forma como o banco escreve o nome.
 *
 * Só as PARTES CADASTRADAS (fornecedor, beneficiário, sócio) autorizam a
 * acusação: título sem ninguém no cadastro devolve `null` — silêncio —, porque
 * uma descrição como "Taxa 09/2026" não é nome de gente. A descrição entra só
 * para CONFIRMAR o encontro, nunca para negá-lo. `null` também quando o
 * comprovante não trouxe o nome legível.
 */
export function beneficiarioBate(
  beneficiario: string | null | undefined,
  partesDoTitulo: (string | null | undefined)[],
  descricaoDoTitulo?: string | null,
): boolean | null {
  const doComprovante = palavrasFortes(beneficiario);
  if (doComprovante.length === 0) return null;
  const nomeadas = new Set(partesDoTitulo.flatMap((p) => palavrasFortes(p)));
  if (nomeadas.size === 0) return null;
  const doTitulo = new Set([...nomeadas, ...palavrasFortes(descricaoDoTitulo)]);
  return doComprovante.some((w) => doTitulo.has(w));
}

/** CPF/CNPJ comparável: só dígitos, e só quando completo (11 ou 14). */
function documentoKey(v: string | null | undefined): string | null {
  const d = digitos(v);
  return d.length === 11 || d.length === 14 ? d : null;
}

/**
 * O beneficiário do comprovante confere com o do título?
 *
 * O CPF/CNPJ manda: em Pix a chave costuma SER o documento do favorecido, e
 * documento igual encerra a conferência mesmo que os nomes estejam escritos de
 * formas diferentes ("Jose F Reis Jr" × "Jose Faustino dos Reis Jr").
 * Documento diferente é a acusação mais forte que existe aqui. Sem documento
 * dos dois lados, cai na comparação por nome.
 */
export function beneficiarioConfere(
  comprovante: { nome?: string | null; documento?: string | null },
  titulo: {
    partes: { nome?: string | null; documento?: string | null }[];
    descricao?: string | null;
  },
): { bate: boolean | null; porDocumento: boolean } {
  const doc = documentoKey(comprovante.documento);
  const docsDoTitulo = titulo.partes.map((p) => documentoKey(p.documento)).filter(Boolean) as string[];
  if (doc && docsDoTitulo.length > 0) {
    return { bate: docsDoTitulo.includes(doc), porDocumento: true };
  }
  return {
    bate: beneficiarioBate(
      comprovante.nome,
      titulo.partes.map((p) => p.nome),
      titulo.descricao,
    ),
    porDocumento: false,
  };
}

export type ConferenciaComprovante = {
  /** Diferença entre o comprovante e o título (positiva = pagou mais). */
  diferenca: number;
  /** Frases do que a conferência achou — vão para a observação e para a tela. */
  avisos: string[];
};

/**
 * Confere o comprovante com o título: valor, data e beneficiário. Nada aqui
 * bloqueia — o que saiu do banco é o que vale; a conferência serve para o
 * usuário ver a diferença antes de dar o ok.
 */
export function conferirComprovante(
  titulo: {
    amount: number;
    dueDate: Date;
    description: string;
    /** Quem está ligado ao título (fornecedor, beneficiário, sócio do capital). */
    partes?: { nome?: string | null; documento?: string | null }[];
    /** Como chamar o que está sendo pago nos avisos ("título" ou "combo"). */
    rotulo?: string;
  },
  comprovante: {
    valor: number;
    data: Date;
    beneficiario?: string | null;
    documentoBeneficiario?: string | null;
    formaPagamento?: string | null;
  },
): ConferenciaComprovante {
  const avisos: string[] = [];
  const rotulo = titulo.rotulo || "título";
  const diferenca = round2(comprovante.valor - titulo.amount);
  if (Math.abs(diferenca) > 0.005) {
    avisos.push(
      diferenca > 0
        ? `${rotulo} ${formatCurrency(titulo.amount)} · comprovante ${formatCurrency(comprovante.valor)} (${formatCurrency(diferenca)} a mais — juros/multa?)`
        : `${rotulo} ${formatCurrency(titulo.amount)} · comprovante ${formatCurrency(comprovante.valor)} (${formatCurrency(-diferenca)} a menos — desconto?)`,
    );
  }
  const atraso = Math.round(
    (Date.UTC(comprovante.data.getUTCFullYear(), comprovante.data.getUTCMonth(), comprovante.data.getUTCDate()) -
      Date.UTC(titulo.dueDate.getUTCFullYear(), titulo.dueDate.getUTCMonth(), titulo.dueDate.getUTCDate())) /
      86400000,
  );
  if (atraso > 0) avisos.push(`pago ${atraso} dia(s) depois do vencimento (${formatDate(titulo.dueDate)})`);
  // Beneficiário: o dinheiro foi para quem devia? Só avisa quando dá para
  // afirmar que NÃO bate — nome ilegível ou título sem parte cadastrada fica
  // em silêncio em vez de gerar alarme falso.
  const { bate, porDocumento } = beneficiarioConfere(
    { nome: comprovante.beneficiario, documento: comprovante.documentoBeneficiario },
    { partes: titulo.partes ?? [], descricao: titulo.description },
  );
  if (bate === false) {
    avisos.push(
      porDocumento
        ? `pago a "${comprovante.beneficiario ?? "outro favorecido"}" (CPF/CNPJ ${comprovante.documentoBeneficiario}), que não é o do beneficiário do título — confira se o comprovante é deste título`
        : `pago a "${comprovante.beneficiario}", que não bate com o beneficiário do título — confira se o comprovante é deste título`,
    );
  }
  return { diferenca, avisos };
}

/**
 * Põe o título na fila: guarda data, valor e conta do comprovante. Não mexe em
 * status nem em saldo — isso só acontece no ok, com o caixa do dia aberto.
 */
export async function enfileirarPagamento(input: {
  payableId: string;
  data: Date;
  valor: number;
  accountId: string | null;
  nota: string | null;
  /**
   * Marca do lote quando um boleto só cobre vários títulos — a mesma para
   * todos eles, e as telas da fila os mostram numa linha só. Sem lote (o
   * padrão) a marca é apagada: pré-lançar o título de novo, sozinho, o tira
   * do grupo em que estava.
   */
  lote?: string | null;
}) {
  await prisma.payable.update({
    where: { id: input.payableId },
    data: {
      pendingPaymentDate: input.data,
      pendingPaymentAmount: round2(input.valor),
      pendingPaymentAccountId: input.accountId,
      pendingPaymentNote: input.nota,
      pendingPaymentBatch: input.lote ?? null,
    },
  });
}

/** Põe o COMBO na fila: o borderô inteiro espera o movimento chegar no dia. */
export async function enfileirarCombo(input: {
  comboId: string;
  data: Date;
  valor: number;
  accountId: string | null;
  nota: string | null;
}) {
  await prisma.paymentCombo.update({
    where: { id: input.comboId },
    data: {
      pendingPaymentDate: input.data,
      pendingPaymentAmount: round2(input.valor),
      pendingPaymentAccountId: input.accountId,
      pendingPaymentNote: input.nota,
    },
  });
}

/** Tira o combo da fila (sem baixar nada). */
export async function desenfileirarCombo(comboId: string) {
  await prisma.paymentCombo.update({
    where: { id: comboId },
    data: {
      pendingPaymentDate: null,
      pendingPaymentAmount: null,
      pendingPaymentAccountId: null,
      pendingPaymentNote: null,
    },
  });
}

/** Tira o título da fila (sem baixar nada). */
export async function desenfileirarPagamento(payableId: string) {
  await prisma.payable.update({
    where: { id: payableId },
    data: {
      pendingPaymentDate: null,
      pendingPaymentAmount: null,
      pendingPaymentAccountId: null,
      pendingPaymentNote: null,
      pendingPaymentBatch: null,
    },
  });
}

export type PagamentoNaFila = {
  id: string;
  /**
   * Título avulso, COMBO (borderô), LOTE (um boleto só pago por vários títulos)
   * ou RECEBIMENTO. Combo e lote entram na fila como UMA linha e o ok baixa
   * todos os títulos deles juntos — a diferença é que o combo é um borderô
   * montado antes, e o lote nasce do comprovante único no ato do pagamento.
   */
  kind: "titulo" | "combo" | "lote" | "recebimento";
  /**
   * Dinheiro que SAI (pagamento) ou que ENTRA (recebimento). É o que decide o
   * sinal na tela e o lado da baixa quando o ok é dado.
   */
  direcao: "saida" | "entrada";
  orderNumber: number;
  description: string;
  supplierName: string | null;
  /** Quantos títulos o combo carrega (1 no título avulso). */
  titulos: number;
  /** Para onde a linha aponta na tela (ordem de pagamento ou borderô). */
  href: string;
  /** Valor que saiu do banco (o do comprovante). */
  amount: number;
  /** Valor registrado no título/combo, quando diferente do comprovante. */
  tituloAmount: number;
  dueDate: string;
  /** Data do comprovante. */
  paidAt: string;
  accountId: string | null;
  accountName: string | null;
  note: string | null;
  /**
   * Títulos que a linha cobre, no LOTE: a tela mostra o total do boleto e abre
   * nesta lista. Vazio em tudo o mais — no combo os títulos estão no borderô.
   */
  itens?: PagamentoNaFila[];
  /**
   * Nasceu no movimento de caixa (não é título do Contas a pagar/receber):
   * tirar da fila APAGA o lançamento, em vez de devolvê-lo para a lista.
   */
  avulso?: boolean;
};

/** Campos do pré-lançamento que as duas listas (deste caixa e adiante) mostram. */
const FILA_SELECT = {
  id: true,
  orderNumber: true,
  description: true,
  amount: true,
  dueDate: true,
  pendingPaymentDate: true,
  pendingPaymentAmount: true,
  pendingPaymentNote: true,
  pendingPaymentAccountId: true,
  pendingPaymentAccount: { select: { name: true } },
  pendingPaymentBatch: true,
  avulso: true,
  supplier: { select: { name: true } },
} as const;

type FilaRow = {
  id: string;
  orderNumber: number;
  description: string;
  amount: number;
  dueDate: Date;
  pendingPaymentDate: Date | null;
  pendingPaymentAmount: number | null;
  pendingPaymentNote: string | null;
  pendingPaymentAccountId: string | null;
  pendingPaymentAccount: { name: string } | null;
  pendingPaymentBatch: string | null;
  avulso: boolean;
  supplier: { name: string } | null;
};

function toPagamento(p: FilaRow): PagamentoNaFila {
  return {
    id: p.id,
    kind: "titulo",
    direcao: "saida",
    orderNumber: p.orderNumber,
    description: p.description,
    supplierName: p.supplier?.name ?? null,
    titulos: 1,
    href: `/financeiro/a-pagar/${p.id}/ordem`,
    amount: p.pendingPaymentAmount ?? p.amount,
    tituloAmount: p.amount,
    dueDate: p.dueDate.toISOString(),
    paidAt: p.pendingPaymentDate!.toISOString(),
    accountId: p.pendingPaymentAccountId,
    accountName: p.pendingPaymentAccount?.name ?? null,
    note: p.pendingPaymentNote,
    avulso: p.avulso,
  };
}

/**
 * Junta num LOTE os títulos pagos com o mesmo boleto.
 *
 * A fatura mensal da comunicação de venda cobra um veículo por linha e é paga
 * de uma vez: listar as trinta linhas soltas esconde justamente o que importa,
 * que é o valor do boleto. Então elas viram uma linha com o total, que abre
 * nos títulos cobertos — e o ok baixa todos juntos, como no combo.
 *
 * Lote de um título só não é lote: volta a ser a linha normal dele (pode ter
 * sobrado sozinho porque os outros já foram baixados).
 */
function agruparLotes(rows: FilaRow[]): PagamentoNaFila[] {
  const grupos = new Map<string, FilaRow[]>();
  const soltos: FilaRow[] = [];
  for (const r of rows) {
    if (!r.pendingPaymentBatch) {
      soltos.push(r);
      continue;
    }
    const lista = grupos.get(r.pendingPaymentBatch) ?? [];
    lista.push(r);
    grupos.set(r.pendingPaymentBatch, lista);
  }

  const linhas: PagamentoNaFila[] = soltos.map(toPagamento);
  for (const [batch, titulos] of grupos) {
    if (titulos.length === 1) {
      linhas.push(toPagamento(titulos[0]));
      continue;
    }
    // Ordem de leitura do boleto: pelo vencimento, e o nº da ordem desempata.
    const itens = titulos
      .map(toPagamento)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.orderNumber - b.orderNumber);
    const fornecedores = new Set(itens.map((i) => i.supplierName ?? ""));
    linhas.push({
      // O id do lote não é o de nenhum título: quem confirma expande a lista.
      id: `lote:${batch}`,
      kind: "lote",
      direcao: "saida",
      orderNumber: 0,
      description: `Boleto pago em lote · ${itens.length} títulos`,
      supplierName: fornecedores.size === 1 ? (itens[0].supplierName ?? null) : null,
      titulos: itens.length,
      href: itens[0].href,
      amount: round2(itens.reduce((s, i) => s + i.amount, 0)),
      tituloAmount: round2(itens.reduce((s, i) => s + i.tituloAmount, 0)),
      // Vencimento da linha: o mais antigo do lote — é o que diz se atrasou.
      dueDate: itens.reduce((menor, i) => (i.dueDate < menor ? i.dueDate : menor), itens[0].dueDate),
      paidAt: itens[0].paidAt,
      accountId: itens[0].accountId,
      accountName: itens[0].accountName,
      // A conferência do comprovante é do lote inteiro: a nota é a mesma em
      // todos os títulos, então mostrar a do primeiro basta.
      note: itens[0].note,
      itens,
    });
  }
  return linhas;
}

/** Campos do combo pré-lançado que as listas mostram. */
const COMBO_SELECT = {
  id: true,
  name: true,
  pendingPaymentDate: true,
  pendingPaymentAmount: true,
  pendingPaymentNote: true,
  pendingPaymentAccountId: true,
  pendingPaymentAccount: { select: { name: true } },
  user: { select: { name: true } },
  payables: {
    where: { status: { not: "PAGO" as const } },
    select: { amount: true, dueDate: true },
  },
} as const;

type ComboRow = {
  id: string;
  name: string;
  pendingPaymentDate: Date | null;
  pendingPaymentAmount: number | null;
  pendingPaymentNote: string | null;
  pendingPaymentAccountId: string | null;
  pendingPaymentAccount: { name: string } | null;
  user: { name: string } | null;
  payables: { amount: number; dueDate: Date }[];
};

function comboToPagamento(c: ComboRow): PagamentoNaFila {
  const total = round2(c.payables.reduce((s, p) => s + p.amount, 0));
  // Vencimento da linha: o mais antigo do combo — é o que diz se atrasou.
  const vencimento = c.payables.reduce<Date | null>(
    (menor, p) => (!menor || p.dueDate < menor ? p.dueDate : menor),
    null,
  );
  return {
    id: c.id,
    kind: "combo",
    direcao: "saida",
    orderNumber: 0,
    description: `Combo ${c.name}`,
    supplierName: c.user ? `montado por ${c.user.name}` : null,
    titulos: c.payables.length,
    href: `/financeiro/combos/${c.id}`,
    amount: c.pendingPaymentAmount ?? total,
    tituloAmount: total,
    dueDate: (vencimento ?? c.pendingPaymentDate ?? new Date()).toISOString(),
    paidAt: c.pendingPaymentDate!.toISOString(),
    accountId: c.pendingPaymentAccountId,
    accountName: c.pendingPaymentAccount?.name ?? null,
    note: c.pendingPaymentNote,
  };
}

/** Campos do recebimento pré-lançado que as listas mostram. */
const RECEBIMENTO_SELECT = {
  id: true,
  description: true,
  amount: true,
  dueDate: true,
  pendingReceiptDate: true,
  pendingReceiptAmount: true,
  pendingReceiptNote: true,
  pendingReceiptAccountId: true,
  pendingReceiptAccount: { select: { name: true } },
  avulso: true,
  customer: { select: { name: true } },
} as const;

type RecebimentoRow = {
  id: string;
  description: string;
  amount: number;
  dueDate: Date;
  pendingReceiptDate: Date | null;
  pendingReceiptAmount: number | null;
  pendingReceiptNote: string | null;
  pendingReceiptAccountId: string | null;
  pendingReceiptAccount: { name: string } | null;
  avulso: boolean;
  customer: { name: string } | null;
};

function toRecebimento(r: RecebimentoRow): PagamentoNaFila {
  return {
    id: r.id,
    kind: "recebimento",
    direcao: "entrada",
    // Título a receber não tem número de ordem (só o a pagar tem): a linha
    // aparece pela descrição.
    orderNumber: 0,
    description: r.description,
    supplierName: r.customer?.name ?? null,
    titulos: 1,
    href: `/financeiro/a-receber/${r.id}/editar`,
    amount: r.pendingReceiptAmount ?? r.amount,
    tituloAmount: r.amount,
    dueDate: r.dueDate.toISOString(),
    paidAt: r.pendingReceiptDate!.toISOString(),
    accountId: r.pendingReceiptAccountId,
    accountName: r.pendingReceiptAccount?.name ?? null,
    note: r.pendingReceiptNote,
    avulso: r.avulso,
  };
}

/**
 * Põe o RECEBIMENTO na fila: o dinheiro já caiu na conta (o cliente avisou, o
 * extrato mostrou, o comprovante chegou) e espera o movimento alcançar o dia.
 */
export async function enfileirarRecebimento(input: {
  receivableId: string;
  data: Date;
  valor: number;
  accountId: string;
  nota: string | null;
}) {
  await prisma.receivable.update({
    where: { id: input.receivableId },
    data: {
      pendingReceiptDate: input.data,
      pendingReceiptAmount: round2(input.valor),
      pendingReceiptAccountId: input.accountId,
      pendingReceiptNote: input.nota,
    },
  });
}

/** Tira o recebimento da fila (sem creditar nada). */
export async function desenfileirarRecebimento(receivableId: string) {
  await prisma.receivable.update({
    where: { id: receivableId },
    data: {
      pendingReceiptDate: null,
      pendingReceiptAmount: null,
      pendingReceiptAccountId: null,
      pendingReceiptNote: null,
    },
  });
}

/** Fim do dia (23:59:59 UTC) da data de trabalho. */
function fimDoDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59));
}

/** Um dia à frente do movimento, com o que já saiu do banco naquele dia. */
export type DiaAdiante = {
  /** ISO da data do pagamento/recebimento. */
  date: string;
  /** Quanto SAIU neste dia (pagamentos e combos). */
  total: number;
  /** Quanto ENTROU neste dia (recebimentos informados). */
  totalEntradas: number;
  pagamentos: PagamentoNaFila[];
};

/**
 * Pagamentos já feitos em dias À FRENTE do movimento aberto.
 *
 * O caixa está no dia 08 e a conta foi paga hoje, dia 09: o dinheiro já saiu do
 * banco, mas o pré-lançamento só pode ser confirmado quando o movimento chegar
 * no dia 09 (todo lançamento tem a data do caixa aberto). Sem esta lista, esse
 * dinheiro ficava invisível em Contas e caixas — a tela mostrava o saldo de
 * ontem sem dizer que R$ 3.018,06 já tinham saído hoje.
 *
 * É só informação: nada aqui pode ser confirmado, porque o movimento daquele
 * dia ainda não foi aberto. Ao abrir, os mesmos pagamentos aparecem na fila de
 * sempre, com o ok para debitar.
 *
 * Sem caixa aberto, mostra tudo o que está pré-lançado.
 */
export async function pagamentosAdiante(workDate: Date | null): Promise<DiaAdiante[]> {
  const quando = workDate ? { gt: fimDoDia(workDate) } : { not: null };
  const [rows, combos, recebimentos] = await Promise.all([
    prisma.payable.findMany({
      where: { status: { not: "PAGO" }, pendingPaymentDate: quando },
      orderBy: { pendingPaymentDate: "asc" },
      select: FILA_SELECT,
    }),
    prisma.paymentCombo.findMany({
      where: { status: { notIn: ["PAGO", "CANCELADO"] }, pendingPaymentDate: quando },
      orderBy: { pendingPaymentDate: "asc" },
      select: COMBO_SELECT,
    }),
    prisma.receivable.findMany({
      where: { status: { not: "RECEBIDO" }, pendingReceiptDate: quando },
      orderBy: { pendingReceiptDate: "asc" },
      select: RECEBIMENTO_SELECT,
    }),
  ]);

  const porDia = new Map<string, PagamentoNaFila[]>();
  for (const p of [
    ...agruparLotes(rows),
    ...combos.map(comboToPagamento),
    ...recebimentos.map(toRecebimento),
  ]) {
    const dia = p.paidAt.slice(0, 10);
    const lista = porDia.get(dia) ?? [];
    lista.push(p);
    porDia.set(dia, lista);
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, pagamentos]) => ({
      date: `${dia}T12:00:00.000Z`,
      // Saídas e entradas contadas em separado: somar tudo num número só
      // esconderia os dois lados do dia.
      total: round2(
        pagamentos.filter((p) => p.direcao === "saida").reduce((s, p) => s + p.amount, 0),
      ),
      totalEntradas: round2(
        pagamentos.filter((p) => p.direcao === "entrada").reduce((s, p) => s + p.amount, 0),
      ),
      pagamentos,
    }));
}

/**
 * Quanto cada conta ainda vai perder para os pré-lançamentos — o dinheiro que
 * já saiu do banco e espera o ok do caixa.
 *
 * O saldo das contas só muda na BAIXA, então enquanto o movimento não alcança
 * o dia do pagamento a conta mostra um saldo que o banco já não tem. Este é o
 * desconto que falta aplicar, para a tela poder mostrar, discreto, o saldo
 * previsto ao lado do saldo de hoje.
 *
 * O valor é o que a BAIXA vai debitar: no título avulso, o do comprovante (é
 * ele que passa a valer); no combo, a soma dos títulos (o borderô é pago pelo
 * valor deles, e a diferença do comprovante fica no aviso, para ser corrigida
 * antes do ok).
 */
export async function debitosPrelancados(): Promise<{
  /** accountId → saldo do pré-lançado: negativo debita, positivo credita. */
  porConta: Map<string, number>;
  /** Pré-lançado cuja conta ainda não foi identificada (sai de alguma conta). */
  semConta: number;
}> {
  const [titulos, combos, recebimentos] = await Promise.all([
    prisma.payable.findMany({
      where: { status: { not: "PAGO" }, pendingPaymentDate: { not: null } },
      select: { amount: true, pendingPaymentAmount: true, pendingPaymentAccountId: true },
    }),
    prisma.paymentCombo.findMany({
      where: {
        status: { notIn: ["PAGO", "CANCELADO"] },
        pendingPaymentDate: { not: null },
      },
      select: {
        pendingPaymentAccountId: true,
        payables: { where: { status: { not: "PAGO" } }, select: { amount: true } },
      },
    }),
    prisma.receivable.findMany({
      where: { status: { not: "RECEBIDO" }, pendingReceiptDate: { not: null } },
      select: { amount: true, pendingReceiptAmount: true, pendingReceiptAccountId: true },
    }),
  ]);

  const porConta = new Map<string, number>();
  let semConta = 0;
  const somar = (accountId: string | null, valor: number) => {
    if (!accountId) {
      semConta = round2(semConta + valor);
      return;
    }
    porConta.set(accountId, round2((porConta.get(accountId) ?? 0) + valor));
  };
  // Saídas entram negativas e entradas positivas: o que a tela mostra é o
  // efeito líquido no saldo da conta quando o caixa alcançar esses dias.
  for (const t of titulos) somar(t.pendingPaymentAccountId, -(t.pendingPaymentAmount ?? t.amount));
  for (const c of combos) {
    somar(c.pendingPaymentAccountId, -round2(c.payables.reduce((s, p) => s + p.amount, 0)));
  }
  for (const r of recebimentos) {
    somar(r.pendingReceiptAccountId, r.pendingReceiptAmount ?? r.amount);
  }
  return { porConta, semConta };
}

/**
 * Pré-lançamentos que o caixa deste dia já pode confirmar: tudo o que foi pago
 * ATÉ a data de trabalho. Pagamento de dia anterior que ficou para trás
 * continua aparecendo — não some por ter perdido o dia.
 */
export async function pagamentosNaFila(workDate: Date | null): Promise<PagamentoNaFila[]> {
  if (!workDate) return [];
  const quando = { not: null, lte: fimDoDia(workDate) } as const;
  const [rows, combos, recebimentos] = await Promise.all([
    prisma.payable.findMany({
      where: { status: { not: "PAGO" }, pendingPaymentDate: quando },
      orderBy: { pendingPaymentDate: "asc" },
      select: FILA_SELECT,
    }),
    prisma.paymentCombo.findMany({
      where: { status: { notIn: ["PAGO", "CANCELADO"] }, pendingPaymentDate: quando },
      orderBy: { pendingPaymentDate: "asc" },
      select: COMBO_SELECT,
    }),
    prisma.receivable.findMany({
      where: { status: { not: "RECEBIDO" }, pendingReceiptDate: quando },
      orderBy: { pendingReceiptDate: "asc" },
      select: RECEBIMENTO_SELECT,
    }),
  ]);
  return [
    ...agruparLotes(rows),
    ...combos.map(comboToPagamento),
    ...recebimentos.map(toRecebimento),
  ].sort((a, b) => a.paidAt.localeCompare(b.paidAt));
}

/** Quantos pré-lançamentos esperam o caixa deste dia (para o aviso na tela). */
export async function contarPagamentosNaFila(workDate: Date | null): Promise<number> {
  if (!workDate) return 0;
  const fim = new Date(
    Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 23, 59, 59),
  );
  const [titulos, combos, recebimentos] = await Promise.all([
    prisma.payable.count({
      where: { status: { not: "PAGO" }, pendingPaymentDate: { not: null, lte: fim } },
    }),
    prisma.paymentCombo.count({
      where: {
        status: { notIn: ["PAGO", "CANCELADO"] },
        pendingPaymentDate: { not: null, lte: fim },
      },
    }),
    prisma.receivable.count({
      where: { status: { not: "RECEBIDO" }, pendingReceiptDate: { not: null, lte: fim } },
    }),
  ]);
  return titulos + combos + recebimentos;
}

/**
 * Prepara o título para a baixa do pré-lançamento: o valor passa a ser o do
 * COMPROVANTE (é o que saiu do banco) e o desconto guardado do boleto é
 * limpo — se o desconto já estava no valor pago, aplicá-lo de novo cobraria
 * duas vezes; se não estava, o banco não o concedeu. A divergência vai para a
 * observação, com a data do comprovante quando ela difere da data do caixa.
 */
export async function prepararBaixaDaFila(payableId: string, workDate: Date) {
  const p = await prisma.payable.findUniqueOrThrow({
    where: { id: payableId },
    select: {
      amount: true,
      notes: true,
      pendingPaymentAmount: true,
      pendingPaymentDate: true,
      pendingPaymentNote: true,
    },
  });
  const valor = p.pendingPaymentAmount ?? p.amount;
  const partes: string[] = [];
  if (Math.abs(round2(valor - p.amount)) > 0.005) {
    partes.push(
      `Baixado pelo valor do comprovante (${formatCurrency(valor)}); o título estava em ${formatCurrency(p.amount)}.`,
    );
  }
  if (p.pendingPaymentDate) {
    const mesmoDia =
      Date.UTC(p.pendingPaymentDate.getUTCFullYear(), p.pendingPaymentDate.getUTCMonth(), p.pendingPaymentDate.getUTCDate()) ===
      Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate());
    if (!mesmoDia) {
      partes.push(
        `Comprovante do banco em ${formatDate(p.pendingPaymentDate)}; baixado no caixa de ${formatDate(workDate)}.`,
      );
    }
  }
  if (p.pendingPaymentNote) partes.push(`Conferência do comprovante: ${p.pendingPaymentNote}.`);
  const notes = [p.notes?.trim() || null, partes.join(" ") || null].filter(Boolean).join(" — ") || null;
  await prisma.payable.update({
    where: { id: payableId },
    data: { amount: round2(valor), notes, discountAmount: null, discountUntil: null },
  });
}
