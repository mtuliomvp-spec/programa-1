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
import { tomadorPorCnpj, tomadorPorNome, tomadorSeguroDe, type TomadorConhecido } from "@/lib/tomadores-nfse";
import { docKey } from "@/lib/person-keys";
import { ehNotaDeSeguro, montarNfse } from "@/lib/nfse";
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

export type TipoNota = "RETORNO" | "SEGURO";

/** Nota rejeitada ou cancelada não cobre mais nada: retornos/seguros voltam a ficar sem NF. */
async function liberarRetornos(notaId: string) {
  await prisma.sale.updateMany({ where: { returnNfseId: notaId }, data: { returnNfseId: null } });
  await prisma.sale.updateMany({ where: { insuranceNfseId: notaId }, data: { insuranceNfseId: null } });
}

/**
 * Liga os retornos (ou, na nota de seguro, as comissões de seguro) das vendas
 * financiadas à nota — só os da financeira dela e que não estejam numa outra
 * nota válida. Devolve quantos ficaram ligados.
 */
async function ligarRetornos(notaId: string, financeiraId: string, saleIds: string[], tipo: TipoNota) {
  const ids = [...new Set(saleIds)].slice(0, 200);
  if (!ids.length) return 0;
  const base = { id: { in: ids }, financerAccountId: financeiraId, paymentMethod: "FINANCIADO" as const };
  const livre = ["ERRO", "CANCELADA"];
  const r =
    tipo === "SEGURO"
      ? await prisma.sale.updateMany({
          where: {
            ...base,
            insuranceSold: true,
            OR: [
              { insuranceNfseId: null },
              { insuranceNfseId: notaId },
              { insuranceNfse: { status: { in: livre } } },
            ],
          },
          data: { insuranceNfseId: notaId },
        })
      : await prisma.sale.updateMany({
          where: {
            ...base,
            returnNet: { gt: 0 },
            OR: [{ returnNfseId: null }, { returnNfseId: notaId }, { returnNfse: { status: { in: livre } } }],
          },
          data: { returnNfseId: notaId },
        });
  return r.count;
}

async function aplicar(id: string, body: FocusNfse) {
  const nota = await prisma.notaServico.findUnique({ where: { id } });
  if (!nota) return null;
  const status = (body.status && STATUS[body.status]) || nota.status;
  if (status === "ERRO" || status === "CANCELADA") await liberarRetornos(id);
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
  /** SEGURO = tomador da nota do seguro (quando é outra empresa do grupo). */
  papel: TipoNota = "RETORNO",
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
  await prisma.financialAccount.update({
    where: { id: conta.id },
    data: papel === "SEGURO" ? { nfseTomadorSeguroId: cliente.id } : { nfseTomadorId: cliente.id },
  });
  revalidatePath("/financeiro/nfse");
  return { ok: true, tomador: { name: cliente.name, document: cliente.document ?? "" } };
}

/**
 * Banco das notas já emitidas que ainda não é financeira em Contas e caixas
 * (ex.: Aymoré): cria a conta (tipo Financeira, saldo zero) já ligada ao
 * cadastro fiscal — e, se houver, à corretora da nota do seguro.
 */
export async function cadastrarFinanceiraAction(cnpj: string): Promise<NfseActionResult> {
  try {
    await assertCan("financeiro", "contas");
    await assertCan("financeiro", "nfse");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const conhecido = tomadorPorCnpj(cnpj);
  if (!conhecido || conhecido.soSeguro) return { ok: false, error: "Banco não encontrado entre as notas já emitidas." };
  const nome = conhecido.conta ?? `Financeira ${conhecido.nome}`;
  const contas = await prisma.financialAccount.findMany({
    where: { type: "FINANCEIRA" },
    select: { name: true, nfseTomador: { select: { document: true } } },
  });
  const jaExiste = contas.find(
    (c) =>
      docKey(c.nfseTomador?.document) === cnpj.replace(/\D/g, "") ||
      c.name.trim().toLowerCase() === nome.toLowerCase(),
  );
  if (jaExiste) return { ok: false, error: `Já existe a financeira ${jaExiste.name} em Contas e caixas.` };
  const tomador = await clienteDoConhecido(conhecido, nome);
  const corretora = tomadorSeguroDe(conhecido);
  const tomadorSeguro = corretora ? await clienteDoConhecido(corretora, nome) : null;
  await prisma.financialAccount.create({
    data: {
      name: nome,
      type: "FINANCEIRA",
      nfseTomadorId: tomador.id,
      nfseTomadorSeguroId: tomadorSeguro?.id ?? null,
      notes: `Cadastrada pela NFS-e (${conhecido.nome}). Confira o % de imposto do retorno em Contas e caixas.`,
    },
  });
  revalidatePath("/financeiro/nfse");
  revalidatePath("/financeiro/contas");
  return { ok: true };
}

export async function emitirNfseAction(input: {
  financeiraId: string;
  descricao: string;
  valor: number;
  competencia: string;
  informacoes?: string;
  /** Retornos (vendas) que a nota cobre. */
  saleIds?: string[];
  /** Nota do retorno ou do seguro (sem isto, pela descrição). */
  tipo?: TipoNota;
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
      ? prisma.financialAccount.findUnique({
          where: { id: input.financeiraId },
          include: { nfseTomador: true, nfseTomadorSeguro: true },
        })
      : null,
  ]);
  if (!financeira || financeira.type !== "FINANCEIRA") return { ok: false, error: "Escolha a financeira." };
  const tipo: TipoNota =
    input.tipo === "SEGURO" || input.tipo === "RETORNO" ? input.tipo : ehNotaDeSeguro(input.descricao) ? "SEGURO" : "RETORNO";
  const conhecido = tomadorPorNome(financeira.name);
  let tomador = financeira.nfseTomador;
  // Financeira ainda sem vínculo, mas reconhecida pelo nome entre os bancos das
  // notas já emitidas: liga sozinha, sem pedir nada.
  if (!tomador && conhecido) {
    const c = await clienteDoConhecido(conhecido, financeira.name);
    await prisma.financialAccount.update({ where: { id: financeira.id }, data: { nfseTomadorId: c.id } });
    tomador = await prisma.customer.findUnique({ where: { id: c.id } });
  }
  // Nota do seguro: vai para a corretora do grupo, quando há (Aymoré → Santander Corretora).
  if (tipo === "SEGURO") {
    let seguro = financeira.nfseTomadorSeguro;
    const corretora = tomadorSeguroDe(tomadorPorCnpj(tomador?.document ?? "") ?? conhecido);
    if (!seguro && corretora) {
      const c = await clienteDoConhecido(corretora, financeira.name);
      await prisma.financialAccount.update({ where: { id: financeira.id }, data: { nfseTomadorSeguroId: c.id } });
      seguro = await prisma.customer.findUnique({ where: { id: c.id } });
    }
    if (seguro) tomador = seguro;
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
      tipo,
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
  await ligarRetornos(nota.id, financeira.id, input.saleIds ?? [], tipo);

  const { http, body } = await emitirNfsen(ambiente, ref, r.payload);
  if (http === 201 || http === 202 || body.status) {
    const n = await aplicar(nota.id, body);
    revalidatePath("/financeiro/nfse");
    revalidatePath("/financeiro/financiamentos");
    return { ok: true, status: n?.status };
  }
  await prisma.notaServico.update({
    where: { id: nota.id },
    data: { status: "ERRO", mensagem: mensagemErroNfse(body) },
  });
  await liberarRetornos(nota.id);
  revalidatePath("/financeiro/nfse");
  return { ok: false, error: mensagemErroNfse(body) };
}

/**
 * Quais retornos a nota cobre — para notas já emitidas (ou corrigir a escolha).
 * Substitui a lista: o que sair dela volta a ficar sem NF.
 */
export async function vincularRetornosAction(notaId: string, saleIds: string[]): Promise<NfseActionResult & { count?: number }> {
  try {
    await assertCan("financeiro", "nfse");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const nota = await prisma.notaServico.findUnique({ where: { id: notaId } });
  if (!nota) return { ok: false, error: "Nota não encontrada." };
  if (nota.status !== "AUTORIZADA" && nota.status !== "PROCESSANDO") {
    return { ok: false, error: "Só nota autorizada (ou em processamento) cobre retornos." };
  }
  const financeiraId = nota.financeiraId ?? (await financeiraDaNota(nota.tomadorId));
  if (!financeiraId) return { ok: false, error: "Não foi possível saber a financeira desta nota." };
  const ids = [...new Set(saleIds)];
  const tipo: TipoNota = nota.tipo === "SEGURO" ? "SEGURO" : "RETORNO";
  if (tipo === "SEGURO") {
    await prisma.sale.updateMany({
      where: { insuranceNfseId: notaId, id: { notIn: ids } },
      data: { insuranceNfseId: null },
    });
  } else {
    await prisma.sale.updateMany({
      where: { returnNfseId: notaId, id: { notIn: ids } },
      data: { returnNfseId: null },
    });
  }
  const count = await ligarRetornos(notaId, financeiraId, ids, tipo);
  revalidatePath("/financeiro/nfse");
  revalidatePath("/financeiro/financiamentos");
  return { ok: true, count };
}

/** Nota sem a financeira gravada: a conta de Contas e caixas ligada ao mesmo tomador. */
async function financeiraDaNota(tomadorId: string | null) {
  if (!tomadorId) return null;
  const contas = await prisma.financialAccount.findMany({
    where: { type: "FINANCEIRA", nfseTomadorId: tomadorId },
    select: { id: true },
  });
  return contas.length === 1 ? contas[0].id : null;
}

/**
 * Nota que já foi emitida FORA do sistema (portal da prefeitura/nacional,
 * antes do Fincore): só registra número, valor e os retornos/seguros que ela
 * cobre — nada vai para a Focus. Assim o retorno não aparece de novo para
 * emitir e ganha o selo "NF emitida" em Financiamentos.
 */
export async function registrarNotaExternaAction(input: {
  financeiraId: string;
  tipo: TipoNota;
  numero: string;
  descricao: string;
  valor: number;
  competencia: string;
  saleIds: string[];
  /** Chave de acesso (50 dígitos) do DANFSe, se tiver. */
  chave?: string;
}): Promise<NfseActionResult> {
  try {
    await assertCan("financeiro", "nfse");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const user = await getSessionUser();
  // Número pode ficar em branco: nota antiga cujo número ninguém guardou. O
  // que importa é o retorno não aparecer de novo para emitir; o número entra
  // depois, em "Informar número".
  const numero = input.numero.trim().replace(/^0+(?=\d)/, "").slice(0, 20) || null;
  if (!(input.valor > 0)) return { ok: false, error: "Informe o valor da nota." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.competencia)) return { ok: false, error: "Informe a competência." };
  if (!input.saleIds.length) return { ok: false, error: "Marque os retornos que essa nota cobriu." };
  const chave = (input.chave ?? "").replace(/\D/g, "");
  if (chave && chave.length !== 50) return { ok: false, error: "A chave de acesso da NFS-e tem 50 números." };
  const financeira = await prisma.financialAccount.findUnique({
    where: { id: input.financeiraId },
    include: { nfseTomador: true, nfseTomadorSeguro: true },
  });
  if (!financeira || financeira.type !== "FINANCEIRA") return { ok: false, error: "Escolha a financeira." };
  const tipo: TipoNota = input.tipo === "SEGURO" ? "SEGURO" : "RETORNO";
  const conhecido = tomadorPorNome(financeira.name);
  const tomador = (tipo === "SEGURO" ? financeira.nfseTomadorSeguro : null) ?? financeira.nfseTomador;
  const corretora = tipo === "SEGURO" ? tomadorSeguroDe(conhecido) : null;
  const nota = await prisma.notaServico.create({
    data: {
      ambiente: "EXTERNA",
      ref: `externa-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
      status: "AUTORIZADA",
      tipo,
      tomadorId: tomador?.id ?? null,
      financeiraId: financeira.id,
      tomadorNome: tomador?.name ?? corretora?.nome ?? conhecido?.nome ?? financeira.name,
      tomadorDocumento: (tomador?.document ?? corretora?.cnpj ?? conhecido?.cnpj ?? "").replace(/\D/g, ""),
      descricao: input.descricao.trim() || "COMISSÃO SOBRE RETORNO",
      valor: Math.round(input.valor * 100) / 100,
      competencia: new Date(`${input.competencia}T12:00:00Z`),
      numero,
      codigoVerificacao: chave || null,
      mensagem: numero
        ? "Emitida fora do sistema — só registrada aqui."
        : "Emitida fora do sistema — número não informado.",
      payload: {},
      emitidaPor: user?.name ?? null,
    },
  });
  const count = await ligarRetornos(nota.id, financeira.id, input.saleIds, tipo);
  revalidatePath("/financeiro/nfse");
  revalidatePath("/financeiro/financiamentos");
  return { ok: true, status: count ? "AUTORIZADA" : undefined };
}

/** Número/chave de uma nota emitida fora do sistema, informados depois do registro. */
export async function informarNotaExternaAction(id: string, numeroDigitado: string, chaveDigitada: string): Promise<NfseActionResult> {
  try {
    await assertCan("financeiro", "nfse");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const nota = await prisma.notaServico.findUnique({ where: { id } });
  if (!nota || nota.ambiente !== "EXTERNA") return { ok: false, error: "Só nota registrada (emitida fora do sistema) aceita isto." };
  const numero = numeroDigitado.trim().replace(/^0+(?=\d)/, "").slice(0, 20);
  const chave = chaveDigitada.replace(/\D/g, "");
  if (!numero && !chave) return { ok: false, error: "Informe o número (ou a chave) da nota." };
  if (chave && chave.length !== 50) return { ok: false, error: "A chave de acesso da NFS-e tem 50 números." };
  await prisma.notaServico.update({
    where: { id },
    data: {
      ...(numero ? { numero } : {}),
      ...(chave ? { codigoVerificacao: chave } : {}),
      mensagem: "Emitida fora do sistema — só registrada aqui.",
    },
  });
  revalidatePath("/financeiro/nfse");
  revalidatePath("/financeiro/financiamentos");
  return { ok: true };
}

/** Desfaz o registro de uma nota emitida fora do sistema (os retornos voltam a ficar sem NF). */
export async function removerNotaExternaAction(id: string): Promise<NfseActionResult> {
  try {
    await assertCan("financeiro", "nfse");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const nota = await prisma.notaServico.findUnique({ where: { id } });
  if (!nota || nota.ambiente !== "EXTERNA") return { ok: false, error: "Só o registro de nota externa pode ser removido." };
  await liberarRetornos(id);
  await prisma.notaServico.delete({ where: { id } });
  revalidatePath("/financeiro/nfse");
  revalidatePath("/financeiro/financiamentos");
  return { ok: true };
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
  if (nota.ambiente === "EXTERNA") return { ok: true, status: nota.status };
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
  if (nota.ambiente === "EXTERNA") {
    return { ok: false, error: "Nota emitida fora do sistema: cancele no portal onde foi emitida e remova o registro aqui." };
  }
  const { body } = await cancelarNfsen(nota.ambiente as Ambiente, nota.ref, texto);
  if (body.status === "cancelado") {
    await prisma.notaServico.update({ where: { id }, data: { justificativaCancelamento: texto } });
    await aplicar(id, body);
    revalidatePath("/financeiro/nfse");
    revalidatePath("/financeiro/financiamentos");
    return { ok: true };
  }
  return { ok: false, error: mensagemErroNfse(body) };
}
