"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { lerNfeConfig } from "@/lib/nfe-config";
import { lerEndereco } from "@/lib/endereco";
import { montarNfeEntrada } from "@/lib/nfe-entrada";
import {
  baixarArquivo,
  cancelarNfe,
  consultarNfe,
  emitirNfe,
  mensagemDeErro,
  type Ambiente,
  type FocusNfe,
} from "@/lib/focus-nfe";

export type NfeActionResult = { ok: boolean; error?: string; faltas?: string[]; status?: string; message?: string };

const STATUS_FOCUS: Record<string, string> = {
  processando_autorizacao: "PROCESSANDO",
  autorizado: "AUTORIZADA",
  cancelado: "CANCELADA",
  erro_autorizacao: "ERRO",
  denegado: "ERRO",
};

/**
 * Grava na nota o que a Focus respondeu. Autorizada em PRODUÇÃO, a nota de
 * entrada vira a NF-e de entrada do veículo (chave, número, série, data — é o
 * que o Renave pede) e o XML e o DANFE vão para os anexos. Homologação é
 * teste: fica só no histórico.
 */
async function aplicarResposta(notaId: string, body: FocusNfe) {
  const nota = await prisma.notaFiscal.findUnique({ where: { id: notaId } });
  if (!nota) return null;
  const status = (body.status && STATUS_FOCUS[body.status]) || nota.status;
  const chave = body.chave_nfe?.replace(/^NFe/, "") || nota.chave;
  const atualizada = await prisma.notaFiscal.update({
    where: { id: nota.id },
    data: {
      status,
      statusSefaz: body.status_sefaz ?? nota.statusSefaz,
      mensagem:
        status === "ERRO" ? mensagemDeErro(body) : (body.mensagem_sefaz ?? nota.mensagem),
      chave,
      numero: body.numero ?? nota.numero,
      serie: body.serie ?? nota.serie,
      protocolo: body.protocolo ?? nota.protocolo,
      caminhoXml: body.caminho_xml_nota_fiscal ?? nota.caminhoXml,
      caminhoDanfe: body.caminho_danfe ?? nota.caminhoDanfe,
      ...(status === "CANCELADA" && !nota.canceladaEm ? { canceladaEm: new Date() } : {}),
    },
  });

  if (nota.tipo === "ENTRADA" && nota.ambiente === "PRODUCAO") {
    if (status === "AUTORIZADA" && nota.status !== "AUTORIZADA" && chave) {
      await prisma.vehicle.update({
        where: { id: nota.vehicleId },
        data: {
          entryNfeKey: chave,
          entryNfeNumber: atualizada.numero,
          entryNfeSerie: atualizada.serie,
          entryNfeIssuedAt: atualizada.createdAt,
        },
      });
      await anexarArquivos(atualizada.id);
    }
    if (status === "CANCELADA" && chave) {
      await prisma.vehicle.updateMany({
        where: { id: nota.vehicleId, entryNfeKey: chave },
        data: { entryNfeKey: null, entryNfeNumber: null, entryNfeSerie: null, entryNfeIssuedAt: null },
      });
    }
  }
  return atualizada;
}

/** XML e DANFE da nota autorizada viram anexos do veículo (cópia local). */
async function anexarArquivos(notaId: string) {
  const nota = await prisma.notaFiscal.findUnique({ where: { id: notaId } });
  if (!nota) return;
  const ambiente = nota.ambiente as Ambiente;
  const rotulo = `NF-e de ${nota.tipo === "ENTRADA" ? "entrada" : "saída"} nº ${nota.numero ?? "?"}`;
  for (const [caminho, ext, mime, desc] of [
    [nota.caminhoXml, "xml", "application/xml", `${rotulo} (XML)`],
    [nota.caminhoDanfe, "pdf", "application/pdf", `${rotulo} (DANFE)`],
  ] as const) {
    if (!caminho) continue;
    const res = await baixarArquivo(ambiente, caminho);
    if (!res) continue;
    const data = Buffer.from(await res.arrayBuffer());
    await prisma.vehicleAttachment.create({
      data: {
        vehicleId: nota.vehicleId,
        kind: "DOCUMENTO",
        description: desc,
        filename: `${nota.chave ?? nota.ref}.${ext}`,
        mimeType: mime,
        size: data.length,
        data,
      },
    });
  }
}

export async function emitirNfeEntradaAction(
  vehicleId: string,
  ajustes: { ncm?: string; descricao?: string; informacoes?: string },
): Promise<NfeActionResult> {
  try {
    await assertCan("estoque", "nfe");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const user = await getSessionUser();
  const [vehicle, company] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: vehicleId }, include: { supplier: true } }),
    getCompany(),
  ]);
  if (!vehicle) return { ok: false, error: "Veículo não encontrado." };
  const cfg = lerNfeConfig(company.nfeConfig);
  const ambiente: Ambiente = cfg.ambiente;

  // Uma nota de entrada válida por ambiente: outra só depois de cancelar.
  const existente = await prisma.notaFiscal.findFirst({
    where: { vehicleId, tipo: "ENTRADA", ambiente, status: { in: ["PROCESSANDO", "AUTORIZADA"] } },
  });
  if (existente) {
    return {
      ok: false,
      error:
        existente.status === "PROCESSANDO"
          ? "Já há uma nota de entrada em processamento — aguarde a resposta da SEFAZ."
          : "Este veículo já tem NF-e de entrada autorizada neste ambiente. Para emitir outra, cancele a atual.",
    };
  }

  const agora = new Date();
  const r = montarNfeEntrada({
    cfg,
    empresa: { cnpj: company.cnpj, inscricaoEstadual: company.inscricaoEstadual, uf: company.uf },
    veiculo: vehicle,
    vendedor: vehicle.supplier
      ? {
          name: vehicle.supplier.name,
          document: vehicle.supplier.document,
          phone: vehicle.supplier.phone,
          endereco: lerEndereco(vehicle.supplier.endereco),
        }
      : null,
    agora,
    ...ajustes,
  });
  if (!r.ok) return { ok: false, error: "Faltam dados para emitir a nota.", faltas: r.faltas };

  const ref = `fincore-${ambiente === "PRODUCAO" ? "p" : "h"}-${agora.getTime().toString(36)}-${randomBytes(3).toString("hex")}`;
  const nota = await prisma.notaFiscal.create({
    data: {
      vehicleId,
      tipo: "ENTRADA",
      ambiente,
      ref,
      valor: r.valor,
      cfop: r.cfop,
      payload: r.payload as object,
      emitidaPor: user?.name ?? null,
    },
  });

  const { http, body } = await emitirNfe(ambiente, ref, r.payload);
  if (http === 201 || http === 202 || body.status) {
    const n = await aplicarResposta(nota.id, body);
    revalidatePath(`/estoque/${vehicleId}`);
    return { ok: true, status: n?.status, message: n?.status === "AUTORIZADA" ? "Nota autorizada." : "Nota enviada à SEFAZ." };
  }
  await prisma.notaFiscal.update({
    where: { id: nota.id },
    data: { status: "ERRO", mensagem: mensagemDeErro(body), statusSefaz: body.codigo ?? String(http) },
  });
  revalidatePath(`/estoque/${vehicleId}`);
  return { ok: false, error: mensagemDeErro(body) };
}

/** Pergunta à Focus a situação da nota (usado enquanto a SEFAZ processa). */
export async function atualizarNfeAction(notaId: string): Promise<NfeActionResult> {
  try {
    await assertCan("estoque", "nfe");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const nota = await prisma.notaFiscal.findUnique({ where: { id: notaId } });
  if (!nota) return { ok: false, error: "Nota não encontrada." };
  const { body } = await consultarNfe(nota.ambiente as Ambiente, nota.ref);
  if (!body.status) return { ok: false, error: mensagemDeErro(body) };
  // Sem revalidatePath: quem chama (consulta periódica / botão) faz o
  // router.refresh() quando a situação muda — os dois juntos competiam.
  const n = await aplicarResposta(nota.id, body);
  return { ok: true, status: n?.status };
}

export async function cancelarNfeAction(notaId: string, justificativa: string): Promise<NfeActionResult> {
  try {
    await assertCan("estoque", "nfecancelar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const texto = justificativa.trim().replace(/\s+/g, " ");
  if (texto.length < 15 || texto.length > 255) {
    return { ok: false, error: "A justificativa precisa ter entre 15 e 255 caracteres." };
  }
  const nota = await prisma.notaFiscal.findUnique({ where: { id: notaId } });
  if (!nota) return { ok: false, error: "Nota não encontrada." };
  if (nota.status !== "AUTORIZADA") return { ok: false, error: "Só nota autorizada pode ser cancelada." };

  const { body } = await cancelarNfe(nota.ambiente as Ambiente, nota.ref, texto);
  if (body.status === "cancelado") {
    await prisma.notaFiscal.update({ where: { id: nota.id }, data: { justificativaCancelamento: texto } });
    await aplicarResposta(nota.id, body);
    revalidatePath(`/estoque/${nota.vehicleId}`);
    return { ok: true, message: "Nota cancelada." };
  }
  return { ok: false, error: mensagemDeErro(body) };
}
