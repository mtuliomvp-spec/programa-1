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
  titulo: { amount: number; dueDate: Date; description: string; supplierName?: string | null },
  comprovante: { valor: number; data: Date; beneficiario?: string | null },
): ConferenciaComprovante {
  const avisos: string[] = [];
  const diferenca = round2(comprovante.valor - titulo.amount);
  if (Math.abs(diferenca) > 0.005) {
    avisos.push(
      diferenca > 0
        ? `título ${formatCurrency(titulo.amount)} · comprovante ${formatCurrency(comprovante.valor)} (${formatCurrency(diferenca)} a mais — juros/multa?)`
        : `título ${formatCurrency(titulo.amount)} · comprovante ${formatCurrency(comprovante.valor)} (${formatCurrency(-diferenca)} a menos — desconto?)`,
    );
  }
  const atraso = Math.round(
    (Date.UTC(comprovante.data.getUTCFullYear(), comprovante.data.getUTCMonth(), comprovante.data.getUTCDate()) -
      Date.UTC(titulo.dueDate.getUTCFullYear(), titulo.dueDate.getUTCMonth(), titulo.dueDate.getUTCDate())) /
      86400000,
  );
  if (atraso > 0) avisos.push(`pago ${atraso} dia(s) depois do vencimento (${formatDate(titulo.dueDate)})`);
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
  orderNumber: number;
  description: string;
  supplierName: string | null;
  /** Valor que saiu do banco (o do comprovante). */
  amount: number;
  /** Valor registrado no título, quando diferente do comprovante. */
  tituloAmount: number;
  dueDate: string;
  /** Data do comprovante. */
  paidAt: string;
  accountId: string | null;
  accountName: string | null;
  note: string | null;
};

/**
 * Pré-lançamentos que o caixa deste dia já pode confirmar: tudo o que foi pago
 * ATÉ a data de trabalho. Pagamento de dia anterior que ficou para trás
 * continua aparecendo — não some por ter perdido o dia.
 */
export async function pagamentosNaFila(workDate: Date | null): Promise<PagamentoNaFila[]> {
  if (!workDate) return [];
  const fim = new Date(
    Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 23, 59, 59),
  );
  const rows = await prisma.payable.findMany({
    where: { status: { not: "PAGO" }, pendingPaymentDate: { not: null, lte: fim } },
    orderBy: { pendingPaymentDate: "asc" },
    select: {
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
    },
  });
  return rows.map((p) => ({
    id: p.id,
    orderNumber: p.orderNumber,
    description: p.description,
    supplierName: p.supplier?.name ?? null,
    amount: p.pendingPaymentAmount ?? p.amount,
    tituloAmount: p.amount,
    dueDate: p.dueDate.toISOString(),
    paidAt: p.pendingPaymentDate!.toISOString(),
    accountId: p.pendingPaymentAccountId,
    accountName: p.pendingPaymentAccount?.name ?? null,
    note: p.pendingPaymentNote,
  }));
}

/** Quantos pré-lançamentos esperam o caixa deste dia (para o aviso na tela). */
export async function contarPagamentosNaFila(workDate: Date | null): Promise<number> {
  if (!workDate) return 0;
  const fim = new Date(
    Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 23, 59, 59),
  );
  return prisma.payable.count({
    where: { status: { not: "PAGO" }, pendingPaymentDate: { not: null, lte: fim } },
  });
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
