"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { CATEGORIA_ANEXO_KEYS, MAX_ANEXO_IMOVEL, PARTE_UPLOAD_IMOVEL, rotuloCategoriaAnexo } from "@/lib/imoveis";

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
  // Registro lido pela IA no "Novo imóvel" (rascunho): passa a ser do imóvel.
  anexoRegistroId: z.string().optional(),
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
    if (d.anexoRegistroId) {
      await prisma.imovelAnexo.updateMany({
        where: { id: d.anexoRegistroId, imovelId: null, completo: true },
        data: { imovelId: id },
      });
    }
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
  if (imovelId) {
    const imovel = await prisma.imovel.findUnique({ where: { id: imovelId }, select: { id: true } });
    if (!imovel) return { ok: false, error: "Imóvel não encontrado." };
  } else {
    // Rascunho (registro lido no "Novo imóvel"): os abandonados há mais de um
    // dia saem aqui mesmo, sem rotina à parte.
    await prisma.imovelAnexo.deleteMany({
      where: { imovelId: null, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  }

  const criado = await prisma.imovelAnexo.create({
    data: {
      imovelId: imovelId || null,
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
  if (criado.completo && imovelId) revalidatePath(`/imoveis/${imovelId}`);
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
  if (completo && anexo.imovelId) revalidatePath(`/imoveis/${anexo.imovelId}`);
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
  if (anexo.imovelId) revalidatePath(`/imoveis/${anexo.imovelId}`);
  return { ok: true };
}

/** Corrige o tipo, o ano ou a descrição de um documento (quando a IA errou ou não leu). */
export async function alterarAnexoImovelAction(input: {
  id: string;
  categoria: string;
  exercicio: string;
  description: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertCan("imoveis", "editar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!(CATEGORIA_ANEXO_KEYS as readonly string[]).includes(input.categoria)) return { ok: false, error: "Tipo inválido." };
  const ano = input.exercicio.trim();
  const anexo = await prisma.imovelAnexo.update({
    where: { id: input.id },
    data: {
      categoria: input.categoria,
      exercicio: /^\d{4}$/.test(ano) ? Number(ano) : null,
      ...(input.description.trim() ? { description: input.description.trim().slice(0, 200) } : {}),
    },
    select: { imovelId: true },
  });
  if (anexo.imovelId) revalidatePath(`/imoveis/${anexo.imovelId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Leitura pela IA
// ---------------------------------------------------------------------------

/** Campos do imóvel que a leitura sabe preencher (texto; "" = não achou). */
export type DadosLidosImovel = {
  nome: string;
  tipo: string;
  proprietario: string;
  cib: string;
  inscricaoMunicipal: string;
  area: string;
  matricula: string;
  cartorio: string;
  endereco: string;
  municipio: string;
  uf: string;
  notes: string;
};

async function lerAnexo(id: string) {
  const anexo = await prisma.imovelAnexo.findUnique({
    where: { id },
    select: { id: true, data: true, mimeType: true, completo: true, imovelId: true, description: true, filename: true },
  });
  if (!anexo || !anexo.completo) throw new Error("Documento não encontrado (o envio terminou?).");
  const { lerDocumentoImovel } = await import("@/lib/imovel-doc-ai");
  const leitura = await lerDocumentoImovel(Buffer.from(anexo.data), anexo.mimeType);
  return { anexo, leitura };
}

const dadosDaLeitura = (l: Awaited<ReturnType<typeof lerAnexo>>["leitura"]): DadosLidosImovel => ({
  nome: l.nome.trim(),
  tipo: l.tipoImovel,
  proprietario: l.proprietario.trim(),
  cib: l.cib.trim(),
  inscricaoMunicipal: l.inscricaoMunicipal.trim(),
  area: l.area.trim(),
  matricula: l.matricula.trim(),
  cartorio: l.cartorio.trim(),
  endereco: l.endereco.trim(),
  municipio: l.municipio.trim(),
  uf: l.uf,
  notes: l.observacoes.trim(),
});

/**
 * "Novo imóvel": lê o registro (já enviado como rascunho) e devolve os campos
 * para o formulário. Nada é salvo aqui — quem confere e salva é o usuário.
 */
export async function lerRegistroImovelAction(
  id: string,
): Promise<{ ok: boolean; error?: string; dados?: DadosLidosImovel; tipoDocumento?: string; aviso?: string }> {
  try {
    await assertCan("imoveis", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  try {
    const { anexo, leitura } = await lerAnexo(id);
    // O rascunho já fica com o tipo e a descrição certos para quando for ligado.
    await prisma.imovelAnexo.update({
      where: { id: anexo.id },
      data: {
        categoria: leitura.tipoDocumento,
        exercicio: leitura.exercicio ? Number(leitura.exercicio) : null,
        ...(leitura.descricao ? { description: leitura.descricao } : {}),
      },
    });
    return {
      ok: true,
      dados: dadosDaLeitura(leitura),
      tipoDocumento: leitura.tipoDocumento,
      aviso:
        leitura.tipoDocumento === "ESCRITURA"
          ? undefined
          : `Este arquivo parece ser "${rotuloCategoriaAnexo(leitura.tipoDocumento)}", não o registro do imóvel — preenchi o que deu para ler.`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível ler o documento." };
  }
}

/** Campos da ficha que a leitura pode completar (só os que estão VAZIOS). */
const CAMPOS_COMPLETAVEIS = ["proprietario", "cib", "inscricaoMunicipal", "area", "matricula", "cartorio", "endereco", "municipio", "uf"] as const;
const ROTULO_CAMPO: Record<(typeof CAMPOS_COMPLETAVEIS)[number], string> = {
  proprietario: "proprietário",
  cib: "CIB",
  inscricaoMunicipal: "inscrição municipal",
  area: "área",
  matricula: "matrícula",
  cartorio: "cartório",
  endereco: "endereço",
  municipio: "município",
  uf: "UF",
};

/**
 * Documento anexado na ficha: a IA diz o tipo, o ano e uma descrição útil. Se
 * for o registro (ou um documento do ITR), completa os campos da ficha que
 * ainda estão vazios — nunca troca o que alguém já digitou.
 */
export async function identificarAnexoImovelAction(
  id: string,
  manterDescricao = false,
): Promise<{ ok: boolean; error?: string; resumo?: string }> {
  try {
    await assertCan("imoveis", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  try {
    const { anexo, leitura } = await lerAnexo(id);
    await prisma.imovelAnexo.update({
      where: { id: anexo.id },
      data: {
        categoria: leitura.tipoDocumento,
        exercicio: leitura.exercicio ? Number(leitura.exercicio) : null,
        ...(!manterDescricao && leitura.descricao ? { description: leitura.descricao } : {}),
      },
    });
    let completados: string[] = [];
    if (anexo.imovelId && ["ESCRITURA", "ITR_DECLARACAO", "ITR_RECIBO"].includes(leitura.tipoDocumento)) {
      const imovel = await prisma.imovel.findUnique({ where: { id: anexo.imovelId } });
      if (imovel) {
        const lidos = dadosDaLeitura(leitura);
        const data: Record<string, string> = {};
        for (const campo of CAMPOS_COMPLETAVEIS) {
          if (!imovel[campo] && lidos[campo]) data[campo] = lidos[campo];
        }
        completados = Object.keys(data).map((k) => ROTULO_CAMPO[k as (typeof CAMPOS_COMPLETAVEIS)[number]]);
        if (completados.length) await prisma.imovel.update({ where: { id: imovel.id }, data });
      }
    }
    if (anexo.imovelId) revalidatePath(`/imoveis/${anexo.imovelId}`);
    const tipo = rotuloCategoriaAnexo(leitura.tipoDocumento);
    return {
      ok: true,
      resumo:
        `${tipo}${leitura.exercicio ? ` ${leitura.exercicio}` : ""}` +
        (completados.length ? ` — completei na ficha: ${completados.join(", ")}` : ""),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível identificar o documento." };
  }
}
