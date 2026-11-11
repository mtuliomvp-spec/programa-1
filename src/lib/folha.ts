import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Folha mensal: o salário de cada funcionário é UM título a pagar por
 * competência ("10/2026"), com vencimento no dia 5 do mês seguinte. O valor do
 * título é o LÍQUIDO do holerite que a contabilidade manda; cada vale ou
 * adiantamento é um pagamento parcial desse título (o "Pagar parcial" do
 * Contas a pagar desmembra a parte paga — ela fica ligada ao título de origem
 * por `partialOfId`). Assim a folha soma: holerite = saldo + partes.
 */

export const RE_COMPETENCIA = /^(0[1-9]|1[0-2])\/(\d{4})$/;

export function competenciaDe(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function competenciaValida(c: string | undefined | null): c is string {
  return Boolean(c && RE_COMPETENCIA.test(c));
}

/** Competência deslocada em N meses ("10/2026", -1 → "09/2026"). */
export function somaMeses(c: string, n: number): string {
  const [, m, a] = c.match(RE_COMPETENCIA)!;
  return competenciaDe(new Date(Date.UTC(Number(a), Number(m) - 1 + n, 1, 12)));
}

/** Vencimento do salário da competência: dia 5 do mês seguinte. */
export function vencimentoDoSalario(c: string): Date {
  const [, m, a] = c.match(RE_COMPETENCIA)!;
  return new Date(Date.UTC(Number(a), Number(m), 5, 12));
}

/** Competência a que um título de salário vencido em `due` se refere (mês anterior). */
export function competenciaPeloVencimento(due: Date): string {
  return competenciaDe(new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth() - 1, 1, 12)));
}

export function descricaoDoSalario(nome: string, c: string): string {
  return `Salário ${nome} - ${c}`;
}

/** Nome sem acento, minúsculo, só letras — para casar o holerite com o cadastro. */
export function normalizarNome(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !["de", "da", "do", "das", "dos", "e"].includes(p));
}

/**
 * O nome do holerite é deste funcionário? Todas as palavras do nome cadastrado
 * precisam estar no nome completo do holerite ("João Itapary" casa com "JOAO
 * SALLES DE OLIVEIRA ITAPARY NETO").
 */
export function nomeCasa(cadastro: string, holerite: string): boolean {
  const a = normalizarNome(cadastro);
  const b = new Set(normalizarNome(holerite));
  return a.length > 0 && a.every((p) => b.has(p));
}

type TituloFolha = {
  id: string;
  orderNumber: number;
  description: string;
  amount: number;
  status: "PENDENTE" | "PAGO" | "ATRASADO";
  dueDate: Date;
  paymentDate: Date | null;
  partialOfId: string | null;
  paymentComboId: string | null;
  pendingPaymentDate: Date | null;
  notes: string | null;
};

export type SalarioDaFolha = {
  employeeId: string;
  titulo: TituloFolha;
  /** Vales/adiantamentos: as partes desmembradas do título. */
  partes: TituloFolha[];
  /** Valor do holerite (saldo + partes). */
  total: number;
  pago: number;
  aPagar: number;
};

const SELECT_TITULO = {
  id: true,
  orderNumber: true,
  description: true,
  amount: true,
  status: true,
  dueDate: true,
  paymentDate: true,
  partialOfId: true,
  paymentComboId: true,
  pendingPaymentDate: true,
  notes: true,
  employeeId: true,
} as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Os títulos de salário da competência, um por funcionário, com as partes já
 * pagas (vales). Aceita os títulos antigos sem competência gravada pela
 * descrição "Salário Fulano - 10/2026".
 */
export async function salariosDaCompetencia(c: string): Promise<Map<string, SalarioDaFolha>> {
  const raizes = await prisma.payable.findMany({
    where: {
      category: "SALARIO",
      employeeId: { not: null },
      partialOfId: null,
      OR: [
        { referencePeriod: c, categoryLabel: null },
        { referencePeriod: null, description: { startsWith: "Salário ", endsWith: ` - ${c}` } },
      ],
    },
    select: SELECT_TITULO,
    orderBy: { createdAt: "asc" },
  });

  // Partes (e partes de partes: um vale pago em duas vezes).
  const partesDe = new Map<string, TituloFolha[]>();
  let fronteira = raizes.map((r) => r.id);
  const raizDe = new Map(fronteira.map((id) => [id, id]));
  while (fronteira.length) {
    const filhos = await prisma.payable.findMany({ where: { partialOfId: { in: fronteira } }, select: SELECT_TITULO });
    for (const f of filhos) {
      const raiz = raizDe.get(f.partialOfId!)!;
      raizDe.set(f.id, raiz);
      partesDe.set(raiz, [...(partesDe.get(raiz) ?? []), f]);
    }
    fronteira = filhos.map((f) => f.id);
  }

  const out = new Map<string, SalarioDaFolha>();
  for (const t of raizes) {
    if (out.has(t.employeeId!)) continue; // um por funcionário (o mais antigo)
    const partes = (partesDe.get(t.id) ?? []).sort((a, b) => +a.dueDate - +b.dueDate);
    const todos = [t, ...partes];
    const total = r2(todos.reduce((s, x) => s + x.amount, 0));
    const pago = r2(todos.filter((x) => x.status === "PAGO").reduce((s, x) => s + x.amount, 0));
    out.set(t.employeeId!, { employeeId: t.employeeId!, titulo: t, partes, total, pago, aPagar: r2(total - pago) });
  }
  return out;
}

/** Líquido gravado pelo holerite nas observações do título ("… líquido R$ 1.976,06."). */
export function liquidoDoHolerite(notes: string | null | undefined): number | null {
  const m = notes?.match(/Holerite \d{2}\/\d{4}:[^\n]*?líquido R\$\s?([\d.]+,\d{2})/);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export type ParteDoSalario = {
  id: string;
  orderNumber: number;
  descricao: string;
  valor: number;
  pago: boolean;
  /**
   * Pagamento informado pelo "Já paguei" que espera o ok do caixa: o dinheiro
   * já saiu (nesta data), mas a baixa ainda não foi confirmada.
   */
  naFila: boolean;
  /** Pagamento (se pago ou na fila do caixa) ou vencimento. */
  data: Date;
  fornecedor: string | null;
  /** Vale vinculado (título de terceiro, ex.: boleto de fornecedor) × adiantamento (pagamento parcial). */
  vinculado: boolean;
};

/**
 * Adiantamentos e vales de um título de salário (todas as partes que saíram
 * dele, inclusive parte de parte), em ordem de data — para a ordem de
 * pagamento do saldo mostrar como se chega ao total do salário.
 */
export async function partesDoSalario(raizId: string): Promise<ParteDoSalario[]> {
  const out: ParteDoSalario[] = [];
  let fronteira = [raizId];
  while (fronteira.length) {
    const filhos = await prisma.payable.findMany({
      where: { partialOfId: { in: fronteira } },
      select: {
        id: true,
        orderNumber: true,
        description: true,
        amount: true,
        status: true,
        paymentDate: true,
        pendingPaymentDate: true,
        dueDate: true,
        categoryLabel: true,
        supplier: { select: { name: true } },
      },
    });
    for (const f of filhos) {
      const pago = f.status === "PAGO";
      const naFila = !pago && f.pendingPaymentDate != null;
      out.push({
        id: f.id,
        orderNumber: f.orderNumber,
        descricao: f.description,
        valor: f.amount,
        pago,
        naFila,
        data: pago ? (f.paymentDate ?? f.dueDate) : naFila ? f.pendingPaymentDate! : f.dueDate,
        fornecedor: f.supplier?.name ?? null,
        vinculado: f.categoryLabel === "Vale (adiantamento)" && !/\(pagamento parcial\)$/.test(f.description),
      });
    }
    fronteira = filhos.map((f) => f.id);
  }
  return out.sort((a, b) => +a.data - +b.data || a.orderNumber - b.orderNumber);
}
