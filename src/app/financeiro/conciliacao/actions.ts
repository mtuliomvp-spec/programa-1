"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { structuralCenterId } from "@/lib/structural";
import { decodeOfx, parseOfx } from "@/lib/ofx";
import { getDefaultAccountId } from "@/lib/accounts";
import {
  createExpensePayable,
  markPayablePaid,
  markReceivableReceived,
  resolveSupplierByName,
  settleFinancing,
  settleReturn,
  syncReceivableCapital,
} from "@/lib/finance";
import { assertCan } from "@/lib/guards";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { resolveDespesaCategory, resolveReceitaCategory } from "@/lib/categories";
import { effectiveStructuralKey, isStructuralKey } from "@/lib/structural-flows";

/**
 * Conciliação bancária: importa o extrato OFX, casa cada transação do
 * banco com uma (ou mais) contas do sistema e, ao confirmar, marca as contas
 * como conciliadas — dando baixa nas que ainda estavam pendentes, sempre com
 * a DATA DO EXTRATO e passando pelos mesmos caminhos de baixa do resto do
 * financeiro (para o capital, a fatura de cartão e o farol continuarem certos).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MATCH_WINDOW_DAYS = 7;
/** Janela maior na escolha manual: o usuário sabe o que está procurando. */
const PICK_WINDOW_DAYS = 30;

export type BankTxn = {
  fitId: string;
  date: string;
  amount: number;
  memo: string;
};

export type MatchCandidate = {
  kind: "payable" | "receivable";
  id: string;
  description: string;
  amount: number;
  date: string;
  settled: boolean; // já estava pago/recebido
  who: string | null; // fornecedor (saída) ou cliente (entrada)
};

export type MatchRow = {
  txn: BankTxn;
  status: "ja_conciliado" | "casou" | "sem_match";
  /** Títulos vinculados à linha do extrato (uma linha pode cobrir vários). */
  matches: MatchCandidate[];
};

export type ReconcileResult = { rows?: MatchRow[]; error?: string };

function centsEqual(a: number, b: number) {
  return Math.abs(Math.round(a * 100) - Math.round(b * 100)) <= 1;
}

function dayDiff(a: Date, isoB: string) {
  return Math.abs(a.getTime() - new Date(`${isoB}T12:00:00Z`).getTime()) / DAY_MS;
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Repasse do financiamento / retorno da financeira "RECEBIDO" na conta DA
 * FINANCEIRA mas ainda não transferido para a empresa (financerSettledAt /
 * returnSettledAt vazios na venda): para a CONCILIAÇÃO isso é PENDENTE — o
 * dinheiro ainda não andou no banco da empresa. Sem esta checagem a linha do
 * extrato aparecia como "Já baixada" com o recebimento ainda em aberto na tela
 * de Financiamentos. A confirmação faz a baixa de verdade via
 * settleFinancing/settleReturn (ver settleReceivable).
 */
type ReceivableFinInfo = {
  accountId: string | null;
  category: string;
  sale: {
    id: string;
    financerAccountId: string | null;
    financedAmount: number | null;
    financerSettledAt: Date | null;
    returnNet: number | null;
    returnSettledAt: Date | null;
  } | null;
};
const RECEIVABLE_FIN_SELECT = {
  accountId: true,
  category: true,
  sale: {
    select: {
      id: true,
      financerAccountId: true,
      financedAmount: true,
      financerSettledAt: true,
      returnNet: true,
      returnSettledAt: true,
    },
  },
} as const;
function pendingAtFinancer(rec: ReceivableFinInfo): boolean {
  const s = rec.sale;
  if (!s || !s.financerAccountId || rec.accountId !== s.financerAccountId) return false;
  if (rec.category === "VENDA_VEICULO") return !s.financerSettledAt && (s.financedAmount ?? 0) > 0;
  if (rec.category === "RETORNO_FINANCEIRA") return !s.returnSettledAt && (s.returnNet ?? 0) > 0;
  return false;
}

export async function parseAndMatchAction(formData: FormData): Promise<ReconcileResult> {
  try {
    await assertCan("financeiro", "conciliar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const file = formData.get("ofx");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o arquivo OFX exportado do seu banco." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "Arquivo muito grande (máximo 5 MB)." };
  }

  // Bytes crus + detecção de codificação: `file.text()` assume UTF-8 e quebra
  // os acentos dos extratos em Latin-1/Windows-1252.
  const content = decodeOfx(await file.arrayBuffer());
  const txns = parseOfx(content);
  if (txns.length === 0) {
    return { error: "Nenhuma transação encontrada no arquivo. Confirme se é um OFX válido." };
  }

  const dates = txns.map((t) => new Date(`${t.date}T12:00:00Z`).getTime());
  const rangeStart = new Date(Math.min(...dates) - MATCH_WINDOW_DAYS * DAY_MS);
  const rangeEnd = new Date(Math.max(...dates) + MATCH_WINDOW_DAYS * DAY_MS);

  const [payables, receivables] = await Promise.all([
    prisma.payable.findMany({
      where: { dueDate: { gte: rangeStart, lte: rangeEnd } },
      // Ordem fixa: com dois títulos do mesmo valor no mesmo dia, o casamento
      // automático precisa ser sempre o mesmo (o usuário confere e troca).
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        description: true,
        amount: true,
        dueDate: true,
        paymentDate: true,
        status: true,
        reconciledAt: true,
        bankRef: true,
        supplier: { select: { name: true } },
      },
    }),
    prisma.receivable.findMany({
      where: { dueDate: { gte: rangeStart, lte: rangeEnd } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      select: {
        id: true,
        description: true,
        amount: true,
        dueDate: true,
        receivedDate: true,
        status: true,
        reconciledAt: true,
        bankRef: true,
        customer: { select: { name: true } },
        ...RECEIVABLE_FIN_SELECT,
      },
    }),
  ]);

  const reconciledRefs = new Set(
    [...payables, ...receivables].map((r) => r.bankRef).filter(Boolean) as string[],
  );
  const used = new Set<string>();
  const rows: MatchRow[] = [];

  for (const txn of txns.sort((a, b) => a.date.localeCompare(b.date))) {
    if (reconciledRefs.has(txn.fitId)) {
      rows.push({ txn, status: "ja_conciliado", matches: [] });
      continue;
    }

    const isOut = txn.amount < 0;
    const target = Math.abs(txn.amount);

    const candidates = (isOut ? payables : receivables)
      .filter((c) => !used.has(c.id) && !c.reconciledAt && centsEqual(c.amount, target))
      .map((c) => {
        const settledDate = isOut
          ? (c as { paymentDate?: Date | null }).paymentDate
          : (c as { receivedDate?: Date | null }).receivedDate;
        const refDate = settledDate ?? c.dueDate;
        // Repasse/retorno parado na conta da financeira: ainda pendente de
        // verdade — a confirmação fará a transferência para a conta da empresa.
        const settled =
          Boolean(settledDate) && (isOut || !pendingAtFinancer(c as unknown as ReceivableFinInfo));
        return { c, diff: dayDiff(refDate, txn.date), settled };
      })
      .filter((x) => x.diff <= MATCH_WINDOW_DAYS)
      // Data mais próxima primeiro; empate → o já baixado (pura conciliação).
      // A ordem inversa (baixado primeiro) roubava o lugar do título certo:
      // tarifas recorrentes de mesmo valor faziam a linha casar com um título
      // PAGO de dias atrás e aparecer "Já baixada" com o do dia ainda pendente.
      .sort((a, b) => a.diff - b.diff || Number(b.settled) - Number(a.settled));

    let best = candidates[0];

    // Retorno da financeira: o banco costuma pagar centavos/reais diferente do
    // programado (arredondamentos e retenções da financeira) — o valor exato
    // nunca casa. Para entrada sem match exato, procura um retorno ainda parado
    // na conta da financeira com valor próximo (1% ou R$ 2). A confirmação
    // baixa pelo VALOR DO EXTRATO via settleReturn, que registra a diferença.
    if (!best && !isOut) {
      const near = receivables
        .filter(
          (r) =>
            !used.has(r.id) &&
            !r.reconciledAt &&
            r.category === "RETORNO_FINANCEIRA" &&
            pendingAtFinancer(r) &&
            Math.abs(r.amount - target) <= Math.max(2, r.amount * 0.01) &&
            dayDiff(r.dueDate, txn.date) <= MATCH_WINDOW_DAYS,
        )
        .sort((a, b) => Math.abs(a.amount - target) - Math.abs(b.amount - target));
      if (near[0]) best = { c: near[0], diff: dayDiff(near[0].dueDate, txn.date), settled: false };
    }
    if (best) {
      used.add(best.c.id);
      const who = isOut
        ? (best.c as { supplier?: { name: string } | null }).supplier?.name
        : (best.c as { customer?: { name: string } | null }).customer?.name;
      rows.push({
        txn,
        status: "casou",
        matches: [
          {
            kind: isOut ? "payable" : "receivable",
            id: best.c.id,
            description: best.c.description,
            amount: best.c.amount,
            date: isoDay(best.c.dueDate),
            settled: best.settled,
            who: who ?? null,
          },
        ],
      });
    } else {
      rows.push({ txn, status: "sem_match", matches: [] });
    }
  }

  return { rows };
}

// ---------------------------------------------------------------------------
// Escolher os títulos na mão (1 linha do extrato → 1 ou vários títulos).
// ---------------------------------------------------------------------------

/**
 * Lista os títulos em aberto (ou já baixados mas ainda não conciliados) perto da
 * data da transação, para o usuário conferir e escolher — inclusive somando
 * VÁRIOS títulos numa única linha do banco (um Pix que pagou duas contas).
 */
export async function searchTitlesAction(input: {
  kind: "payable" | "receivable";
  date: string;
  query?: string;
}): Promise<{ items?: MatchCandidate[]; error?: string }> {
  try {
    await assertCan("financeiro", "conciliar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const ref = new Date(`${input.date}T12:00:00Z`).getTime();
  if (!Number.isFinite(ref)) return { error: "Data inválida." };
  const gte = new Date(ref - PICK_WINDOW_DAYS * DAY_MS);
  const lte = new Date(ref + PICK_WINDOW_DAYS * DAY_MS);
  const q = (input.query || "").trim();

  if (input.kind === "payable") {
    const rows = await prisma.payable.findMany({
      where: {
        reconciledAt: null,
        // Só pendentes: título já baixado não deve ser sugerido na escolha —
        // a baixa dele já aconteceu por outro caminho, e marcá-lo aqui só
        // serviria para conciliação pura (raro) com risco de confusão.
        paymentDate: null,
        ...(q
          ? {
              OR: [
                { description: { contains: q, mode: "insensitive" } },
                { supplier: { name: { contains: q, mode: "insensitive" } } },
                { documentNumber: { contains: q, mode: "insensitive" } },
              ],
            }
          : { dueDate: { gte, lte } }),
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        description: true,
        amount: true,
        dueDate: true,
        paymentDate: true,
        supplier: { select: { name: true } },
      },
    });
    return {
      items: rows.map((p) => ({
        kind: "payable" as const,
        id: p.id,
        description: p.description,
        amount: p.amount,
        date: isoDay(p.dueDate),
        settled: Boolean(p.paymentDate),
        who: p.supplier?.name ?? null,
      })),
    };
  }

  const rows = await prisma.receivable.findMany({
    where: {
      reconciledAt: null,
      ...(q
        ? {
            OR: [
              { description: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { documentNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : { dueDate: { gte, lte } }),
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    // Margem para o filtro de pendentes abaixo (o corte fica no map final).
    take: 300,
    select: {
      id: true,
      description: true,
      amount: true,
      dueDate: true,
      receivedDate: true,
      customer: { select: { name: true } },
      ...RECEIVABLE_FIN_SELECT,
    },
  });
  return {
    items: rows
      // Só pendentes (como nas saídas). O filtro é aqui e não no where porque o
      // repasse/retorno "recebido" NA CONTA DA FINANCEIRA ainda está pendente
      // de verdade (aguarda a transferência) e precisa continuar aparecendo.
      .filter((r) => !r.receivedDate || pendingAtFinancer(r))
      .slice(0, 100)
      .map((r) => ({
        kind: "receivable" as const,
        id: r.id,
        description: r.description,
        amount: r.amount,
        date: isoDay(r.dueDate),
        settled: false,
        who: r.customer?.name ?? null,
      })),
  };
}

// ---------------------------------------------------------------------------
// Confirmar a conciliação (dando baixa pelos caminhos oficiais).
// ---------------------------------------------------------------------------

export type ConfirmItem = {
  fitId: string;
  /** Data do extrato (yyyy-mm-dd) — é ela que vira a data da baixa. */
  date: string;
  /** Valor da linha do banco (com sinal). */
  amount: number;
  kind: "payable" | "receivable";
  ids: string[];
};

export type ConfirmResult = { ok: boolean; done: number; error?: string };

/**
 * Marca as contas escolhidas como conciliadas e dá baixa nas pendentes.
 *
 * A baixa passa por `markPayablePaid` / `markReceivableReceived` (e não por um
 * update cru): são essas funções que lançam a retirada/aporte do capital,
 * fecham a fatura do cartão e atualizam a solicitação de compra. A data usada é
 * sempre a do EXTRATO — é o dia em que o dinheiro andou no banco.
 */
export async function confirmMatchesAction(
  items: ConfirmItem[],
  accountId?: string,
): Promise<ConfirmResult> {
  try {
    await assertCan("financeiro", "conciliar");
    await assertBooksBalanced();
  } catch (e) {
    return { ok: false, done: 0, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  if (!items.length) return { ok: false, done: 0, error: "Nenhuma transação selecionada." };

  const account = accountId || (await getDefaultAccountId());
  let done = 0;

  try {
    for (const item of items.slice(0, 500)) {
      if (!item.ids.length) continue;
      const when = new Date(`${item.date}T12:00:00Z`);
      await assertMonthOpen(when);

      const total = Math.abs(item.amount);

      // Retorno da financeira sozinho na linha: a financeira paga centavos/reais
      // diferente do programado, então a igualdade exata não vale aqui. A baixa
      // usa o VALOR DO EXTRATO — settleReturn transfere o programado e registra
      // a diferença (crédito administrativo ou falta via Banco Neutro).
      if (item.kind === "receivable" && item.ids.length === 1) {
        const rec = await prisma.receivable.findUnique({
          where: { id: item.ids[0] },
          select: { id: true, ...RECEIVABLE_FIN_SELECT },
        });
        if (rec && rec.category === "RETORNO_FINANCEIRA" && pendingAtFinancer(rec) && account) {
          await settleReturn(rec.sale!.id, account, total, when);
          await prisma.receivable.update({
            where: { id: rec.id },
            data: { reconciledAt: new Date(), bankRef: item.fitId },
          });
          done++;
          continue;
        }
      }

      // A soma dos títulos precisa fechar EXATO com a linha do banco — senão o
      // extrato e o sistema passam a contar valores diferentes.
      const titles =
        item.kind === "payable"
          ? await prisma.payable.findMany({
              where: { id: { in: item.ids } },
              select: { id: true, amount: true, status: true, description: true },
            })
          : await prisma.receivable.findMany({
              where: { id: { in: item.ids } },
              select: { id: true, amount: true, status: true, description: true },
            });
      if (titles.length !== item.ids.length) {
        return { ok: false, done, error: "Um dos títulos escolhidos não existe mais. Analise o extrato de novo." };
      }
      const sum = titles.reduce((s, t) => s + t.amount, 0);
      if (!centsEqual(sum, total)) {
        return {
          ok: false,
          done,
          error: `A soma dos títulos escolhidos não bate com a linha do banco (${sum.toFixed(2)} × ${total.toFixed(2)}).`,
        };
      }

      for (const t of titles) {
        if (item.kind === "payable") {
          // Já pago: não mexer na baixa original — só registrar a conciliação.
          if (t.status !== "PAGO") await markPayablePaid(t.id, when, account);
          await prisma.payable.update({
            where: { id: t.id },
            data: { reconciledAt: new Date(), bankRef: item.fitId },
          });
        } else {
          await settleReceivable(t.id, t.status, when, account, item.fitId);
        }
      }
      done++;
    }
  } catch (e) {
    return { ok: false, done, error: e instanceof Error ? e.message : "Não foi possível conciliar." };
  }

  revalidateAll();
  return { ok: true, done };
}

/**
 * Repasse do financiamento e retorno da financeira ficam RECEBIDO na conta DA
 * FINANCEIRA (é ela quem deve à empresa). Dar baixa é transferir esse valor
 * para a conta da empresa e marcar a venda como recebida — o que os botões
 * "dar baixa"/"Receber retorno" fazem via settleFinancing/settleReturn. Se a
 * conciliação só reescrevesse o accountId, o dinheiro até se moveria, mas
 * Sale.financerSettledAt/returnSettledAt não seriam setados e a tela de
 * Financiamentos continuaria oferecendo a baixa (risco de baixa dupla).
 */
async function settleReceivable(
  id: string,
  status: string,
  when: Date,
  account: string | null,
  fitId: string,
) {
  const rec = await prisma.receivable.findUnique({
    where: { id },
    select: {
      accountId: true,
      category: true,
      sale: {
        select: {
          id: true,
          financerAccountId: true,
          financedAmount: true,
          financerSettledAt: true,
          returnNet: true,
          returnSettledAt: true,
        },
      },
    },
  });
  const s = rec?.sale;
  const naFinanceira =
    !!s &&
    !!account &&
    !!s.financerAccountId &&
    rec!.accountId === s.financerAccountId &&
    account !== s.financerAccountId;
  const isRepasse =
    naFinanceira &&
    rec!.category === "VENDA_VEICULO" &&
    !s!.financerSettledAt &&
    !!s!.financedAmount &&
    s!.financedAmount > 0;
  const isRetorno =
    naFinanceira &&
    rec!.category === "RETORNO_FINANCEIRA" &&
    !s!.returnSettledAt &&
    !!s!.returnNet &&
    s!.returnNet > 0;

  if (isRepasse || isRetorno) {
    if (isRepasse) await settleFinancing(s!.id, account!, when);
    else await settleReturn(s!.id, account!, s!.returnNet!, when);
    // Baixa feita via transferência; o recebível continua na conta da
    // financeira. Só registramos a marca da conciliação.
    await prisma.receivable.update({
      where: { id },
      data: { reconciledAt: new Date(), bankRef: fitId },
    });
    return;
  }

  if (status !== "RECEBIDO") await markReceivableReceived(id, when, account);
  await prisma.receivable.update({
    where: { id },
    data: { reconciledAt: new Date(), bankRef: fitId },
  });
}

// ---------------------------------------------------------------------------
// Criar o lançamento que faltava, com o formulário completo.
// ---------------------------------------------------------------------------

export type CreateFromBankInput = {
  fitId: string;
  /** Data do extrato (yyyy-mm-dd). */
  date: string;
  /** Valor da linha do banco, com sinal (negativo = saída). */
  amount: number;
  description: string;
  categoryLabel: string;
  documentNumber?: string;
  structuralKey?: string;
  vehicleId?: string;
  capitalBeneficiaryId?: string;
  costCenterId?: string;
  /** Saída: fornecedor (cria se não existir). */
  supplierName?: string;
  /** Entrada: cliente já cadastrado. */
  customerId?: string;
  notes?: string;
  accountId?: string;
};

/**
 * Cria o título correspondente a uma linha do extrato que não existe no
 * sistema — já PAGO/RECEBIDO, na data do extrato e na conta do extrato. Usa os
 * mesmos caminhos do lançamento manual (`createExpensePayable`), então o custo
 * do veículo e a movimentação de capital nascem junto.
 */
export async function createFromBankTxnAction(
  input: CreateFromBankInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "conciliar");
    await assertBooksBalanced();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }

  const when = new Date(`${input.date}T12:00:00Z`);
  if (!Number.isFinite(when.getTime())) return { ok: false, error: "Data inválida." };
  try {
    await assertMonthOpen(when);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mês fechado." };
  }

  const description = (input.description || "").trim().slice(0, 180);
  if (!description) return { ok: false, error: "Informe a descrição." };
  const label = (input.categoryLabel || "").trim();
  if (!label) return { ok: false, error: "Informe a categoria." };

  // Clicar duas vezes (ou reimportar o mesmo arquivo) não pode duplicar.
  const [dupPayable, dupReceivable] = await Promise.all([
    prisma.payable.findFirst({ where: { bankRef: input.fitId }, select: { id: true } }),
    prisma.receivable.findFirst({ where: { bankRef: input.fitId }, select: { id: true } }),
  ]);
  if (dupPayable || dupReceivable) {
    return { ok: false, error: "Esta linha do extrato já foi lançada no sistema." };
  }

  const account = input.accountId || (await getDefaultAccountId());
  const isOut = input.amount < 0;
  const amount = Math.abs(input.amount);
  const flow = effectiveStructuralKey(
    isStructuralKey(input.structuralKey) ? input.structuralKey : "ADMINISTRATIVO",
    input.vehicleId || null,
  );
  const capitalBeneficiaryId = flow === "CAPITAL" ? input.capitalBeneficiaryId || null : null;
  if (flow === "CAPITAL" && !capitalBeneficiaryId) {
    return { ok: false, error: "Escolha o beneficiário do capital." };
  }
  const costCenterId = flow === "CAPITAL" ? null : input.costCenterId || null;
  const notes = [input.notes?.trim(), "Criado pela conciliação bancária"].filter(Boolean).join(" · ");

  try {
    if (isOut) {
      const cat = await resolveDespesaCategory(label);
      const supplierName = (input.supplierName || "").trim();
      const supplierId = supplierName ? await resolveSupplierByName(supplierName) : null;
      const payable = await createExpensePayable({
        description,
        category: cat.category,
        categoryLabel: cat.label,
        documentNumber: input.documentNumber?.trim() || null,
        amount,
        dueDate: when,
        paid: true,
        paymentDate: when,
        accountId: account,
        supplierId,
        vehicleId: flow === "VEICULOS" ? input.vehicleId || null : null,
        capitalBeneficiaryId,
        costCenterId,
        structuralKey: flow,
        notes,
      });
      await prisma.payable.update({
        where: { id: payable.id },
        data: { reconciledAt: new Date(), bankRef: input.fitId },
      });
    } else {
      const cat = await resolveReceitaCategory(label);
      const receivable = await prisma.receivable.create({
        data: {
          description,
          category: cat.category,
          categoryLabel: cat.label,
          documentNumber: input.documentNumber?.trim() || null,
          amount,
          dueDate: when,
          receivedDate: when,
          status: "RECEBIDO",
          customerId: input.customerId || null,
          capitalBeneficiaryId,
          costCenterId: costCenterId || (await structuralCenterId(flow)),
          accountId: account,
          reconciledAt: new Date(),
          bankRef: input.fitId,
          notes,
        },
      });
      // Fluxo Capital: o recebimento vira APORTE do sócio.
      await syncReceivableCapital(receivable.id);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível criar o lançamento." };
  }

  revalidateAll();
  return { ok: true };
}

function revalidateAll() {
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/financiamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/capital");
  revalidatePath("/");
}
