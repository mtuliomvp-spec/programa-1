"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { lerNfeConfig } from "@/lib/nfe-config";
import { lerEndereco } from "@/lib/endereco";
import { montarNfse } from "@/lib/nfse";
import {
  cancelarNfsen,
  consultarNfsen,
  emitirNfsen,
  mensagemErroNfse,
  type Ambiente,
  type FocusNfse,
} from "@/lib/focus-nfe";

export type NfseActionResult = { ok: boolean; error?: string; faltas?: string[]; status?: string };

const STATUS: Record<string, string> = {
  processando_autorizacao: "PROCESSANDO",
  autorizado: "AUTORIZADA",
  cancelado: "CANCELADA",
  erro_autorizacao: "ERRO",
  negado: "ERRO",
};

async function aplicar(id: string, body: FocusNfse) {
  const nota = await prisma.notaServico.findUnique({ where: { id } });
  if (!nota) return null;
  const status = (body.status && STATUS[body.status]) || nota.status;
  return prisma.notaServico.update({
    where: { id },
    data: {
      status,
      mensagem: status === "ERRO" ? mensagemErroNfse(body) : nota.mensagem,
      numero: body.numero ?? nota.numero,
      codigoVerificacao: body.codigo_verificacao ?? nota.codigoVerificacao,
      url: body.url ?? nota.url,
      urlDanfse: body.url_danfse ?? nota.urlDanfse,
      caminhoXml: body.caminho_xml_nota_fiscal ?? nota.caminhoXml,
      ...(status === "CANCELADA" && !nota.canceladaEm ? { canceladaEm: new Date() } : {}),
    },
  });
}

export async function emitirNfseAction(input: {
  tomadorId: string;
  descricao: string;
  valor: number;
  competencia: string;
  informacoes?: string;
}): Promise<NfseActionResult> {
  try {
    await assertCan("financeiro", "nfse");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const user = await getSessionUser();
  const [company, tomador] = await Promise.all([
    getCompany(),
    input.tomadorId ? prisma.customer.findUnique({ where: { id: input.tomadorId } }) : null,
  ]);
  const cfg = lerNfeConfig(company.nfeConfig);
  const ambiente: Ambiente = cfg.ambiente;
  const agora = new Date();
  const r = montarNfse({
    cfg,
    empresa: { cnpj: company.cnpj },
    tomador: tomador
      ? {
          name: tomador.name,
          document: tomador.document,
          email: tomador.email,
          phone: tomador.phone,
          endereco: lerEndereco(tomador.endereco),
        }
      : null,
    descricao: input.descricao,
    valor: input.valor,
    competencia: input.competencia,
    informacoes: input.informacoes,
    agora,
  });
  if (!r.ok || !tomador) {
    return { ok: false, error: "Faltam dados para emitir a nota.", faltas: r.ok ? [] : r.faltas };
  }

  const ref = `fincore-s${ambiente === "PRODUCAO" ? "p" : "h"}-${agora.getTime().toString(36)}-${randomBytes(3).toString("hex")}`;
  const nota = await prisma.notaServico.create({
    data: {
      ambiente,
      ref,
      tomadorId: tomador.id,
      tomadorNome: tomador.name,
      tomadorDocumento: (tomador.document ?? "").replace(/\D/g, ""),
      descricao: input.descricao.trim(),
      valor: Math.round(input.valor * 100) / 100,
      competencia: new Date(`${input.competencia}T12:00:00Z`),
      payload: r.payload as object,
      emitidaPor: user?.name ?? null,
    },
  });

  const { http, body } = await emitirNfsen(ambiente, ref, r.payload);
  if (http === 201 || http === 202 || body.status) {
    const n = await aplicar(nota.id, body);
    revalidatePath("/financeiro/nfse");
    return { ok: true, status: n?.status };
  }
  await prisma.notaServico.update({
    where: { id: nota.id },
    data: { status: "ERRO", mensagem: mensagemErroNfse(body) },
  });
  revalidatePath("/financeiro/nfse");
  return { ok: false, error: mensagemErroNfse(body) };
}

/** Situação na Focus (enquanto o Ambiente Nacional processa). Sem revalidate: quem chama dá refresh. */
export async function atualizarNfseAction(id: string): Promise<NfseActionResult> {
  try {
    await assertCan("financeiro", "nfse");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const nota = await prisma.notaServico.findUnique({ where: { id } });
  if (!nota) return { ok: false, error: "Nota não encontrada." };
  const { body } = await consultarNfsen(nota.ambiente as Ambiente, nota.ref);
  if (!body.status) return { ok: false, error: mensagemErroNfse(body) };
  const n = await aplicar(id, body);
  return { ok: true, status: n?.status };
}

export async function cancelarNfseAction(id: string, justificativa: string): Promise<NfseActionResult> {
  try {
    await assertCan("financeiro", "nfsecancelar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const texto = justificativa.trim().replace(/\s+/g, " ");
  if (texto.length < 15 || texto.length > 255) {
    return { ok: false, error: "A justificativa precisa ter entre 15 e 255 caracteres." };
  }
  const nota = await prisma.notaServico.findUnique({ where: { id } });
  if (!nota) return { ok: false, error: "Nota não encontrada." };
  if (nota.status !== "AUTORIZADA") return { ok: false, error: "Só nota autorizada pode ser cancelada." };
  const { body } = await cancelarNfsen(nota.ambiente as Ambiente, nota.ref, texto);
  if (body.status === "cancelado") {
    await prisma.notaServico.update({ where: { id }, data: { justificativaCancelamento: texto } });
    await aplicar(id, body);
    revalidatePath("/financeiro/nfse");
    return { ok: true };
  }
  return { ok: false, error: mensagemErroNfse(body) };
}
