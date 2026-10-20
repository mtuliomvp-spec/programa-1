"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma, type RenaveSituacao } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { getCompany } from "@/lib/company";
import { renaveWs, pdfDaResposta, type EstoqueRenave, type RenaveResposta } from "@/lib/renave-ws";
import {
  codigoSegurancaDoTexto,
  cpfValido,
  digitos,
  lerAmbienteRenave,
  lerEstadoEstoque,
  montarEntrada,
  montarEntradaProprio,
  montarSaida,
  nomeMunicipioRenave,
  normalizarNumeroCrv,
  normalizarPlaca,
  normalizarRenavam,
  resumirAptidao,
  semAnexos,
  tipoDocumento,
  hojeSaoPaulo,
  type Aptidao,
  type DadosEntrada,
  type DadosEntradaProprio,
  type DadosSaida,
  type RenaveAmbiente,
} from "@/lib/renave-ws-dados";

/**
 * Integração direta com o Renave-WS (SERPRO). Cada ação:
 *  1. confere a permissão "Renave: registrar no SERPRO" (cobrado, vale juridicamente);
 *  2. recusa se já houver uma chamada PENDENTE do mesmo veículo (o manual pede
 *     para não reenviar antes da resposta — "rajadas");
 *  3. grava a chamada (pedido sem fotos/PDF, resposta, quem fez);
 *  4. em PRODUÇÃO espelha o resultado na ficha (situação, protocolo, datas) —
 *     homologação é teste e fica só no registro do ambiente.
 */

export type RenaveWsResult = {
  ok: boolean;
  error?: string;
  faltas?: string[];
  message?: string;
  aptidao?: Aptidao;
  codigo?: string;
};

const PENDENTE_MAX_MS = 3 * 60 * 1000;

type Contexto = { ambiente: RenaveAmbiente; user: { id: string; name: string } };

async function contexto(): Promise<Contexto> {
  const user = await assertCan("estoque", "renavews");
  const company = await getCompany();
  const ambiente = lerAmbienteRenave(company.renaveWsAmbiente);
  if (!ambiente) throw new Error("A integração com o Renave está desligada (Parâmetros → Renave).");
  return { ambiente, user: { id: user.id, name: user.name } };
}

/** Executa uma chamada registrando-a; recusa se outra do veículo está em andamento. */
async function registrar<T>(
  ctx: Contexto,
  vehicleId: string,
  operacao: string,
  pedido: unknown,
  chamada: () => Promise<RenaveResposta<T>>,
): Promise<RenaveResposta<T>> {
  const andamento = await prisma.renaveOperacao.findFirst({
    where: { vehicleId, status: "PENDENTE", createdAt: { gte: new Date(Date.now() - PENDENTE_MAX_MS) } },
    select: { operacao: true },
  });
  if (andamento) {
    return {
      http: 0,
      ok: false,
      body: null,
      erro: `Há uma operação no Renave em andamento para este veículo (${andamento.operacao}). Aguarde a resposta antes de repetir.`,
    };
  }
  const op = await prisma.renaveOperacao.create({
    data: {
      vehicleId,
      ambiente: ctx.ambiente,
      operacao,
      status: "PENDENTE",
      pedido: (semAnexos(pedido) ?? undefined) as Prisma.InputJsonValue | undefined,
      userId: ctx.user.id,
      userName: ctx.user.name,
    },
  });
  const r = await chamada();
  await prisma.renaveOperacao.update({
    where: { id: op.id },
    data: {
      status: r.ok ? "OK" : r.semResposta ? "SEM_RESPOSTA" : "ERRO",
      http: r.http || null,
      mensagem: r.erro,
      resposta: (r.body ? semAnexos(r.body) : undefined) as Prisma.InputJsonValue | undefined,
      finishedAt: new Date(),
    },
  });
  return r;
}

async function registroDo(vehicleId: string, ambiente: RenaveAmbiente) {
  return prisma.renaveRegistro.findUnique({ where: { vehicleId_ambiente: { vehicleId, ambiente } } });
}

/** Grava o estoque devolvido pelo Renave e, em produção, espelha na ficha. */
async function aplicarEstoque(vehicleId: string, ambiente: RenaveAmbiente, e: EstoqueRenave, extra: Partial<{ codigoCrvAtual: string | null }> = {}) {
  const estado = lerEstadoEstoque(e.estado);
  await prisma.renaveRegistro.upsert({
    where: { vehicleId_ambiente: { vehicleId, ambiente } },
    create: {
      vehicleId,
      ambiente,
      idEstoque: e.id,
      estado,
      estoque: e as unknown as Prisma.InputJsonValue,
      sincronizadoEm: new Date(),
      ...extra,
    },
    update: { idEstoque: e.id, estado, estoque: e as unknown as Prisma.InputJsonValue, sincronizadoEm: new Date(), ...extra },
  });
  if (ambiente !== "PRODUCAO") return;

  const cancelado = !!e.cancelamentoEstoque;
  const saida = e.saidaEstoque && !e.saidaEstoque.cancelamentoSaidaEstoque ? e.saidaEstoque : null;
  const entrada = e.entradaEstoque ?? null;
  // Na entrada de veículo próprio o Renave grava a própria loja como vendedor.
  const vendedor = digitos(entrada?.vendedor?.numeroDocumento);
  const proprio = !vendedor || vendedor === digitos((await getCompany()).cnpj);
  const situacao: RenaveSituacao = cancelado ? "SEM_REGISTRO" : saida ? "SAIDA_REGISTRADA" : "ENTRADA_REGISTRADA";
  const data = (s?: string | null) => (s ? new Date(s.length === 10 ? `${s}T12:00:00Z` : s) : null);
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      renaveSituacao: situacao,
      ...(cancelado
        ? { renaveEntradaProtocolo: null, renaveEntradaEm: null, renaveSaidaProtocolo: null, renaveSaidaEm: null }
        : {
            renaveEntradaTitulo: proprio ? "ENTRADA_VEICULO_PROPRIO" : "COMPRA",
            renaveEntradaProtocolo: `Renave estoque ${e.id}${entrada?.numeroTermoEntradaEstoque ? ` — termo nº ${entrada.numeroTermoEntradaEstoque}` : ""}`,
            renaveEntradaEm: data(entrada?.dataHora),
            ...(saida
              ? {
                  renaveSaidaTitulo: "VENDA",
                  renaveSaidaProtocolo: `Renave estoque ${e.id}${saida.numeroTermoSaidaEstoque ? ` — termo nº ${saida.numeroTermoSaidaEstoque}` : ""}`,
                  renaveSaidaEm: data(saida.dataHora),
                }
              : { renaveSaidaProtocolo: null, renaveSaidaEm: null }),
          }),
    },
  });
}

function revalidar(vehicleId: string) {
  revalidatePath(`/estoque/${vehicleId}`);
  revalidatePath("/estoque/renave");
}

function falhou(e: unknown): RenaveWsResult {
  return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado." };
}

/** Placa/Renavam usados no ambiente: em homologação, os do veículo de teste. */
async function identificacao(vehicleId: string, ambiente: RenaveAmbiente) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { plate: true, renavam: true } });
  if (!v) throw new Error("Veículo não encontrado.");
  if (ambiente === "HOMOLOGACAO") {
    const reg = await registroDo(vehicleId, ambiente);
    const mock = reg?.mock as { placa?: string; renavam?: string } | null | undefined;
    if (!mock?.placa || !mock.renavam) throw new Error("Em homologação, crie primeiro o veículo de teste do SERPRO.");
    return { placa: mock.placa, renavam: mock.renavam };
  }
  return { placa: normalizarPlaca(v.plate), renavam: normalizarRenavam(v.renavam) };
}

// ---------------------------------------------------------------------------
// Homologação: veículo de teste e confirmação simulada do Detran
// ---------------------------------------------------------------------------

function cpfDeTeste(): string {
  for (;;) {
    const base = Array.from({ length: 9 }, () => randomInt(10));
    const dv = (n: number[]) => {
      const soma = n.reduce((s, d, i) => s + d * (n.length + 1 - i), 0);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    const d1 = dv(base);
    const d2 = dv([...base, d1]);
    const cpf = [...base, d1, d2].join("");
    if (cpfValido(cpf)) return cpf;
  }
}

/**
 * Cria no SERPRO um veículo de teste (só existe na homologação) para ensaiar o
 * fluxo deste carro. O proprietário do teste é o vendedor da ficha quando o
 * CPF/CNPJ dele é válido; "veículo próprio" põe o carro no nome do
 * estabelecimento de teste.
 */
export async function criarVeiculoTesteRenaveAction(vehicleId: string, proprio: boolean): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    if (ctx.ambiente !== "HOMOLOGACAO") return { ok: false, error: "Veículo de teste só existe em homologação." };
    const v = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { supplier: { select: { name: true, document: true } } },
    });
    if (!v) return { ok: false, error: "Veículo não encontrado." };
    const cliente = await renaveWs.clienteAutenticado(ctx.ambiente);
    if (!cliente.ok || !cliente.body) return { ok: false, error: cliente.erro ?? "Renave indisponível." };
    const uf = cliente.body.endereco?.municipio?.uf || "SP";
    const docFornecedor = digitos(v.supplier?.document);
    const dono = proprio
      ? { documentoProprietario: digitos(cliente.body.cnpj), nomeProprietario: cliente.body.nome.slice(0, 60) }
      : tipoDocumento(docFornecedor)
        ? { documentoProprietario: docFornecedor, nomeProprietario: (v.supplier?.name ?? "VENDEDOR TESTE").slice(0, 60) }
        : { documentoProprietario: cpfDeTeste(), nomeProprietario: "VENDEDOR TESTE" };
    const pedido = { ...dono, sufixoPlaca: String(randomInt(10000)).padStart(4, "0"), ufJurisdicaoVeiculo: uf };
    const r = await registrar(ctx, vehicleId, "MOCK_VEICULO", pedido, () => renaveWs.criarMockUsado(ctx.ambiente, pedido));
    if (!r.ok || !r.body) return { ok: false, error: r.erro ?? "Falha ao criar o veículo de teste." };
    const mock = { ...r.body, tipoCrv: "VERDE", documentoProprietario: dono.documentoProprietario, proprio };
    await prisma.renaveRegistro.upsert({
      where: { vehicleId_ambiente: { vehicleId, ambiente: ctx.ambiente } },
      create: { vehicleId, ambiente: ctx.ambiente, mock },
      update: {
        mock,
        idEstoque: null,
        estado: null,
        estoque: Prisma.DbNull,
        codigoCrvAtual: null,
        assinaturaEnviadaEm: null,
        atpveNumero: null,
        sincronizadoEm: null,
      },
    });
    revalidar(vehicleId);
    return { ok: true, message: `Veículo de teste ${r.body.placa} criado na homologação do SERPRO.` };
  } catch (e) {
    return falhou(e);
  }
}

/** Homologação: simula o Detran emitindo o CRV/CRLV em nome da loja (estoque CONFIRMADO). */
export async function simularDetranRenaveAction(vehicleId: string): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    if (ctx.ambiente !== "HOMOLOGACAO") return { ok: false, error: "Só em homologação." };
    const { placa } = await identificacao(vehicleId, ctx.ambiente);
    const r = await registrar(ctx, vehicleId, "MOCK_DETRAN", { placa }, () => renaveWs.transferirMockNoDetran(ctx.ambiente, placa));
    if (!r.ok) return { ok: false, error: r.erro ?? "Falha na simulação." };
    await sincronizar(ctx, vehicleId);
    revalidar(vehicleId);
    return { ok: true, message: "Detran simulado: estoque confirmado e CRV emitido em nome da loja de teste." };
  } catch (e) {
    return falhou(e);
  }
}

// ---------------------------------------------------------------------------
// Consulta e sincronização
// ---------------------------------------------------------------------------

/** Aptidão para entrar em estoque (gratuita): restrições, débitos e boletos. */
export async function consultarAptidaoRenaveAction(
  vehicleId: string,
  d: { tipoCrv: string; numeroCrv: string },
): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const { placa, renavam } = await identificacao(vehicleId, ctx.ambiente);
    const numeroCrv = normalizarNumeroCrv(d.numeroCrv);
    if (!d.tipoCrv || numeroCrv.length !== 12) return { ok: false, error: "Informe o tipo e o nº do CRV (12 dígitos) para consultar." };
    const pedido = { placa, renavam, tipoCrv: d.tipoCrv, numeroCrv };
    const r = await registrar(ctx, vehicleId, "APTIDAO", pedido, () => renaveWs.aptidao(ctx.ambiente, pedido));
    if (!r.ok) {
      // Sempre o texto do próprio Renave; no "não encontrado", mais a dica do
      // que costuma ser (o 404 vale para tipo/nº errado E para CRV que já não é
      // o atual — carro transferido para a loja tem CRV novo).
      const naoAchou = r.http === 404;
      return {
        ok: false,
        error: naoAchou
          ? `Renave: ${r.erro ?? "veículo não encontrado"}. Confira o tipo e o nº do CRV ATUAL — se o carro já foi transferido para a loja, o CRV é o novo (do CRLV-e), não o da ATPV-e da compra.`
          : (r.erro ?? "Falha na consulta."),
      };
    }
    return { ok: true, aptidao: resumirAptidao(r.body) };
  } catch (e) {
    return falhou(e);
  }
}

async function sincronizar(ctx: Contexto, vehicleId: string) {
  const reg = await registroDo(vehicleId, ctx.ambiente);
  let estoque: EstoqueRenave | null = null;
  if (reg?.idEstoque) {
    const r = await renaveWs.estoque(ctx.ambiente, reg.idEstoque);
    if (!r.ok) throw new Error(r.erro ?? "Falha ao consultar o estoque no Renave.");
    estoque = r.body;
  } else {
    const { placa } = await identificacao(vehicleId, ctx.ambiente);
    const r = await renaveWs.estoques(ctx.ambiente, { placa });
    if (!r.ok) throw new Error(r.erro ?? "Falha ao consultar o estoque no Renave.");
    const lista = (r.body ?? []).filter((e) => !e.cancelamentoEstoque).sort((a, b) => b.id - a.id);
    estoque = lista[0] ?? null;
  }
  if (estoque) await aplicarEstoque(vehicleId, ctx.ambiente, estoque);
  return estoque;
}

/** "Atualizar do Renave": lê o estoque atual (estado, notas, termo). */
export async function sincronizarRenaveAction(vehicleId: string): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const e = await sincronizar(ctx, vehicleId);
    revalidar(vehicleId);
    return { ok: true, message: e ? "Situação atualizada a partir do Renave." : "Nenhum estoque aberto no Renave para este veículo." };
  } catch (e) {
    return falhou(e);
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Compra de usado: solicita a entrada em estoque (o Detran confirma depois). */
export async function entradaRenaveAction(vehicleId: string, d: DadosEntrada): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const company = await getCompany();
    const id = await identificacao(vehicleId, ctx.ambiente);
    const m = montarEntrada({ ...d, placa: id.placa, renavam: id.renavam }, {
      cnpjLoja: ctx.ambiente === "PRODUCAO" ? company.cnpj : null,
    });
    if (!m.ok) return { ok: false, faltas: m.faltas };
    const reg = await registroDo(vehicleId, ctx.ambiente);
    if (reg?.idEstoque && reg.estado && reg.estado !== "FINALIZADO" && !(reg.estoque as EstoqueRenave | null)?.cancelamentoEstoque)
      return { ok: false, error: `Já existe estoque aberto no Renave (id ${reg.idEstoque}). Atualize do Renave ou cancele antes.` };
    const r = await registrar(ctx, vehicleId, "ENTRADA", m.payload, () => renaveWs.entrada(ctx.ambiente, m.payload));
    if (!r.ok || !r.body) return { ok: false, error: r.erro ?? "Falha na entrada." };
    await aplicarEstoque(vehicleId, ctx.ambiente, r.body, { codigoCrvAtual: null });
    await gravarDadosDoCrv(vehicleId, ctx.ambiente, m.payload.veiculo);
    revalidar(vehicleId);
    return { ok: true, message: `Entrada registrada no Renave (estoque ${r.body.id}). Próximos passos: assinatura do vendedor e NF-e de entrada.` };
  } catch (e) {
    return falhou(e);
  }
}

/** Veículo já no nome da loja: entrada sem vendedor e sem assinatura. */
export async function entradaProprioRenaveAction(vehicleId: string, d: DadosEntradaProprio): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const id = await identificacao(vehicleId, ctx.ambiente);
    const m = montarEntradaProprio({ ...d, placa: id.placa, renavam: id.renavam });
    if (!m.ok) return { ok: false, faltas: m.faltas };
    const r = await registrar(ctx, vehicleId, "ENTRADA_PROPRIO", m.payload, () => renaveWs.entradaProprio(ctx.ambiente, m.payload));
    if (!r.ok || !r.body) return { ok: false, error: r.erro ?? "Falha na entrada." };
    await aplicarEstoque(vehicleId, ctx.ambiente, r.body, { codigoCrvAtual: m.payload.veiculo.codigoSegurancaCrv });
    await gravarDadosDoCrv(vehicleId, ctx.ambiente, m.payload.veiculo);
    revalidar(vehicleId);
    return { ok: true, message: `Entrada de veículo próprio registrada (estoque ${r.body.id}). Falta enviar a NF-e de entrada.` };
  } catch (e) {
    return falhou(e);
  }
}

/** Em produção, o CRV informado na entrada passa a ser o da ficha. */
async function gravarDadosDoCrv(
  vehicleId: string,
  ambiente: RenaveAmbiente,
  v: { tipoCrv: string; numeroCrv?: string; codigoSegurancaCrv: string },
) {
  if (ambiente !== "PRODUCAO") return;
  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { crvTipo: v.tipoCrv, crvSecurityCode: v.codigoSegurancaCrv, ...(v.numeroCrv ? { crvNumber: v.numeroCrv } : {}) },
  });
}

/**
 * Assinatura do vendedor no ATPV, de próprio punho com firma reconhecida: a
 * foto/PDF do ATPV-e impresso (ou do verso do CRV de papel) assinado. Vem de
 * um anexo do veículo. A assinatura eletrônica avançada é feita pelo vendedor
 * no app CDT e não passa pelo sistema.
 */
export async function enviarAssinaturaRenaveAction(vehicleId: string, attachmentId: string): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const reg = await registroDo(vehicleId, ctx.ambiente);
    if (!reg?.idEstoque) return { ok: false, error: "Registre a entrada no Renave antes de enviar a assinatura." };
    const anexo = await prisma.vehicleAttachment.findFirst({
      where: { id: attachmentId, vehicleId },
      select: { data: true, mimeType: true, filename: true },
    });
    if (!anexo) return { ok: false, error: "Escolha o arquivo com a assinatura do vendedor." };
    if (!/^image\/|application\/pdf/.test(anexo.mimeType)) return { ok: false, error: "O arquivo precisa ser foto (JPG/PNG) ou PDF." };
    const estoque = reg.estoque as EstoqueRenave | null;
    const tipoCrv = estoque?.tipoCrv ?? null;
    const base64 = Buffer.from(anexo.data).toString("base64");
    const papelMoeda = tipoCrv === "AZUL" || tipoCrv === "VERDE";
    const pedido = papelMoeda
      ? { idEstoque: reg.idEstoque, envioAssinaturaProprioPunhoAtpvPapelMoeda: { fotoAtpvPapelMoedaAssinadoBase64: base64 } }
      : { idEstoque: reg.idEstoque, envioAssinaturaProprioPunhoAtpve: { fotoAtpveAssinadoDeProprioPunhoBase64: base64 } };
    const r = await registrar(ctx, vehicleId, "ASSINATURA_VENDEDOR", { ...pedido, arquivo: anexo.filename }, () =>
      renaveWs.assinaturaVendedor(ctx.ambiente, pedido),
    );
    if (!r.ok) return { ok: false, error: r.erro ?? "Falha no envio da assinatura." };
    await prisma.renaveRegistro.update({ where: { id: reg.id }, data: { assinaturaEnviadaEm: new Date() } });
    if (ctx.ambiente === "PRODUCAO")
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { renaveAssinaturaTipo: "RECONHECIMENTO_FIRMA", renaveAssinaturaEm: new Date() },
      });
    revalidar(vehicleId);
    return { ok: true, message: "Assinatura do vendedor enviada ao Renave." };
  } catch (e) {
    return falhou(e);
  }
}

/** NF-e de entrada (COMPRA) ou de venda (VENDA): a chave da ficha. */
export async function enviarNotaRenaveAction(vehicleId: string, evento: "COMPRA" | "VENDA", chaveInformada?: string): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const reg = await registroDo(vehicleId, ctx.ambiente);
    if (!reg?.idEstoque) return { ok: false, error: "Não há estoque no Renave para este veículo." };
    const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { entryNfeKey: true, exitNfeKey: true } });
    const { chaveNfeValida } = await import("@/lib/renave");
    const chave = digitos(chaveInformada) || digitos(evento === "COMPRA" ? v?.entryNfeKey : v?.exitNfeKey);
    if (!chave) return { ok: false, error: `Sem a chave da NF-e de ${evento === "COMPRA" ? "entrada" : "venda"} na ficha.` };
    if (!chaveNfeValida(chave)) return { ok: false, error: "Chave da NF-e inválida (44 dígitos com dígito verificador)." };
    const pedido = { idEstoque: reg.idEstoque, evento, chaveNotaFiscal: chave };
    const r = await registrar(ctx, vehicleId, evento === "COMPRA" ? "NF_ENTRADA" : "NF_SAIDA", pedido, () =>
      renaveWs.notaFiscal(ctx.ambiente, reg.idEstoque!, evento, chave),
    );
    if (!r.ok) return { ok: false, error: r.erro ?? "Falha no envio da NF-e." };
    await sincronizar(ctx, vehicleId).catch(() => null);
    revalidar(vehicleId);
    return { ok: true, message: `NF-e de ${evento === "COMPRA" ? "entrada" : "venda"} enviada ao Renave.` };
  } catch (e) {
    return falhou(e);
  }
}

// ---------------------------------------------------------------------------
// Saída (venda)
// ---------------------------------------------------------------------------

/** Código do município do comprador no Renave (não é o IBGE): pela cidade e UF. */
export async function municipioRenaveAction(cidade: string, uf: string): Promise<{ ok: boolean; codigo?: string; nome?: string; error?: string }> {
  try {
    const ctx = await contexto();
    const u = (uf ?? "").trim().toUpperCase();
    const alvo = nomeMunicipioRenave(cidade);
    if (!/^[A-Z]{2}$/.test(u) || !alvo) return { ok: false, error: "Informe cidade e UF do comprador." };
    const r = await renaveWs.municipios(ctx.ambiente, u);
    if (!r.ok) return { ok: false, error: r.erro ?? "Falha na consulta de municípios." };
    const achado = (r.body ?? []).find((m) => nomeMunicipioRenave(m.nome) === alvo);
    return achado ? { ok: true, codigo: achado.id, nome: achado.nome } : { ok: false, error: `Município "${cidade}/${u}" não encontrado no Renave.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro." };
  }
}

/**
 * Busca no Renave o PDF com o número de segurança do CRV ATUAL (o emitido em
 * nome da loja quando o Detran confirmou a entrada) e lê o código dele.
 */
export async function buscarCodigoCrvRenaveAction(vehicleId: string, numeroCrvDigitado?: string): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const { placa, renavam } = await identificacao(vehicleId, ctx.ambiente);
    const r = await registrar(ctx, vehicleId, "CODIGO_CRV", { placa, renavam }, () =>
      renaveWs.pdfCodigoSegurancaCrv(ctx.ambiente, placa, renavam),
    );
    if (!r.ok) return { ok: false, error: r.erro ?? "Falha ao buscar o código do CRV." };
    const pdf = pdfDaResposta(r.body);
    if (!pdf) return { ok: false, error: "O Renave não devolveu o PDF do código do CRV." };
    const codigo = codigoSegurancaDoTexto(await textoPdf(pdf), renavam);
    if (!codigo) return { ok: false, error: "Não consegui ler o código no PDF — abra o documento e digite." };
    // Antes da entrada (veículo próprio) o registro do ambiente ainda não existe.
    await prisma.renaveRegistro.upsert({
      where: { vehicleId_ambiente: { vehicleId, ambiente: ctx.ambiente } },
      create: { vehicleId, ambiente: ctx.ambiente, codigoCrvAtual: codigo },
      update: { codigoCrvAtual: codigo },
    });
    // Em produção o código vai para a ficha — e, se a pessoa digitou o nº do
    // CRV atual na tela, ele também (é o par que o Renave confere).
    if (ctx.ambiente === "PRODUCAO") {
      const numero = normalizarNumeroCrv(numeroCrvDigitado);
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { crvSecurityCode: codigo, ...(numero.length === 12 ? { crvNumber: numero, crvTipo: "DIGITAL" } : {}) },
      });
    }
    revalidar(vehicleId);
    return { ok: true, codigo, message: `Código de segurança do CRV atual: ${codigo}.` };
  } catch (e) {
    return falhou(e);
  }
}

async function textoPdf(pdf: Buffer): Promise<string> {
  try {
    const mupdf = await import("mupdf");
    const doc = mupdf.Document.openDocument(pdf, "application/pdf");
    let t = "";
    for (let i = 0; i < doc.countPages(); i++) t += `${doc.loadPage(i).toStructuredText("preserve-whitespace").asText()}\n`;
    return t;
  } catch {
    const { textoDoPdf } = await import("@/lib/pdf-text");
    return textoDoPdf(pdf);
  }
}

/** Venda: registra a saída; o Renave gera a ATPV-e ("Documento gerado pelo RENAVE"). */
export async function saidaRenaveAction(vehicleId: string, d: DadosSaida): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const id = await identificacao(vehicleId, ctx.ambiente);
    const m = montarSaida({ ...d, placa: id.placa, renavam: id.renavam });
    if (!m.ok) return { ok: false, faltas: m.faltas };
    const reg = await registroDo(vehicleId, ctx.ambiente);
    if (!reg?.idEstoque) return { ok: false, error: "Não há entrada deste veículo no Renave." };
    if (reg.estado !== "CONFIRMADO")
      return { ok: false, error: "O estoque ainda não foi confirmado pelo Detran — use “Atualizar do Renave” e aguarde a confirmação." };
    const r = await registrar(ctx, vehicleId, "SAIDA", m.payload, () => renaveWs.saida(ctx.ambiente, m.payload));
    if (!r.ok || !r.body) return { ok: false, error: r.erro ?? "Falha na saída." };
    await aplicarEstoque(vehicleId, ctx.ambiente, r.body, { codigoCrvAtual: m.payload.veiculo.codigoSegurancaCrv });
    if (ctx.ambiente === "PRODUCAO") {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { crvSecurityCode: m.payload.veiculo.codigoSegurancaCrv, crvNumber: m.payload.veiculo.numeroCrv },
      });
      // A ATPV-e gerada pelo Renave vai para os documentos (dispensa as assinaturas).
      await anexarAtpve(ctx, vehicleId, id.placa, id.renavam).catch(() => null);
    }
    revalidar(vehicleId);
    return { ok: true, message: "Saída registrada no Renave. Baixe a ATPV-e e envie a NF-e de venda." };
  } catch (e) {
    return falhou(e);
  }
}

async function anexarAtpve(ctx: Contexto, vehicleId: string, placa: string, renavam: string) {
  const r = await renaveWs.pdfAtpv(ctx.ambiente, placa, renavam);
  const pdf = r.ok ? pdfDaResposta(r.body) : null;
  if (!pdf) return null;
  const numero = digitos(r.body?.numeroAtpv);
  const { descricaoAtpv } = await import("@/lib/atpv-fases");
  const descricao = `${descricaoAtpv(numero || null, "EMITIDA")} (gerada pelo Renave)`;
  const existe = await prisma.vehicleAttachment.findFirst({ where: { vehicleId, description: descricao }, select: { id: true } });
  if (!existe)
    await prisma.vehicleAttachment.create({
      data: {
        vehicleId,
        kind: "DOCUMENTO",
        description: descricao,
        filename: `ATPV-e ${numero || placa}.pdf`,
        mimeType: "application/pdf",
        size: pdf.length,
        data: new Uint8Array(pdf),
      },
    });
  await prisma.renaveRegistro.update({
    where: { vehicleId_ambiente: { vehicleId, ambiente: ctx.ambiente } },
    data: { atpveNumero: numero || null },
  });
  return numero;
}

/** Produção: anexa a ATPV-e do Renave aos documentos do veículo. */
export async function anexarAtpveRenaveAction(vehicleId: string): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    if (ctx.ambiente !== "PRODUCAO") return { ok: false, error: "Em homologação, abra a ATPV-e pelo link (não vai para os documentos)." };
    const { placa, renavam } = await identificacao(vehicleId, ctx.ambiente);
    const n = await anexarAtpve(ctx, vehicleId, placa, renavam);
    if (n === null) return { ok: false, error: "O Renave não devolveu a ATPV-e deste veículo." };
    revalidar(vehicleId);
    return { ok: true, message: "ATPV-e anexada aos documentos do veículo." };
  } catch (e) {
    return falhou(e);
  }
}

// ---------------------------------------------------------------------------
// Cancelamentos
// ---------------------------------------------------------------------------

export async function cancelarEntradaRenaveAction(vehicleId: string, d: { data: string; cpfOperador: string }): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const reg = await registroDo(vehicleId, ctx.ambiente);
    const e = reg?.estoque as EstoqueRenave | null;
    if (!reg?.idEstoque || !e) return { ok: false, error: "Não há estoque no Renave para cancelar." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data) || d.data > hojeSaoPaulo()) return { ok: false, error: "Data do cancelamento inválida." };
    if (!cpfValido(d.cpfOperador)) return { ok: false, error: "CPF do operador inválido." };
    const codigo = reg.codigoCrvAtual || e.codigoSegurancaCrv;
    if (!codigo) return { ok: false, error: "Sem o código de segurança do CRV do estoque." };
    const pedido = {
      cpfOperadorResponsavel: digitos(d.cpfOperador),
      dataCancelamentoEstoque: d.data,
      veiculo: {
        placa: e.placa,
        renavam: e.renavam,
        ...(e.numeroCrv ? { numeroCrv: e.numeroCrv } : {}),
        codigoSegurancaCrv: codigo,
      },
    };
    const r = await registrar(ctx, vehicleId, "CANCELAR_ENTRADA", pedido, () => renaveWs.cancelarEntrada(ctx.ambiente, pedido));
    if (!r.ok) return { ok: false, error: r.erro ?? "Falha no cancelamento." };
    if (r.body) await aplicarEstoque(vehicleId, ctx.ambiente, r.body);
    else await sincronizar(ctx, vehicleId).catch(() => null);
    revalidar(vehicleId);
    return { ok: true, message: "Cancelamento da entrada solicitado ao Renave." };
  } catch (e) {
    return falhou(e);
  }
}

export async function cancelarSaidaRenaveAction(vehicleId: string, d: { data: string; cpfOperador: string }): Promise<RenaveWsResult> {
  try {
    const ctx = await contexto();
    const reg = await registroDo(vehicleId, ctx.ambiente);
    if (!reg?.idEstoque) return { ok: false, error: "Não há estoque no Renave." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data) || d.data > hojeSaoPaulo()) return { ok: false, error: "Data do cancelamento inválida." };
    if (!cpfValido(d.cpfOperador)) return { ok: false, error: "CPF do operador inválido." };
    const pedido = { idEstoque: reg.idEstoque, dataCancelamentoSaidaEstoque: d.data, cpfOperadorResponsavel: digitos(d.cpfOperador) };
    const r = await registrar(ctx, vehicleId, "CANCELAR_SAIDA", pedido, () => renaveWs.cancelarSaida(ctx.ambiente, pedido));
    if (!r.ok) return { ok: false, error: r.erro ?? "Falha no cancelamento." };
    if (r.body) await aplicarEstoque(vehicleId, ctx.ambiente, r.body);
    else await sincronizar(ctx, vehicleId).catch(() => null);
    revalidar(vehicleId);
    return { ok: true, message: "Cancelamento da saída solicitado ao Renave." };
  } catch (e) {
    return falhou(e);
  }
}
