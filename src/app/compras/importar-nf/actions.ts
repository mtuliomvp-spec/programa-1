"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import { formatRequestNumber, parseDateInput } from "@/lib/format";
import { resolveDespesaCategory } from "@/lib/categories";
import { findSupplierByIdentity } from "@/lib/person-dedupe";
import { docKey } from "@/lib/person-keys";
import { nextRequestSeq } from "@/lib/purchase-requests";
import { normalizeCategoria } from "@/lib/nfe-ai";
import type { NfeExtraida, NfeItem } from "@/lib/nfe-ai";

const MAX_NF_BYTES = 15 * 1024 * 1024; // 15 MB (mesmo limite dos demais anexos)

export type ImportNfResult = {
  ok: boolean;
  /** Nome do arquivo, para o resumo na tela. */
  filename: string;
  /** "0021/2026" quando criada. */
  numero?: string;
  supplier?: string;
  documentNumber?: string;
  total?: number;
  /** Já existia uma solicitação com esta nota deste fornecedor. */
  duplicated?: boolean;
  error?: string;
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** "1x Jogo pastilha freio dianteiro — R$ 132,93" por linha. */
function itemsText(itens: NfeItem[]): string {
  return itens
    .map((i) => {
      const qtd = i.quantidade && i.quantidade !== 1 ? `${formatQty(i.quantidade)}x ` : "";
      const valor = i.valorTotal != null ? ` — ${brl(i.valorTotal)}` : "";
      return `${qtd}${i.descricao}${valor}`;
    })
    .join("\n");
}

const formatQty = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

/** Texto dos "Detalhes / justificativa" da solicitação. */
function detailsText(nf: NfeExtraida): string {
  const parts: string[] = [];
  if (nf.itens.length) parts.push(itemsText(nf.itens));
  const rodape: string[] = [];
  if (nf.naturezaOperacao) rodape.push(nf.naturezaOperacao);
  if (nf.formaPagamento) rodape.push(`Pagamento: ${nf.formaPagamento}`);
  if (nf.serie) rodape.push(`Série ${nf.serie}`);
  if (rodape.length) parts.push(rodape.join(" · "));
  return parts.join("\n\n");
}

/**
 * Lê UMA nota fiscal (PDF ou foto) e cria a solicitação de compra já
 * preenchida, no fluxo Veículos e SEM placa — é a placa que o dono escolhe
 * depois, e sem ela a aprovação é recusada (ver `generateEspelho`).
 *
 * Nada entra em Contas a pagar aqui: a solicitação nasce PENDENTE e só gera
 * título na aprovação. Idempotente por fornecedor + número da nota.
 *
 * Uma nota por chamada: a tela envia os arquivos em sequência, para uma nota
 * ruim não derrubar o lote e para a leitura não estourar o tempo da função.
 */
export async function importNfAction(formData: FormData): Promise<ImportNfResult> {
  const file = formData.get("file");
  const filename = file instanceof File ? file.name || "nota" : "nota";
  const fail = (error: string): ImportNfResult => ({ ok: false, filename, error });

  let user;
  try {
    user = await getSessionUser();
    if (!user) return fail("Sessão expirada. Entre de novo.");
    await assertCan("compras", "criar");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Sem permissão.");
  }

  if (!(file instanceof File) || file.size === 0) return fail("Selecione o arquivo da nota.");
  if (file.size > MAX_NF_BYTES) return fail("Arquivo muito grande (máximo 15 MB).");
  const mimeType =
    file.type || (filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (!mimeType) return fail("Não reconheci o tipo do arquivo. Envie a nota em PDF ou foto.");

  const bytes = new Uint8Array(await file.arrayBuffer());

  let nf: NfeExtraida;
  try {
    const { extractNfe } = await import("@/lib/nfe-ai");
    nf = await extractNfe(Buffer.from(bytes).toString("base64"), mimeType);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Não foi possível ler a nota.");
  }

  const total = nf.valorTotal ?? nf.itens.reduce((s, i) => s + (i.valorTotal ?? 0), 0);
  if (!total || total <= 0) return fail("Não achei o valor total na nota. Lance a compra à mão.");

  const emitente = (nf.emitenteNome || "").trim();
  if (!emitente && !docKey(nf.emitenteCnpj)) {
    return fail("Não achei o fornecedor na nota. Lance a compra à mão.");
  }

  // Fornecedor pelo CNPJ (ou pelo nome, se o CNPJ não vier): mesma regra de
  // identidade da unificação de cadastros, para não nascer um repetido.
  const nome = emitente || "Fornecedor da nota";
  const existing = await findSupplierByIdentity(nome, nf.emitenteCnpj);
  const supplier = existing
    ? { id: existing.id, name: existing.name }
    : await prisma.supplier.create({
        data: { name: nome, document: nf.emitenteCnpj?.trim() || null },
        select: { id: true, name: true },
      });

  const documentNumber = (nf.numero || "").trim() || null;
  if (documentNumber) {
    const already = await prisma.purchaseRequest.findFirst({
      where: { supplierId: supplier.id, documentNumber },
      select: { seq: true, year: true },
    });
    if (already) {
      return {
        ok: true,
        filename,
        duplicated: true,
        supplier: supplier.name,
        documentNumber,
        numero: formatRequestNumber(already.seq, already.year),
      };
    }
  }

  const cat = await resolveDespesaCategory(normalizeCategoria(nf.categoria));
  const description = `NF ${documentNumber ?? "s/nº"} — ${supplier.name}`;
  const emitida = nf.emitidaEm && /^\d{4}-\d{2}-\d{2}$/.test(nf.emitidaEm) ? nf.emitidaEm : null;
  const year = new Date().getFullYear();

  const created = await prisma.$transaction(async (tx) => {
    const seq = await nextRequestSeq(tx, year);
    const request = await tx.purchaseRequest.create({
      data: {
        description,
        details: detailsText(nf) || null,
        estimatedAmount: total,
        dueDate: emitida ? parseDateInput(emitida) : null,
        documentNumber,
        category: cat.category,
        categoryLabel: cat.label,
        installmentsCount: 1,
        supplierId: supplier.id,
        // Fluxo pré-determinado, sem a placa: é o "no ponto de colocar a placa".
        structuralKey: "VEICULOS",
        vehicleId: null,
        requestedBy: user.name,
        year,
        seq,
      },
      select: { id: true, seq: true, year: true },
    });
    await tx.purchaseRequestAttachment.create({
      data: {
        purchaseRequestId: request.id,
        description: nf.chaveAcesso ? `NF-e · chave ${nf.chaveAcesso}` : "Nota fiscal",
        filename,
        mimeType,
        size: bytes.byteLength,
        data: bytes,
      },
    });
    return request;
  });

  revalidatePath("/compras");
  return {
    ok: true,
    filename,
    numero: formatRequestNumber(created.seq, created.year),
    supplier: supplier.name,
    documentNumber: documentNumber ?? undefined,
    total,
  };
}
