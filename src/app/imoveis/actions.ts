"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { CATEGORIA_ANEXO_KEYS, MAX_ANEXO_IMOVEL, PARTE_UPLOAD_IMOVEL } from "@/lib/imoveis";

const imovelSchema = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(1, "Informe um nome para o imóvel."),
  tipo: z.enum(["RURAL", "URBANO"]).default("RURAL"),
  proprietario: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
  area: z.string().optional(),
  cib: z.string().optional(),
  inscricaoMunicipal: z.string().optional(),
  matricula: z.string().optional(),
  cartorio: z.string().optional(),
  endereco: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().optional(),
  notes: z.string().optional(),
  ativo: z.string().optional(),
});

export type ImovelFormState = { error?: string };

const vazioNulo = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/** Cadastra ou atualiza um imóvel. */
export async function salvarImovelAction(_prev: ImovelFormState, formData: FormData): Promise<ImovelFormState> {
  const parsed = imovelSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  try {
    await assertCan("imoveis", d.id ? "editar" : "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const data = {
    nome: d.nome,
    tipo: d.tipo,
    proprietario: vazioNulo(d.proprietario),
    capitalBeneficiaryId: vazioNulo(d.capitalBeneficiaryId),
    area: vazioNulo(d.area),
    cib: vazioNulo(d.cib),
    inscricaoMunicipal: vazioNulo(d.inscricaoMunicipal),
    matricula: vazioNulo(d.matricula),
    cartorio: vazioNulo(d.cartorio),
    endereco: vazioNulo(d.endereco),
    municipio: vazioNulo(d.municipio),
    uf: vazioNulo(d.uf)?.toUpperCase().slice(0, 2) ?? null,
    notes: vazioNulo(d.notes),
  };
  let id = d.id;
  if (id) {
    await prisma.imovel.update({ where: { id }, data: { ...data, ativo: d.ativo !== "false" } });
  } else {
    id = (await prisma.imovel.create({ data, select: { id: true } })).id;
  }
  revalidatePath("/imoveis");
  revalidatePath(`/imoveis/${id}`);
  redirect(`/imoveis/${id}`);
}

/**
 * Exclui o imóvel e os documentos dele. As contas (títulos e recorrências)
 * ficam — são do financeiro —, só perdem o vínculo.
 */
export async function excluirImovelAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("imoveis", "excluir");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  await prisma.imovel.delete({ where: { id } });
  revalidatePath("/imoveis");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Documentos — sobem em partes de até 3 MB
// ---------------------------------------------------------------------------

export type ParteResult = { ok: boolean; id?: string; error?: string };

const parteDe = async (fd: FormData) => {
  const parte = fd.get("parte");
  if (!(parte instanceof Blob) || parte.size === 0) return null;
  if (parte.size > PARTE_UPLOAD_IMOVEL + 1024) return null;
  return Buffer.from(await parte.arrayBuffer());
};

/**
 * Começa um documento com a primeira parte do arquivo. Arquivo pequeno chega
 * inteiro aqui (`final`); o grande continua em `continuarAnexoImovelAction`.
 * Até a última parte chegar, o documento fica marcado como incompleto.
 */
export async function iniciarAnexoImovelAction(fd: FormData): Promise<ParteResult> {
  try {
    await assertCan("imoveis", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const imovelId = String(fd.get("imovelId") || "");
  const categoria = String(fd.get("categoria") || "OUTRO");
  const size = Number(fd.get("size") || 0);
  const exercicioTxt = String(fd.get("exercicio") || "").trim();
  const exercicio = /^\d{4}$/.test(exercicioTxt) ? Number(exercicioTxt) : null;
  const filename = String(fd.get("filename") || "documento").slice(0, 200);
  const description = String(fd.get("description") || "").trim() || filename.replace(/\.[^.]+$/, "");
  if (!(CATEGORIA_ANEXO_KEYS as readonly string[]).includes(categoria)) return { ok: false, error: "Categoria inválida." };
  if (!(size > 0) || size > MAX_ANEXO_IMOVEL) {
    return { ok: false, error: `Arquivo vazio ou grande demais (máximo ${MAX_ANEXO_IMOVEL / 1024 / 1024} MB).` };
  }
  const parte = await parteDe(fd);
  if (!parte) return { ok: false, error: "Parte do arquivo inválida." };
  const imovel = await prisma.imovel.findUnique({ where: { id: imovelId }, select: { id: true } });
  if (!imovel) return { ok: false, error: "Imóvel não encontrado." };

  const criado = await prisma.imovelAnexo.create({
    data: {
      imovelId,
      categoria,
      exercicio,
      description: description.slice(0, 200),
      filename,
      mimeType: String(fd.get("mimeType") || "") || "application/octet-stream",
      size,
      data: new Uint8Array(parte),
      completo: parte.byteLength === size,
    },
    select: { id: true, completo: true },
  });
  if (criado.completo) revalidatePath(`/imoveis/${imovelId}`);
  return { ok: true, id: criado.id };
}

/**
 * Acrescenta a próxima parte. `offset` é quanto já foi gravado: a gravação só
 * acontece se bater com o banco, então uma parte repetida ou fora de ordem não
 * corrompe o arquivo.
 */
export async function continuarAnexoImovelAction(fd: FormData): Promise<ParteResult> {
  try {
    await assertCan("imoveis", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const id = String(fd.get("id") || "");
  const offset = Number(fd.get("offset") || -1);
  const parte = await parteDe(fd);
  if (!id || !(offset > 0) || !parte) return { ok: false, error: "Parte do arquivo inválida." };
  const anexo = await prisma.imovelAnexo.findUnique({
    where: { id },
    select: { size: true, imovelId: true, completo: true },
  });
  if (!anexo || anexo.completo) return { ok: false, error: "Documento não encontrado ou já completo." };
  const completo = offset + parte.byteLength === anexo.size;
  const n = await prisma.$executeRaw`
    UPDATE "imovel_anexos"
       SET "data" = "data" || ${parte}, "completo" = ${completo}
     WHERE "id" = ${id} AND octet_length("data") = ${offset} AND "completo" = false`;
  if (n !== 1) return { ok: false, error: "A parte chegou fora de ordem — envie o arquivo de novo." };
  if (completo) revalidatePath(`/imoveis/${anexo.imovelId}`);
  return { ok: true, id };
}

export async function excluirAnexoImovelAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const anexo = await prisma.imovelAnexo.findUnique({ where: { id }, select: { imovelId: true, completo: true } });
  if (!anexo) return { ok: true };
  try {
    // Envio que falhou no meio: quem estava enviando limpa o pedaço que ficou.
    await assertCan("imoveis", anexo.completo ? "excluir" : "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  await prisma.imovelAnexo.delete({ where: { id } });
  revalidatePath(`/imoveis/${anexo.imovelId}`);
  return { ok: true };
}
