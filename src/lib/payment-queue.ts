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
}) {
  await prisma.payable.update({
    where: { id: input.payableId },
    data: {
      pendingPaymentDate: input.data,
      pendingPaymentAmount: round2(input.valor),
      pendingPaymentAccountId: input.accountId,
      pendingPaymentNote: input.nota,
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
    },
  });
}

export type PagamentoNaFila = {
  id: string;
  /**
   * Título avulso ou COMBO (borderô). O combo é pago de uma vez só: ele entra
   * na fila como UMA linha, e o ok baixa todos os títulos dele juntos.
   */
  kind: "titulo" | "combo";
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
  supplier: { name: string } | null;
};

function toPagamento(p: FilaRow): PagamentoNaFila {
  return {
    id: p.id,
    kind: "titulo",
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
  };
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

/** Fim do dia (23:59:59 UTC) da data de trabalho. */
function fimDoDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59));
}

/** Um dia à frente do movimento, com o que já saiu do banco naquele dia. */
export type DiaAdiante = {
  /** ISO da data do pagamento (o dia do comprovante). */
  date: string;
  total: number;
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
  const [rows, combos] = await Promise.all([
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
  ]);

  const porDia = new Map<string, PagamentoNaFila[]>();
  for (const p of [...rows.map(toPagamento), ...combos.map(comboToPagamento)]) {
    const dia = p.paidAt.slice(0, 10);
    const lista = porDia.get(dia) ?? [];
    lista.push(p);
    porDia.set(dia, lista);
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, pagamentos]) => ({
      date: `${dia}T12:00:00.000Z`,
      total: round2(pagamentos.reduce((s, p) => s + p.amount, 0)),
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
  /** accountId → total a debitar. */
  porConta: Map<string, number>;
  /** Pré-lançado cuja conta ainda não foi identificada (sai de alguma conta). */
  semConta: number;
}> {
  const [titulos, combos] = await Promise.all([
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
  for (const t of titulos) somar(t.pendingPaymentAccountId, t.pendingPaymentAmount ?? t.amount);
  for (const c of combos) {
    somar(c.pendingPaymentAccountId, round2(c.payables.reduce((s, p) => s + p.amount, 0)));
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
  const [rows, combos] = await Promise.all([
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
  ]);
  return [...rows.map(toPagamento), ...combos.map(comboToPagamento)].sort((a, b) =>
    a.paidAt.localeCompare(b.paidAt),
  );
}

/** Quantos pré-lançamentos esperam o caixa deste dia (para o aviso na tela). */
export async function contarPagamentosNaFila(workDate: Date | null): Promise<number> {
  if (!workDate) return 0;
  const fim = new Date(
    Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 23, 59, 59),
  );
  const [titulos, combos] = await Promise.all([
    prisma.payable.count({
      where: { status: { not: "PAGO" }, pendingPaymentDate: { not: null, lte: fim } },
    }),
    prisma.paymentCombo.count({
      where: {
        status: { notIn: ["PAGO", "CANCELADO"] },
        pendingPaymentDate: { not: null, lte: fim },
      },
    }),
  ]);
  return titulos + combos;
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
