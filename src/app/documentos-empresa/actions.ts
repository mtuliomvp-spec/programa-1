"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export type CompanyDocState = { error?: string; ok?: boolean };

/** Anexa um documento da empresa (guardado como bytea no próprio banco). */
export async function uploadCompanyDocumentAction(
  _prev: CompanyDocState,
  formData: FormData,
): Promise<CompanyDocState> {
  try {
    await assertCan("documentos_empresa", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const description = String(formData.get("description") || "").trim() || "Documento";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo." };
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { error: "Arquivo muito grande (máximo 15 MB)." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await prisma.companyDocument.create({
    data: {
      description,
      filename: file.name || "documento",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      data: buffer,
    },
  });
  revalidatePath("/documentos-empresa");
  return { ok: true };
}

export async function deleteCompanyDocumentAction(id: string) {
  await assertCan("documentos_empresa", "excluir");
  await prisma.companyDocument.deleteMany({ where: { id } });
  revalidatePath("/documentos-empresa");
}
