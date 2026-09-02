"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { assertCan } from "@/lib/guards";
import { cancelVehicleSale } from "@/lib/finance";
import {
  intermediationSchema,
  createIntermediationPreSale,
  updateIntermediationPreSale,
  convertIntermediationPreSale,
  PAYOFF_BOLETO_PREFIX,
  type IntermediationFormState,
} from "./core";

const PAYOFF_BOLETO_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Gera a pré-venda (ficha) ou salva alterações quando há `preSaleId`. Não
 * movimenta dinheiro (é rascunho), então não exige caixa aberto.
 */
export async function createIntermediationPreSaleAction(
  _prev: IntermediationFormState,
  formData: FormData,
): Promise<IntermediationFormState> {
  try {
    // Criar/editar a pré-venda (ficha) exige a permissão própria do
    // financiamento de terceiros — não a de registrar/concluir (essa é exigida
    // só na conversão em venda).
    await assertCan("vendas", "terceiros");
    await assertBooksBalanced();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = intermediationSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const preSaleId = String(formData.get("preSaleId") || "").trim();

  let id: string;
  try {
    id = preSaleId
      ? await updateIntermediationPreSale(preSaleId, parsed.data)
      : await createIntermediationPreSale(parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível salvar a pré-venda." };
  }

  // CRLV do veículo de terceiro (lido no formulário para preencher o
  // proprietário e o veículo): fica anexado ao veículo, como no estoque.
  const crlvFile = formData.get("crlvFile");
  if (crlvFile instanceof File && crlvFile.size > 0 && crlvFile.size <= PAYOFF_BOLETO_MAX_BYTES) {
    const pre = await prisma.preSale.findUniqueOrThrow({ where: { id }, select: { vehicleId: true } });
    const exercicio = String(formData.get("crlvExercicio") || "").match(/\d{4}/)?.[0];
    await prisma.vehicleAttachment.create({
      data: {
        vehicleId: pre.vehicleId,
        kind: "CRLV",
        description: exercicio ? `CRLV ${exercicio}` : "CRLV",
        filename: crlvFile.name || "crlv.pdf",
        mimeType: crlvFile.type || "application/octet-stream",
        size: crlvFile.size,
        data: Buffer.from(await crlvFile.arrayBuffer()),
      },
    });
  }

  // Boleto da quitação do financiamento anterior: fica anexado ao veículo de
  // terceiro (mesmo prontuário da foto do cliente), com o nome do banco e o
  // valor na descrição — é por ela que a ficha e a operação o encontram.
  const boleto = formData.get("payoffBoleto");
  if (parsed.data.payoffEnabled && boleto instanceof File && boleto.size > 0) {
    if (boleto.size > PAYOFF_BOLETO_MAX_BYTES) {
      return { error: "O boleto é muito grande (máximo 15 MB). A pré-venda foi salva sem o anexo." };
    }
    const pre = await prisma.preSale.findUniqueOrThrow({ where: { id }, select: { vehicleId: true } });
    await prisma.vehicleAttachment.create({
      data: {
        vehicleId: pre.vehicleId,
        kind: "DOCUMENTO",
        description: `${PAYOFF_BOLETO_PREFIX} — ${parsed.data.payoffBank?.trim() || "banco"} · R$ ${parsed.data.payoffAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        filename: boleto.name || "boleto-quitacao.pdf",
        mimeType: boleto.type || "application/octet-stream",
        size: boleto.size,
        data: Buffer.from(await boleto.arrayBuffer()),
      },
    });
  }

  revalidatePath("/vendas/financiamento-terceiros");
  revalidatePath(`/vendas/financiamento-terceiros/pre/${id}`);
  redirect(`/vendas/financiamento-terceiros/pre/${id}`);
}

export type CrlvLido = {
  proprietario: string | null;
  cpfCnpj: string | null;
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
  marca: string | null;
  modelo: string | null;
  anoFabricacao: number | null;
  anoModelo: number | null;
  cor: string | null;
  combustivel: string | null;
  transmissao: string | null;
  exercicio: string | null;
};

/** 18438083315 → 184.380.833-15; 14 dígitos → CNPJ com máscara. */
function mascaraDocumento(digitos: string | null): string | null {
  const d = (digitos || "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return d || null;
}

/**
 * Lê o CRLV anexado no formulário do financiamento de terceiros (antes de a
 * pré-venda existir) e devolve os dados para o navegador preencher o
 * proprietário e o veículo. Não grava nada: o arquivo segue no formulário e é
 * anexado ao veículo de terceiro quando a ficha é salva.
 */
export async function readIntermediationCrlvAction(
  formData: FormData,
): Promise<{ ok: true; data: CrlvLido } | { ok: false; error: string }> {
  try {
    await assertCan("vendas", "terceiros");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecione o arquivo do CRLV." };
  if (file.size > PAYOFF_BOLETO_MAX_BYTES) return { ok: false, error: "Arquivo muito grande (máximo 15 MB)." };
  try {
    const { extractCrlv } = await import("@/lib/crlv-ai");
    const crlv = await extractCrlv(Buffer.from(await file.arrayBuffer()).toString("base64"), file.type);
    return {
      ok: true,
      data: {
        proprietario: crlv.proprietario?.trim() || null,
        cpfCnpj: mascaraDocumento(crlv.cpfCnpj),
        placa: crlv.placa?.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || null,
        chassi: crlv.chassi?.replace(/\s+/g, "").toUpperCase() || null,
        renavam: crlv.renavam?.replace(/\D/g, "") || null,
        marca: crlv.marca?.trim() || null,
        modelo: crlv.modelo?.trim() || null,
        anoFabricacao: crlv.anoFabricacao,
        anoModelo: crlv.anoModelo,
        cor: crlv.cor?.trim() || null,
        combustivel: crlv.combustivel?.trim() || null,
        transmissao: crlv.transmissao?.trim() || null,
        exercicio: crlv.exercicio?.match(/\d{4}/)?.[0] ?? null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível ler o CRLV." };
  }
}

/** Conclui a pré-venda → gera a venda (movimenta dinheiro, exige caixa aberto). */
export async function convertIntermediationAction(preSaleId: string) {
  try {
    // Concluir é permissão à parte de montar a ficha (e da venda de estoque):
    // o vendedor pré-finaliza, quem tem esta permissão registra.
    await assertCan("vendas", "registrarterceiros");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lançamento bloqueado.";
    redirect(`/vendas/financiamento-terceiros/pre/${preSaleId}?erro=${encodeURIComponent(msg)}`);
  }
  let saleId: string;
  try {
    saleId = await convertIntermediationPreSale(preSaleId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Não foi possível concluir a operação.";
    redirect(`/vendas/financiamento-terceiros/pre/${preSaleId}?erro=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/vendas/financiamento-terceiros");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  redirect(`/vendas/financiamento-terceiros/${saleId}`);
}

/** Cancela a pré-venda (ainda não concluída) e apaga o veículo de terceiro. */
export async function cancelIntermediationPreSaleAction(preSaleId: string) {
  await assertCan("vendas", "terceiros");
  const pre = await prisma.preSale.findUnique({ where: { id: preSaleId } });
  if (pre && pre.status === "ABERTA") {
    await prisma.preSale.update({ where: { id: preSaleId }, data: { status: "CANCELADA" } });
    // O veículo de terceiro só existe por causa desta ficha: remove o órfão.
    await prisma.vehicle
      .deleteMany({ where: { id: pre.vehicleId, intermediation: true, sale: { is: null } } })
      .catch(() => {});
  }
  revalidatePath("/vendas/financiamento-terceiros");
  redirect("/vendas/financiamento-terceiros");
}

/**
 * Cancela uma operação já concluída (reverte os lançamentos) e REABRE a
 * pré-venda que a gerou — mesma regra da venda de estoque: a ficha volta a
 * ABERTA com tudo preenchido (veículo, comprador, proprietário, financeira,
 * valores, comissão), para ajustar e registrar de novo sem redigitar. Numa
 * operação já cancelada (modo "corrigir resíduos") nada é reaberto.
 */
export async function cancelIntermediationAction(id: string) {
  await assertCan("vendas", "cancelar");
  const before = await prisma.sale.findUnique({ where: { id }, select: { status: true } });
  const pre = await prisma.preSale.findFirst({
    where: { convertedSaleId: id, status: "CONVERTIDA", saleType: "FINANCIAMENTO_TERCEIROS" },
    select: { id: true },
  });
  await cancelVehicleSale(id);
  let reopenedPreSaleId: string | null = null;
  if (before?.status === "CONCLUIDA" && pre) {
    await prisma.preSale.update({
      where: { id: pre.id },
      data: { status: "ABERTA", convertedSaleId: null },
    });
    reopenedPreSaleId = pre.id;
  }
  revalidatePath("/vendas/financiamento-terceiros");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  if (reopenedPreSaleId) {
    revalidatePath(`/vendas/financiamento-terceiros/pre/${reopenedPreSaleId}`);
    redirect(`/vendas/financiamento-terceiros/pre/${reopenedPreSaleId}?reaberta=1`);
  }
  redirect(`/vendas/financiamento-terceiros/${id}`);
}
