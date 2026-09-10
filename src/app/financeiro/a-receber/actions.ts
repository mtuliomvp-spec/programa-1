"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { markReceivableReceived, markReceivablePending, createManualReceivable, updateManualReceivable, receiveReceivable, receiveWithDiscount, correctReceivedDate, settleReceivableFromCapital } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate } from "@/lib/cashbox";
import { assertCan, assertCanAny } from "@/lib/guards";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";
import { resolveReceitaCategory } from "@/lib/categories";
import { STRUCTURAL_KEY_VALUES } from "@/lib/structural-flows";

export async function markReceivedAction(id: string, accountId?: string) {
  await assertCan("financeiro", "receber");
  await assertBooksBalanced();
  await assertCashboxOpen();
  await markReceivableReceived(id, await getCashboxWorkDate(), accountId || null);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
}

/**
 * Recebe um título ABATENDO DO CAPITAL de um sócio — a rotina de vender um
 * veículo (ou qualquer cobrança) para um sócio pagando com o saldo dele.
 *
 * Mecânica (a mesma da comissão "aplicada no capital", invertida): o título é
 * recebido no BANCO NEUTRO e nasce uma retirada de capital PAGA no mesmo
 * neutro — o par se anula (nenhum dinheiro real se move), a receita da venda é
 * reconhecida e o capital do sócio diminui, como se ele tivesse sacado o valor
 * e pago a compra em dinheiro. A retirada nasce de syncPayableCapital (título
 * com capitalBeneficiaryId pago), então reverter o título da retirada desfaz o
 * lançamento de capital junto — o farol continua verde nos dois sentidos.
 */
export async function receiveFromCapitalAction(
  id: string,
  beneficiaryId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "receber");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  if (!beneficiaryId) return { ok: false, error: "Escolha o sócio que vai pagar com o capital." };
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mês fechado." };
  }

  const r = await prisma.receivable.findUnique({
    where: { id },
    select: { status: true, amount: true, description: true },
  });
  if (!r) return { ok: false, error: "Título não encontrado." };
  if (r.status === "RECEBIDO") return { ok: false, error: "Este título já foi recebido." };
  const beneficiary = await prisma.capitalBeneficiary.findUnique({
    where: { id: beneficiaryId },
    select: { name: true, active: true },
  });
  if (!beneficiary || !beneficiary.active) {
    return { ok: false, error: "Sócio (beneficiário do capital) não encontrado ou inativo." };
  }

  try {
    await settleReceivableFromCapital(id, beneficiaryId, date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível abater do capital." };
  }

  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/capital");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Recebe um título total ou parcialmente na conta escolhida. No parcial, o
 * restante continua pendente em Contas a Receber.
 */
export async function receiveAction(id: string, amount: number, accountId?: string, note?: string) {
  await assertCan("financeiro", "receber");
  await assertBooksBalanced();
  await assertCashboxOpen();
  await receiveReceivable(id, amount, await getCashboxWorkDate(), accountId || null, note || null);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
}

/**
 * Recebe por menos que o valor cheio e QUITA o título, lançando a diferença
 * como desconto concedido (custo pós-venda do veículo, ou despesa
 * administrativa quando o título não é de um carro).
 */
export async function receiveWithDiscountAction(
  id: string,
  amount: number,
  accountId: string,
  note?: string,
): Promise<{ ok: boolean; discount?: number; error?: string }> {
  if (!accountId) return { ok: false, error: "Escolha a conta que vai receber." };
  try {
    await assertCan("financeiro", "desconto");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  const date = await getCashboxWorkDate();
  let discount = 0;
  try {
    await assertMonthOpen(date);
    const res = await receiveWithDiscount({
      receivableId: id,
      amount,
      date,
      accountId,
      notes: note?.trim() || null,
    });
    discount = res.discount;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível dar o desconto." };
  }
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/estoque");
  revalidatePath("/relatorios/lucro-veiculos");
  revalidatePath("/");
  return { ok: true, discount };
}

/**
 * Corrige a data de um recebimento já feito. É ação de CORREÇÃO: não exige
 * caixa aberto (a data do caixa é justamente o que estava errado) nem farol
 * verde — senão o usuário não conseguiria sair de um estado divergente.
 * Os dois meses envolvidos precisam estar abertos: mover um valor para dentro
 * ou para fora de um mês já encerrado bagunçaria o fechamento.
 */
export async function correctReceivedDateAction(
  id: string,
  dateInput: string,
): Promise<{ ok: boolean; movedCapital?: boolean; error?: string }> {
  if (!dateInput) return { ok: false, error: "Escolha a data." };
  try {
    await assertCan("financeiro", "corrigirdata");
    const newDate = parseDateInput(dateInput);
    const current = await prisma.receivable.findUnique({
      where: { id },
      select: { receivedDate: true },
    });
    if (current?.receivedDate) await assertMonthOpen(current.receivedDate);
    await assertMonthOpen(newDate);
    const res = await correctReceivedDate(id, newDate);
    revalidatePath("/financeiro/a-receber");
    revalidatePath("/financeiro/fluxo-caixa");
    revalidatePath("/financeiro/livro-caixa");
    revalidatePath("/financeiro/contas");
    revalidatePath("/capital");
    revalidatePath("/");
    return { ok: true, movedCapital: res.movedCapital };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível corrigir a data." };
  }
}

export async function markPendingAction(id: string) {
  await assertCan("financeiro", "receber");
  await markReceivablePending(id);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/");
}

/**
 * Exclui um título A RECEBER. Espelha o Contas a pagar: bloqueia títulos já
 * RECEBIDOS (reverter antes) e os que vêm de outra operação (venda/peça/
 * recorrência — ajustar na origem). Remove também eventual movimentação de
 * capital vinculada. Excluir um PENDENTE não mexe no caixa.
 */
export async function deleteReceivableAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const r = await prisma.receivable.findUnique({
    where: { id },
    select: { status: true, saleId: true, partSaleId: true, recurringId: true },
  });
  if (!r) return { ok: false, error: "Título não encontrado." };
  if (r.status === "RECEBIDO") {
    return { ok: false, error: "Título já recebido. Use Reverter antes de excluir." };
  }
  if (r.saleId || r.partSaleId || r.recurringId) {
    return { ok: false, error: "Este título vem de outra operação (venda/peça/recorrência). Ajuste na origem." };
  }
  await prisma.$transaction([
    prisma.capitalTransaction.deleteMany({ where: { receivableId: id } }),
    prisma.receivable.delete({ where: { id } }),
  ]);
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
  return { ok: true };
}

const manualSchema = z.object({
  description: z.string().min(1, "Informe a descrição"),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
  customerId: z.string().optional(),
  costCenterId: z.string().optional(),
  structuralKey: z.enum(STRUCTURAL_KEY_VALUES).optional(),
  // Fluxo CAPITAL: de quem é o aporte. Obrigatório nesse fluxo.
  capitalBeneficiaryId: z.string().optional(),
  notes: z.string().optional(),
  alreadyReceived: z.coerce.boolean().optional(),
});

export type ManualReceivableState = { error?: string };

export async function createManualReceivableAction(
  _prev: ManualReceivableState,
  formData: FormData,
): Promise<ManualReceivableState> {
  try {
    await assertCan("financeiro", "criar");
    await assertBooksBalanced();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = manualSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  try {
    // Título PENDENTE não movimenta dinheiro — pode ser criado com o caixa
    // fechado. O caixa aberto só é exigido quando "já recebido" (baixa junto).
    if (d.alreadyReceived) await assertCashboxOpen();
    await assertMonthOpen(parseDateInput(d.dueDate));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }

  // No fluxo Capital o título vira aporte do sócio na baixa: sem beneficiário,
  // o dinheiro entraria no caixa sem entrar no capital de ninguém.
  const isCapital = d.structuralKey === "CAPITAL";
  if (isCapital && !d.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do fluxo Capital." };
  }

  await createManualReceivable({
    description: d.description,
    amount: d.amount,
    dueDate: parseDateInput(d.dueDate),
    customerId: d.customerId || null,
    costCenterId: d.costCenterId || null,
    structuralKey: d.structuralKey,
    capitalBeneficiaryId: isCapital ? d.capitalBeneficiaryId || null : null,
    notes: d.notes || null,
    alreadyReceived: Boolean(d.alreadyReceived),
  });

  revalidatePath("/financeiro/a-receber");
  revalidatePath("/");
  redirect("/financeiro/a-receber");
}

// ---------------------------------------------------------------------------
// Editar título a receber (manual e ainda não recebido).
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1, "Informe a descrição"),
  categoryLabel: z.string().optional(),
  documentNumber: z.string().optional(),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  dueDate: z.string().min(1),
  customerId: z.string().optional(),
  costCenterId: z.string().optional(),
  structuralKey: z.enum(STRUCTURAL_KEY_VALUES).optional(),
  capitalBeneficiaryId: z.string().optional(),
  notes: z.string().optional(),
});

export type EditReceivableState = { error?: string };

/**
 * Edita um título a receber. Só valem os manuais e ainda não recebidos: os que
 * vêm de venda, venda de peça ou recorrência são ajustados na origem (mexer
 * aqui desalinharia a venda ou faria a recorrência gerar duplicado), e o já
 * recebido movimenta conta/resultado — precisa ser revertido antes.
 *
 * Não move dinheiro, então não exige caixa aberto nem farol verde.
 */
export async function updateReceivableAction(
  _prev: EditReceivableState,
  formData: FormData,
): Promise<EditReceivableState> {
  try {
    await assertCanAny([
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const current = await prisma.receivable.findUnique({
    where: { id: d.id },
    select: {
      status: true,
      category: true,
      saleId: true,
      partSaleId: true,
      recurringId: true,
      dueDate: true,
    },
  });
  if (!current) return { error: "Título não encontrado." };
  if (current.status === "RECEBIDO") {
    return { error: "Título já recebido. Use Reverter antes de editar." };
  }
  if (current.saleId || current.partSaleId) {
    return { error: "Este título vem de uma venda. Ajuste na venda de origem." };
  }
  // Recorrente é editável inclusive no VENCIMENTO: a geração reconhece a
  // parcela pela ocorrência gravada no título (`recurringPeriod`), não pela
  // data, então corrigir a data não faz a parcela nascer de novo.
  const dueDate = parseDateInput(d.dueDate);

  const label = (d.categoryLabel || "").trim();
  if (!label) return { error: "Informe a categoria." };
  const cat = await resolveReceitaCategory(label);

  const flow = d.structuralKey || "ADMINISTRATIVO";
  const capitalBeneficiaryId = flow === "CAPITAL" ? d.capitalBeneficiaryId || null : null;
  if (flow === "CAPITAL" && !capitalBeneficiaryId) {
    return { error: "Escolha o beneficiário do capital." };
  }

  try {
    await assertMonthOpen(dueDate);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Mês fechado." };
  }

  await updateManualReceivable({
    id: d.id,
    description: d.description,
    category: cat.category,
    categoryLabel: cat.label,
    documentNumber: d.documentNumber?.trim() || null,
    amount: d.amount,
    dueDate,
    customerId: d.customerId || null,
    capitalBeneficiaryId,
    costCenterId: flow === "CAPITAL" ? null : d.costCenterId || null,
    structuralKey: flow,
    notes: d.notes?.trim() || null,
  });

  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/capital");
  revalidatePath("/");
  redirect("/financeiro/a-receber");
}

// ---------------------------------------------------------------------------
// Lote: receber vários títulos de uma vez / excluir selecionados.
// ---------------------------------------------------------------------------

export type ReceiveBatchResult = { ok: boolean; received: number; error?: string };

/**
 * Baixa um ou vários títulos de uma vez pela conta escolhida, sempre pelo VALOR
 * CHEIO e na data de trabalho do caixa aberto (recebimento parcial continua no
 * botão "Receber" da linha). Espelha o pagamento em lote do Contas a pagar —
 * combos não existem aqui (são exclusivos de contas a pagar).
 */
export async function receiveBatchAction(
  ids: string[],
  accountId: string,
): Promise<ReceiveBatchResult> {
  if (!ids.length) return { ok: false, received: 0, error: "Selecione ao menos um título." };
  if (!accountId) return { ok: false, received: 0, error: "Escolha a conta que vai receber." };
  try {
    await assertCan("financeiro", "receber");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, received: 0, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
  } catch (e) {
    return { ok: false, received: 0, error: e instanceof Error ? e.message : "Mês fechado." };
  }

  let received = 0;
  for (const id of ids) {
    // Sequencial de propósito: cada baixa sincroniza o capital do título.
    await markReceivableReceived(id, date, accountId);
    received += 1;
  }

  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/capital");
  revalidatePath("/");
  return { ok: true, received };
}

export type DeleteReceivablesResult = {
  ok: boolean;
  deleted: number;
  skipped: number;
  error?: string;
};

/**
 * Exclui vários títulos a receber de uma vez. Recebidos e os que vêm de outra
 * operação (venda, venda de peça, recorrência) são ignorados e contam em
 * `skipped`. Valida tudo numa consulta e apaga em lote.
 */
export async function deleteReceivablesAction(ids: string[]): Promise<DeleteReceivablesResult> {
  if (!ids.length) {
    return { ok: false, deleted: 0, skipped: 0, error: "Selecione ao menos um título." };
  }
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return {
      ok: false,
      deleted: 0,
      skipped: 0,
      error: e instanceof Error ? e.message : "Sem permissão.",
    };
  }

  const rows = await prisma.receivable.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, saleId: true, partSaleId: true, recurringId: true },
  });
  const okIds = rows
    .filter((r) => r.status !== "RECEBIDO" && !r.saleId && !r.partSaleId && !r.recurringId)
    .map((r) => r.id);
  const deleted = okIds.length;
  const skipped = ids.length - deleted;

  if (okIds.length) {
    await prisma.$transaction([
      // A movimentação de capital não tem cascade — sai junto com o título.
      prisma.capitalTransaction.deleteMany({ where: { receivableId: { in: okIds } } }),
      prisma.receivable.deleteMany({ where: { id: { in: okIds } } }),
    ]);
  }

  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/");
  return { ok: deleted > 0, deleted, skipped };
}

// ---------------------------------------------------------------------------
// Informar o recebimento: pré-lançar o crédito e esperar o caixa chegar no dia
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export type InformarRecebimentoResult = {
  ok: boolean;
  error?: string;
  /** O arquivo foi anexado ao título (quando veio um). */
  attached?: boolean;
  /** O PDF pede senha de abertura: a tela pede a senha e reenvia o arquivo. */
  senhaNecessaria?: boolean;
  /** O título entrou na fila de espera do caixa. */
  enfileirado?: boolean;
  /** Divergências entre o que foi informado e o que o anexo diz. */
  avisos?: string[];
};

const informarSchema = z.object({
  receivableId: z.string().min(1),
  date: z.string().min(1, "Informe a data em que o dinheiro entrou"),
  amount: z.coerce.number().min(0.01, "Informe o valor que entrou"),
  accountId: z.string().min(1, "Escolha a conta que recebeu o dinheiro"),
});

/**
 * INFORMA que o dinheiro deste título já entrou na conta e põe o recebimento
 * na fila de espera do caixa — o mesmo pré-lançamento dos pagamentos, do outro
 * lado.
 *
 * Aqui a informação é digitada, não lida: do lado de quem recebe muitas vezes
 * não existe comprovante — o cliente avisa por telefone, ou o valor simplesmente
 * aparece no extrato. Por isso o que manda são a DATA, o VALOR e a CONTA
 * creditada; o anexo (comprovante do depósito ou print do extrato) é opcional e
 * serve de prova.
 *
 * Quando vem anexo, a IA o lê só para CONFERIR: valor e data diferentes do que
 * foi digitado viram aviso — nada é sobrescrito, porque quem viu o extrato é
 * quem está lançando.
 *
 * Recebeu menos que o título? O ok no caixa credita o que entrou e deixa o
 * restante a receber (recebimento parcial).
 */
export async function informarRecebimentoAction(
  formData: FormData,
): Promise<InformarRecebimentoResult> {
  try {
    await assertCanAny([
      ["financeiro", "receber"],
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const parsed = informarSchema.safeParse({
    receivableId: formData.get("receivableId"),
    date: formData.get("date"),
    amount: formData.get("amount"),
    accountId: formData.get("accountId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const d = parsed.data;

  const receivable = await prisma.receivable.findUnique({
    where: { id: d.receivableId },
    select: { id: true, status: true, amount: true, dueDate: true, description: true },
  });
  if (!receivable) return { ok: false, error: "Título não encontrado." };
  if (receivable.status === "RECEBIDO") {
    return { ok: false, error: "Título já recebido — não há o que pré-lançar." };
  }
  if (d.amount > receivable.amount + 0.005) {
    return {
      ok: false,
      error: `O título é de ${formatCurrencyBR(receivable.amount)}: informe no máximo esse valor. Entrou mais? Corrija o valor do título antes.`,
    };
  }

  const dataEntrada = parseDateInput(d.date);
  const avisos: string[] = [];
  let attached = false;

  // Anexo opcional: comprovante do depósito ou print do extrato.
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, error: "Arquivo muito grande (máximo 15 MB)." };
    }
    let buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const { ehPdf, pdfPedeSenha, decifrarPdf, SenhaIncorretaError } = await import("@/lib/pdf-password");
    const senha = String(formData.get("senha") || "");
    if (ehPdf(buffer, mimeType) && (await pdfPedeSenha(buffer))) {
      if (!senha) {
        return {
          ok: false,
          senhaNecessaria: true,
          error: "Este arquivo está protegido por senha. Digite a senha do documento para o sistema abrir e anexar.",
        };
      }
      try {
        buffer = Buffer.from(await decifrarPdf(buffer, senha));
      } catch (e) {
        return {
          ok: false,
          senhaNecessaria: true,
          error: e instanceof SenhaIncorretaError ? e.message : "Não foi possível abrir este PDF com a senha informada.",
        };
      }
    }

    await prisma.receivableAttachment.deleteMany({
      where: { receivableId: d.receivableId, kind: "COMPROVANTE" },
    });
    await prisma.receivableAttachment.create({
      data: {
        receivableId: d.receivableId,
        kind: "COMPROVANTE",
        description: "Comprovante do recebimento",
        filename: file.name || "comprovante",
        mimeType,
        size: buffer.byteLength,
        data: buffer,
      },
    });
    attached = true;

    // A IA só CONFERE: o que vale é o que foi digitado por quem viu o extrato.
    try {
      const { extractPaymentReceipts } = await import("@/lib/receipts-ai");
      const lido = (await extractPaymentReceipts(buffer.toString("base64"), mimeType))[0];
      if (lido?.valor != null && Math.abs(lido.valor - d.amount) > 0.005) {
        avisos.push(
          `o anexo mostra ${formatCurrencyBR(lido.valor)} e você informou ${formatCurrencyBR(d.amount)}`,
        );
      }
      if (lido?.data && /^\d{4}-\d{2}-\d{2}$/.test(lido.data) && lido.data !== d.date) {
        const [a, m, dia] = lido.data.split("-");
        avisos.push(`o anexo é de ${dia}/${m}/${a} e você informou outra data`);
      }
    } catch {
      // Leitura é um extra: falhou, o anexo fica guardado do mesmo jeito.
    }
  }

  // Atraso em relação ao vencimento — a mesma leitura do lado do pagamento.
  const atraso = Math.round(
    (Date.UTC(dataEntrada.getUTCFullYear(), dataEntrada.getUTCMonth(), dataEntrada.getUTCDate()) -
      Date.UTC(
        receivable.dueDate.getUTCFullYear(),
        receivable.dueDate.getUTCMonth(),
        receivable.dueDate.getUTCDate(),
      )) /
      86400000,
  );
  if (atraso > 0) avisos.push(`recebido ${atraso} dia(s) depois do vencimento`);
  if (d.amount < receivable.amount - 0.005) {
    avisos.push(
      `recebimento parcial: entrou ${formatCurrencyBR(d.amount)} de ${formatCurrencyBR(receivable.amount)} — o restante continua a receber`,
    );
  }

  const { enfileirarRecebimento } = await import("@/lib/payment-queue");
  await enfileirarRecebimento({
    receivableId: d.receivableId,
    data: dataEntrada,
    valor: d.amount,
    accountId: d.accountId,
    nota: avisos.join(" · ") || null,
  });

  revalidatePath("/financeiro/a-receber");
  revalidatePath(`/financeiro/a-receber/${d.receivableId}/editar`);
  revalidatePath("/financeiro/contas");
  return { ok: true, attached, enfileirado: true, avisos };
}

/** Desfaz o "informar recebimento": tira da fila e apaga o anexo, se houver. */
export async function desfazerRecebimentoInformadoAction(
  receivableId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCanAny([
      ["financeiro", "receber"],
      ["financeiro", "criar"],
      ["financeiro", "editar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const { desenfileirarRecebimento } = await import("@/lib/payment-queue");
  await desenfileirarRecebimento(receivableId);
  await prisma.receivableAttachment.deleteMany({ where: { receivableId, kind: "COMPROVANTE" } });
  revalidatePath("/financeiro/a-receber");
  revalidatePath(`/financeiro/a-receber/${receivableId}/editar`);
  revalidatePath("/financeiro/contas");
  return { ok: true };
}

/** R$ 1.234,56 — só para as mensagens desta tela. */
function formatCurrencyBR(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
