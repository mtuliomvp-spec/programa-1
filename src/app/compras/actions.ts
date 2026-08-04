"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { hasModuleAccess } from "@/lib/permissions";
import { assertCan } from "@/lib/guards";
import {
  createManualPayable,
  markPayablePaid,
  splitInstallments,
  addMonths,
  addDays,
  resolveSupplierByName,
} from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate } from "@/lib/cashbox";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { formatRequestNumber, parseDateInput } from "@/lib/format";
import { resolveDespesaCategory } from "@/lib/categories";

export type ComprasFormState = { error?: string; success?: string };

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

async function requireCompras() {
  const user = await getSessionUser();
  if (!user || !hasModuleAccess(user, "compras")) throw new Error("Acesso negado");
  return user;
}

const createSchema = z.object({
  description: z.string().min(1, "Descreva o que precisa ser comprado"),
  details: z.string().optional(),
  estimatedAmount: z.coerce.number().min(0).optional(),
  dueDate: z.string().optional(),
  documentNumber: z.string().optional(),
  categoryLabel: z.string().optional(),
  // À vista ou parcelado em N vezes (mensal ou a cada X dias).
  paymentMode: z.enum(["A_VISTA", "PARCELADO"]).default("A_VISTA"),
  installmentsCount: z.coerce.number().int().min(0).default(0),
  installmentPeriod: z.enum(["MENSAL", "DIAS"]).default("MENSAL"),
  installmentDays: z.coerce.number().int().min(1).default(30),
  supplierName: z.string().optional(),
  structuralKey: z.enum(["CAPITAL", "VEICULOS", "ADMINISTRATIVO"]).optional(),
  vehicleId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
});

export async function createRequestAction(
  _prev: ComprasFormState,
  formData: FormData,
): Promise<ComprasFormState> {
  let user;
  try {
    user = await requireCompras();
    await assertCan("compras", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem acesso ao módulo de compras." };
  }
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  const parcelado = parsed.data.paymentMode === "PARCELADO";
  const installmentsCount = parcelado ? parsed.data.installmentsCount : 1;
  if (parcelado && installmentsCount < 2) return { error: "Informe o número de parcelas (2 ou mais)." };

  // Anexo opcional (foto, PDF, orçamento…): o Zod não valida File, então lemos
  // direto do formData e gravamos os bytes no próprio banco.
  const file = formData.get("file");
  let attachment:
    | { filename: string; mimeType: string; size: number; data: Uint8Array<ArrayBuffer> }
    | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_BYTES) return { error: "Arquivo muito grande (máximo 15 MB)." };
    const data = new Uint8Array(await file.arrayBuffer());
    attachment = {
      filename: file.name || "anexo",
      mimeType: file.type || "application/octet-stream",
      size: data.byteLength,
      data,
    };
  }

  // Resolve a categoria (rótulo canônico + enum); cria custom se for nova.
  const cat = await resolveDespesaCategory(parsed.data.categoryLabel || "Outros");
  // Fornecedor por nome (campo com digitação livre): reaproveita ou cadastra.
  const supplierNameCreate = (parsed.data.supplierName || "").trim();
  const supplierIdCreate = supplierNameCreate ? await resolveSupplierByName(supplierNameCreate) : null;

  // Numeração por ano: 0001/2026, reiniciando a cada ano.
  const year = new Date().getFullYear();
  await prisma.$transaction(async (tx) => {
    const last = await tx.purchaseRequest.aggregate({ where: { year }, _max: { seq: true } });
    const seq = (last._max.seq ?? 0) + 1;
    const flow = parsed.data.structuralKey || "ADMINISTRATIVO";
    const created = await tx.purchaseRequest.create({
      data: {
        description: parsed.data.description,
        details: parsed.data.details || null,
        estimatedAmount: parsed.data.estimatedAmount || null,
        dueDate: parsed.data.dueDate ? parseDateInput(parsed.data.dueDate) : null,
        documentNumber: parsed.data.documentNumber?.trim() || null,
        category: cat.category,
        categoryLabel: cat.label,
        installmentsCount,
        installmentPeriod: parcelado ? parsed.data.installmentPeriod : null,
        installmentDays: parsed.data.installmentDays,
        supplierId: supplierIdCreate,
        structuralKey: flow,
        // Guarda o destino conforme o fluxo escolhido (leva até a conta a pagar).
        vehicleId: flow === "VEICULOS" ? parsed.data.vehicleId || null : null,
        capitalBeneficiaryId: flow === "CAPITAL" ? parsed.data.capitalBeneficiaryId || null : null,
        requestedBy: user.name,
        year,
        seq,
      },
    });
    if (attachment) {
      await tx.purchaseRequestAttachment.create({
        data: { purchaseRequestId: created.id, description: "Anexo", ...attachment },
      });
    }
  });
  revalidatePath("/compras");
  return { success: "Solicitação registrada. Aguardando aprovação." };
}

const updateSchema = createSchema.extend({ id: z.string().min(1) });

type RequestForEspelho = {
  id: string;
  seq: number;
  year: number;
  description: string;
  details: string | null;
  estimatedAmount: number | null;
  dueDate: Date | null;
  documentNumber: string | null;
  category: "COMPRA_VEICULO" | "COMPRA_PECA" | "DESPESA_OPERACIONAL" | "COMISSAO" | "SALARIO" | "COMBUSTIVEL" | "DEVOLUCAO_CLIENTE" | "DEVOLUCAO_PROPRIETARIO" | "OUTROS";
  categoryLabel: string | null;
  installmentsCount: number;
  installmentPeriod: string | null;
  installmentDays: number;
  structuralKey: string | null;
  vehicleId: string | null;
  capitalBeneficiaryId: string | null;
  supplierId: string | null;
};

/**
 * Gera o espelho da solicitação em Contas a pagar (1 título ou N parcelas)
 * vinculado via purchaseRequestId. Devolve o id do 1º título. Lança erro se
 * faltar valor ou (no Capital) o beneficiário.
 */
async function generateEspelho(request: RequestForEspelho): Promise<string | null> {
  const amount = request.estimatedAmount;
  if (!amount || amount <= 0) throw new Error("Defina o valor da solicitação antes de aprovar.");
  const flowKey = (request.structuralKey || "ADMINISTRATIVO") as "CAPITAL" | "VEICULOS" | "ADMINISTRATIVO";
  if (flowKey === "CAPITAL" && !request.capitalBeneficiaryId) {
    throw new Error("Escolha o beneficiário do capital antes de aprovar.");
  }

  const count = request.installmentsCount > 1 ? request.installmentsCount : 1;
  const firstDue = request.dueDate ?? new Date();
  const amounts = count > 1 ? splitInstallments(amount, count) : [amount];
  const label = `Compra ${formatRequestNumber(request.seq, request.year)}: ${request.description}`;

  let firstPayableId: string | null = null;
  for (let i = 0; i < amounts.length; i++) {
    const payable = await createManualPayable({
      description: count > 1 ? `${label} - Parcela ${i + 1}/${count}` : label,
      category: request.category,
      categoryLabel: request.categoryLabel,
      documentNumber: request.documentNumber,
      amount: amounts[i],
      dueDate:
        request.installmentPeriod === "DIAS"
          ? addDays(firstDue, i * request.installmentDays)
          : addMonths(firstDue, i),
      supplierId: request.supplierId,
      structuralKey: flowKey,
      vehicleId: flowKey === "VEICULOS" ? request.vehicleId : null,
      capitalBeneficiaryId: flowKey === "CAPITAL" ? request.capitalBeneficiaryId : null,
      notes: request.details,
      alreadyPaid: false,
      purchaseRequestId: request.id,
    });
    if (i === 0) firstPayableId = payable.id;
  }
  return firstPayableId;
}

/** Remove os títulos pendentes do espelho (para regerar ou excluir). */
async function clearPendingEspelho(purchaseRequestId: string) {
  const pending = await prisma.payable.findMany({
    where: { purchaseRequestId, status: { not: "PAGO" } },
    select: { id: true },
  });
  const ids = pending.map((p) => p.id);
  if (ids.length === 0) return;
  await prisma.$transaction([
    prisma.capitalTransaction.deleteMany({ where: { payableId: { in: ids } } }),
    prisma.payable.deleteMany({ where: { id: { in: ids } } }),
  ]);
}

/**
 * Edita uma solicitação PENDENTE ou APROVADA. Se aprovada, regera o espelho em
 * Contas a pagar com os novos valores (bloqueia se alguma parcela já foi paga).
 */
export async function updateRequestAction(
  _prev: ComprasFormState,
  formData: FormData,
): Promise<ComprasFormState> {
  try {
    await requireCompras();
    await assertCan("compras", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem acesso ao módulo de compras." };
  }
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;

  const parcelado = d.paymentMode === "PARCELADO";
  const installmentsCount = parcelado ? d.installmentsCount : 1;
  if (parcelado && installmentsCount < 2) return { error: "Informe o número de parcelas (2 ou mais)." };

  const existing = await prisma.purchaseRequest.findUnique({
    where: { id: d.id },
    include: { payables: { select: { status: true } } },
  });
  if (!existing) return { error: "Solicitação não encontrada." };
  if (existing.status !== "PENDENTE" && existing.status !== "APROVADA") {
    return { error: "Só é possível editar solicitações pendentes ou aprovadas." };
  }
  if (existing.status === "APROVADA" && existing.payables.some((p) => p.status === "PAGO")) {
    return { error: "Já há pagamento nesta compra. Reverta o título antes de editar." };
  }

  const flow = d.structuralKey || "ADMINISTRATIVO";
  const cat = await resolveDespesaCategory(d.categoryLabel || "Outros");
  const supplierNameUpdate = (d.supplierName || "").trim();
  const supplierIdUpdate = supplierNameUpdate ? await resolveSupplierByName(supplierNameUpdate) : null;
  const updated = await prisma.purchaseRequest.update({
    where: { id: d.id },
    data: {
      description: d.description,
      details: d.details || null,
      estimatedAmount: d.estimatedAmount || null,
      dueDate: d.dueDate ? parseDateInput(d.dueDate) : null,
      documentNumber: d.documentNumber?.trim() || null,
      category: cat.category,
      categoryLabel: cat.label,
      installmentsCount,
      installmentPeriod: parcelado ? d.installmentPeriod : null,
      installmentDays: d.installmentDays,
      supplierId: supplierIdUpdate,
      structuralKey: flow,
      vehicleId: flow === "VEICULOS" ? d.vehicleId || null : null,
      capitalBeneficiaryId: flow === "CAPITAL" ? d.capitalBeneficiaryId || null : null,
    },
  });

  // Aprovada: regera o espelho em Contas a pagar com os valores atualizados.
  if (existing.status === "APROVADA") {
    try {
      // Se o espelho estava dentro de um combo ainda não pago, guarda o vínculo
      // para devolver os títulos regerados ao MESMO combo (senão a edição
      // derrubaria a compra do borderô sem ninguém perceber).
      const prevCombo = await prisma.payable.findFirst({
        where: {
          purchaseRequestId: updated.id,
          status: { not: "PAGO" },
          paymentCombo: { status: { in: ["ABERTO", "SOLICITADO"] } },
        },
        select: { paymentComboId: true },
      });
      await clearPendingEspelho(updated.id);
      const firstPayableId = await generateEspelho(updated);
      if (prevCombo?.paymentComboId) {
        await prisma.payable.updateMany({
          where: { purchaseRequestId: updated.id, status: { not: "PAGO" } },
          data: { paymentComboId: prevCombo.paymentComboId },
        });
        revalidatePath("/financeiro/combos");
        revalidatePath(`/financeiro/combos/${prevCombo.paymentComboId}`);
      }
      await prisma.purchaseRequest.update({
        where: { id: updated.id },
        data: { finalAmount: updated.estimatedAmount, payableId: firstPayableId },
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Não foi possível gerar o espelho." };
    }
    revalidatePath("/financeiro/a-pagar");
  }

  // Anexo opcional na edição (foto, PDF…): grava um novo anexo vinculado.
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_BYTES) return { error: "Arquivo muito grande (máximo 15 MB)." };
    const data = new Uint8Array(await file.arrayBuffer());
    await prisma.purchaseRequestAttachment.create({
      data: {
        purchaseRequestId: updated.id,
        description: "Anexo",
        filename: file.name || "anexo",
        mimeType: file.type || "application/octet-stream",
        size: data.byteLength,
        data,
      },
    });
  }

  revalidatePath("/compras");
  revalidatePath(`/compras/${d.id}`);
  redirect(`/compras/${d.id}`);
}

/**
 * Aprova uma solicitação PENDENTE: gera o espelho em Contas a pagar e marca
 * APROVADA. Devolve true se aprovou; false se não estava pendente. Lança se
 * faltar valor/beneficiário (tratado pelo chamador em lote).
 */
async function approveRequest(id: string, userName: string): Promise<boolean> {
  const request = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!request || request.status !== "PENDENTE") return false;

  const firstPayableId = await generateEspelho(request);
  await prisma.purchaseRequest.update({
    where: { id },
    data: {
      status: "APROVADA",
      decidedBy: userName,
      decidedAt: new Date(),
      finalAmount: request.estimatedAmount,
      payableId: firstPayableId,
    },
  });
  return true;
}

export async function decideRequestAction(id: string, approve: boolean, notes?: string) {
  const user = await assertCan("compras", "aprovar");

  if (!approve) {
    await prisma.purchaseRequest.update({
      where: { id, status: "PENDENTE" },
      data: { status: "REJEITADA", decidedBy: user.name, decidedAt: new Date(), decisionNotes: notes || null },
    });
    revalidatePath("/compras");
    return;
  }

  await approveRequest(id, user.name);
  revalidatePath("/compras");
  revalidatePath("/financeiro/a-pagar");
}

export type BatchResult = { ok: boolean; done: number; skipped: number; error?: string };

/** Aprova várias solicitações PENDENTES de uma vez (gera o espelho de cada). */
export async function batchApproveRequestsAction(ids: string[]): Promise<BatchResult> {
  let user;
  try {
    user = await assertCan("compras", "aprovar");
  } catch (e) {
    return { ok: false, done: 0, skipped: 0, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  let done = 0;
  let skipped = 0;
  for (const id of ids) {
    try {
      if (await approveRequest(id, user.name)) done += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  revalidatePath("/compras");
  revalidatePath("/financeiro/a-pagar");
  return { ok: done > 0, done, skipped };
}

/** Rejeita várias solicitações PENDENTES de uma vez. */
export async function batchRejectRequestsAction(ids: string[]): Promise<BatchResult> {
  let user;
  try {
    user = await assertCan("compras", "aprovar");
  } catch (e) {
    return { ok: false, done: 0, skipped: 0, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const res = await prisma.purchaseRequest.updateMany({
    where: { id: { in: ids }, status: "PENDENTE" },
    data: { status: "REJEITADA", decidedBy: user.name, decidedAt: new Date() },
  });
  revalidatePath("/compras");
  return { ok: res.count > 0, done: res.count, skipped: ids.length - res.count };
}

/** Cancela várias solicitações PENDENTES de uma vez. */
export async function batchCancelRequestsAction(ids: string[]): Promise<BatchResult> {
  try {
    await requireCompras();
    await assertCan("compras", "criar");
  } catch (e) {
    return { ok: false, done: 0, skipped: 0, error: e instanceof Error ? e.message : "Sem acesso." };
  }
  const res = await prisma.purchaseRequest.updateMany({
    where: { id: { in: ids }, status: "PENDENTE" },
    data: { status: "CANCELADA" },
  });
  revalidatePath("/compras");
  return { ok: res.count > 0, done: res.count, skipped: ids.length - res.count };
}

/** Exclui várias solicitações (pula as com parcela paga). */
export async function batchDeleteRequestsAction(ids: string[]): Promise<BatchResult> {
  try {
    await requireCompras();
    await assertCan("compras", "criar");
  } catch (e) {
    return { ok: false, done: 0, skipped: 0, error: e instanceof Error ? e.message : "Sem acesso." };
  }
  let done = 0;
  let skipped = 0;
  for (const id of ids) {
    const res = await deleteRequestCore(id);
    if (res.ok) done += 1;
    else skipped += 1;
  }
  revalidatePath("/compras");
  revalidatePath("/financeiro/a-pagar");
  return { ok: done > 0, done, skipped };
}

/**
 * Exclui uma solicitação de compra (ex.: duplicada). Remove os títulos
 * pendentes do espelho e o capital vinculado; bloqueia se houver parcela paga.
 * Anexos são apagados por cascade.
 */
/** Núcleo da exclusão (sem guard/revalidate) — reusado individual e em lote. */
async function deleteRequestCore(id: string): Promise<{ ok: boolean; error?: string }> {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { payables: { select: { id: true, status: true } } },
  });
  if (!request) return { ok: false, error: "Solicitação não encontrada." };
  if (request.payables.some((p) => p.status === "PAGO")) {
    return { ok: false, error: "Há pagamento nesta compra. Reverta o título antes de excluir." };
  }

  const payableIds = request.payables.map((p) => p.id);
  await prisma.$transaction([
    ...(payableIds.length
      ? [
          prisma.capitalTransaction.deleteMany({ where: { payableId: { in: payableIds } } }),
          prisma.payable.deleteMany({ where: { id: { in: payableIds } } }),
        ]
      : []),
    prisma.purchaseRequest.delete({ where: { id } }),
  ]);
  return { ok: true };
}

export async function deleteRequestAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireCompras();
    await assertCan("compras", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem acesso ao módulo de compras." };
  }
  const res = await deleteRequestCore(id);
  if (res.ok) {
    revalidatePath("/compras");
    revalidatePath("/financeiro/a-pagar");
  }
  return res;
}

/**
 * Paga um título do espelho direto pela solicitação (mesmas regras do a-pagar:
 * exige caixa aberto, livros batidos e mês aberto). Ao pagar todas as parcelas,
 * a solicitação vira Concluída automaticamente (via markPayablePaid).
 */
export async function payRequestPayableAction(
  payableId: string,
  accountId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("financeiro", "pagar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  if (!accountId) return { ok: false, error: "Escolha a conta que fará o pagamento." };
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mês fechado." };
  }
  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
    select: { status: true },
  });
  if (!payable) return { ok: false, error: "Título não encontrado." };
  if (payable.status === "PAGO") return { ok: false, error: "Este título já está pago." };

  await markPayablePaid(payableId, date, accountId);
  revalidatePath("/compras");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/");
  return { ok: true };
}

export async function cancelRequestAction(id: string) {
  await requireCompras();
  await assertCan("compras", "criar");
  await prisma.purchaseRequest.update({
    where: { id, status: "PENDENTE" },
    data: { status: "CANCELADA" },
  });
  revalidatePath("/compras");
}

