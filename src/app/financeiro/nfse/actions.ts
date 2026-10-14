"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { lerNfeConfig } from "@/lib/nfe-config";
import { enderecoTexto, lerEndereco, normalizarEndereco } from "@/lib/endereco";
import { lookupCnpj } from "@/lib/cnpj-lookup";
import { tomadorPorCnpj, tomadorPorNome, type TomadorConhecido } from "@/lib/tomadores-nfse";
import { docKey } from "@/lib/person-keys";
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

const fmtCnpj = (n: string) => `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;

/**
 * Liga a financeira (Contas e caixas) ao cadastro fiscal do banco — o tomador
 * da NFS-e. Busca razão social e endereço na Receita (BrasilAPI) pelo CNPJ;
 * reaproveita o cliente se o CNPJ já existir. Feito uma vez por financeira.
 */
/** Cliente (cadastro fiscal) de um banco das notas já emitidas — reaproveita se o CNPJ existir. */
async function clienteDoConhecido(conhecido: TomadorConhecido, nomeConta: string) {
  const cnpj = conhecido.cnpj.replace(/\D/g, "");
  const clientes = await prisma.customer.findMany({
    where: { document: { not: null } },
    select: { id: true, document: true, name: true },
  });
  const existente = clientes.find((c) => docKey(c.document) === cnpj);
  if (existente) return existente;
  return prisma.customer.create({
    data: {
      name: conhecido.nome,
      document: conhecido.cnpj,
      email: conhecido.email ?? null,
      phone: conhecido.telefone ?? null,
      endereco: conhecido.endereco,
      address: enderecoTexto(conhecido.endereco),
      notes: `Tomador de NFS-e (financeira ${nomeConta}) — dados das notas já emitidas.`,
    },
    select: { id: true, document: true, name: true },
  });
}

export async function vincularFinanceiraAction(
  financeiraId: string,
  cnpjDigitado: string,
  razaoSocial?: string,
): Promise<NfseActionResult & { tomador?: { name: string; document: string } }> {
  try {
    await assertCan("financeiro", "nfse");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const cnpj = cnpjDigitado.replace(/\D/g, "");
  if (cnpj.length !== 14) return { ok: false, error: "Digite os 14 números do CNPJ da financeira." };
  const conta = await prisma.financialAccount.findUnique({ where: { id: financeiraId } });
  if (!conta || conta.type !== "FINANCEIRA") return { ok: false, error: "Financeira não encontrada." };

  const clientes = await prisma.customer.findMany({ where: { document: { not: null } }, select: { id: true, document: true, name: true } });
  let cliente = clientes.find((c) => docKey(c.document) === cnpj) ?? null;
  // Banco das notas que a loja já emitiu: dados das próprias notas, sem Receita.
  const conhecido = tomadorPorCnpj(cnpj);
  if (!cliente && conhecido) cliente = await clienteDoConhecido(conhecido, conta.name);
  if (!cliente) {
    const r = await lookupCnpj(cnpj);
    const nome = r.ok ? r.data.name : razaoSocial?.trim();
    if (!nome) {
      return {
        ok: false,
        error: `${r.ok ? "" : r.error + " "}Informe a razão social para cadastrar mesmo assim.`,
      };
    }
    const end = r.ok && r.data.endereco ? normalizarEndereco(r.data.endereco) : null;
    cliente = await prisma.customer.create({
      data: {
        name: nome.slice(0, 150),
        document: fmtCnpj(cnpj),
        email: r.ok ? (r.data.email ?? null) : null,
        phone: r.ok ? (r.data.phone ?? null) : null,
        endereco: end ?? undefined,
        address: end ? enderecoTexto(end) : r.ok ? (r.data.address ?? null) : null,
        notes: `Tomador de NFS-e (financeira ${conta.name}).`,
      },
      select: { id: true, document: true, name: true },
    });
  }
  await prisma.financialAccount.update({ where: { id: conta.id }, data: { nfseTomadorId: cliente.id } });
  revalidatePath("/financeiro/nfse");
  return { ok: true, tomador: { name: cliente.name, document: cliente.document ?? "" } };
}

export async function emitirNfseAction(input: {
  financeiraId: string;
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
  const [company, financeira] = await Promise.all([
    getCompany(),
    input.financeiraId
      ? prisma.financialAccount.findUnique({ where: { id: input.financeiraId }, include: { nfseTomador: true } })
      : null,
  ]);
  if (!financeira || financeira.type !== "FINANCEIRA") return { ok: false, error: "Escolha a financeira." };
  let tomador = financeira.nfseTomador;
  // Financeira ainda sem vínculo, mas reconhecida pelo nome entre os bancos das
  // notas já emitidas: liga sozinha, sem pedir nada.
  if (!tomador) {
    const conhecido = tomadorPorNome(financeira.name);
    if (conhecido) {
      const c = await clienteDoConhecido(conhecido, financeira.name);
      await prisma.financialAccount.update({ where: { id: financeira.id }, data: { nfseTomadorId: c.id } });
      tomador = await prisma.customer.findUnique({ where: { id: c.id } });
    }
  }
  if (!tomador) return { ok: false, error: `Informe o CNPJ da financeira ${financeira.name} antes de emitir.` };
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
      financeiraId: financeira.id,
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
