import type { RenaveSituacao, TituloNegocio, TipoIdentificacaoPrevia, TipoAssinaturaVendedor } from "@prisma/client";

/**
 * Renave — Registro Nacional de Veículos em Estoque.
 * Resolução Contran nº 1.026, de 26 de junho de 2026 (DOU de 30/06/2026).
 *
 * O que a resolução muda para a loja, em uma frase: a escrituração de entrada
 * e saída de veículos passa a ser feita SÓ no Renave (art. 1º, § 1º), por meio
 * de uma integradora autorizada (art. 5º, III), e cada registro tem um conjunto
 * mínimo de dados (arts. 13, 15, 16, 17, 18 e 19).
 *
 * O sistema NÃO é o Renave e não é integradora: ele guarda os dados que o
 * registro exige, aponta o que está faltando e mantém o livro conferível para
 * fiscalização (art. 5º, V). Enquanto durar a implantação, nada é bloqueado —
 * os avisos apenas antecipam o que a obrigatoriedade vai exigir.
 */

/** Publicação da resolução e prazo de adequação do art. 33 (90 dias). */
// Meio-dia UTC, como em `parseDateInput`: uma data "seca" gravada à meia-noite
// volta um dia atrás ao ser exibida em America/Sao_Paulo (UTC-3).
export const RENAVE_PUBLICACAO = new Date("2026-06-30T12:00:00.000Z");
export const RENAVE_PRAZO_PADRAO = new Date("2026-09-28T12:00:00.000Z");

export const RENAVE_NORMA = "Resolução Contran nº 1.026/2026";

export const situacaoLabel: Record<RenaveSituacao, string> = {
  SEM_REGISTRO: "Sem registro no Renave",
  ENTRADA_REGISTRADA: "Entrada registrada (veículo em estoque)",
  ESTOQUE_VINCULADO: "Em estoque vinculado (pendência/restrição)",
  CONSIGNADO_EM_TRANSFERENCIA: "Consignado em processo de transferência",
  SAIDA_REGISTRADA: "Saída registrada",
};

export const situacaoTone: Record<RenaveSituacao, "default" | "info" | "success" | "warning" | "danger"> = {
  SEM_REGISTRO: "warning",
  ENTRADA_REGISTRADA: "success",
  ESTOQUE_VINCULADO: "danger",
  CONSIGNADO_EM_TRANSFERENCIA: "info",
  SAIDA_REGISTRADA: "default",
};

export const tituloLabel: Record<TituloNegocio, string> = {
  COMPRA: "Compra",
  VENDA: "Venda",
  TRANSFERENCIA_ENTRE_ESTABELECIMENTOS: "Transferência entre estabelecimentos",
  CONSIGNACAO: "Consignação",
  EXECUCAO_GARANTIA: "Execução de garantia real",
  ENTRADA_VEICULO_PROPRIO: "Entrada em estoque de veículo próprio",
  ENTRADA_VEICULO_RETOMADO: "Entrada em estoque de veículo retomado",
};

/** Títulos que fazem sentido em cada ponta da escrituração. */
export const TITULOS_ENTRADA: TituloNegocio[] = [
  "COMPRA",
  "CONSIGNACAO",
  "TRANSFERENCIA_ENTRE_ESTABELECIMENTOS",
  "ENTRADA_VEICULO_PROPRIO",
  "ENTRADA_VEICULO_RETOMADO",
  "EXECUCAO_GARANTIA",
];
export const TITULOS_SAIDA: TituloNegocio[] = [
  "VENDA",
  "TRANSFERENCIA_ENTRE_ESTABELECIMENTOS",
  "CONSIGNACAO",
  "EXECUCAO_GARANTIA",
];

export const previaLabel: Record<TipoIdentificacaoPrevia, string> = {
  IDENTIFICACAO_PREVIA: "Identificação prévia de entrada",
  VISTORIA: "Vistoria veicular (substitutiva)",
};

export const assinaturaLabel: Record<TipoAssinaturaVendedor, string> = {
  RECONHECIMENTO_FIRMA: "Reconhecimento de firma",
  ELETRONICA_AVANCADA: "Assinatura eletrônica avançada",
  ELETRONICA_QUALIFICADA: "Assinatura eletrônica qualificada",
};

/** Prazo do § 7º do art. 20: 30 dias para o consignante assinar a ATPV-e. */
export const PRAZO_ATPV_CONSIGNACAO_DIAS = 30;

// ---------------------------------------------------------------------------
// Chave da NF-e
// ---------------------------------------------------------------------------

/** Só os dígitos, para comparar/validar sem depender de como foi colada. */
export function digitos(valor: string | null | undefined): string {
  return (valor || "").replace(/\D/g, "");
}

/** Chave de acesso da NF-e tem 44 dígitos (art. 5º, VI; arts. 13/15/18/19). */
export function chaveNfeValida(chave: string | null | undefined): boolean {
  return digitos(chave).length === 44;
}

/**
 * Série e número saem da própria chave (layout da NF-e: cUF 2, AAMM 4, CNPJ 14,
 * modelo 2, série 3, número 9, tpEmis 1, cNF 8, DV 1). Evita redigitar — e
 * evita a divergência entre nota e registro que o art. 5º, VI proíbe.
 */
export function dadosDaChaveNfe(chave: string | null | undefined): { serie: string; numero: string } | null {
  const d = digitos(chave);
  if (d.length !== 44) return null;
  return {
    serie: String(Number(d.slice(22, 25))),
    numero: String(Number(d.slice(25, 34))),
  };
}

/** Formata a chave em blocos de 4, como sai no DANFE. */
export function formatChaveNfe(chave: string | null | undefined): string {
  const d = digitos(chave);
  if (!d) return "";
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

// ---------------------------------------------------------------------------
// Pendências
// ---------------------------------------------------------------------------

export type RenaveVeiculo = {
  status: "ESTOQUE" | "RESERVADO" | "VENDIDO";
  consigned: boolean;
  intermediation: boolean;
  chassi: string | null;
  renavam: string | null;
  renaveSituacao: RenaveSituacao;
  renaveEntradaTitulo: TituloNegocio | null;
  renaveEntradaProtocolo: string | null;
  renaveEntradaEm: Date | null;
  entryNfeKey: string | null;
  renavePreviaTipo: TipoIdentificacaoPrevia | null;
  renaveAssinaturaTipo: TipoAssinaturaVendedor | null;
  crvNumber: string | null;
  crvSecurityCode: string | null;
  consignContractId: string | null;
  consignContractAt: Date | null;
  renaveSaidaTitulo: TituloNegocio | null;
  renaveSaidaProtocolo: string | null;
  exitNfeKey: string | null;
};

export type Pendencia = {
  /** Chave curta, para filtrar/agrupar. */
  key: string;
  texto: string;
  /** Artigo da resolução que pede o dado — aparece no rodapé do aviso. */
  base: string;
  /** `saida` = só atrapalha na hora de vender; `entrada` = já atrapalha agora. */
  momento: "entrada" | "saida";
};

/**
 * O que falta para este veículo ser escriturável no Renave. Lista vazia = a
 * ficha tem tudo o que o registro pede.
 *
 * Veículo de terceiro em financiamento (intermediação) não é estoque da loja e
 * segue outra regra — ver `avisoIntermediacao`.
 */
export function pendenciasRenave(v: RenaveVeiculo): Pendencia[] {
  if (v.intermediation) return [];
  const p: Pendencia[] = [];
  const vendido = v.status === "VENDIDO";

  if (!v.chassi) {
    p.push({ key: "chassi", texto: "Chassi não informado", base: "art. 15, II", momento: "entrada" });
  }
  if (!v.renavam) {
    p.push({ key: "renavam", texto: "RENAVAM não informado", base: "art. 11", momento: "entrada" });
  }
  if (!v.renaveEntradaTitulo) {
    p.push({
      key: "entradaTitulo",
      texto: "Título do negócio jurídico da entrada não informado",
      base: "art. 2º, VI",
      momento: "entrada",
    });
  }
  if (!v.renavePreviaTipo) {
    p.push({
      key: "previa",
      texto: "Sem identificação prévia de entrada (ou vistoria que a substitua)",
      base: "art. 15, II e parágrafo único",
      momento: "entrada",
    });
  }
  if (!chaveNfeValida(v.entryNfeKey)) {
    p.push({
      key: "nfeEntrada",
      texto: "NF-e de entrada sem chave de acesso (44 dígitos)",
      base: "art. 14, I e art. 15, VII",
      momento: "entrada",
    });
  }
  if (v.consigned) {
    if (!v.consignContractId) {
      p.push({
        key: "contratoConsignacao",
        texto: "Consignação sem contrato eletrônico registrado no Renave",
        base: "art. 20, §§ 1º a 3º",
        momento: "entrada",
      });
    }
  } else if (!v.renaveAssinaturaTipo) {
    p.push({
      key: "assinatura",
      texto: "Assinatura do vendedor na compra sem data/tipo registrados",
      base: "art. 15, VIII",
      momento: "entrada",
    });
  }
  if (!v.renaveEntradaProtocolo) {
    p.push({
      key: "entradaProtocolo",
      texto: "Entrada ainda não registrada no Renave",
      base: "art. 5º, III",
      momento: "entrada",
    });
  }

  // Saída: exigida no momento da venda.
  if (!v.crvNumber || !v.crvSecurityCode) {
    p.push({
      key: "crv",
      texto: "CRV sem número ou código de segurança",
      base: "art. 18, II",
      momento: "saida",
    });
  }
  if (vendido) {
    if (!chaveNfeValida(v.exitNfeKey)) {
      p.push({
        key: "nfeSaida",
        texto: "NF-e de saída sem chave de acesso (44 dígitos)",
        base: "art. 18, VII",
        momento: "saida",
      });
    }
    if (!v.renaveSaidaProtocolo) {
      p.push({
        key: "saidaProtocolo",
        texto: "Saída ainda não registrada no Renave",
        base: "art. 18",
        momento: "saida",
      });
    }
  }
  return p;
}

/** Só o que já pesa hoje (some as pendências que são da hora da venda). */
export function pendenciasDeEntrada(v: RenaveVeiculo): Pendencia[] {
  return pendenciasRenave(v).filter((x) => x.momento === "entrada");
}

// ---------------------------------------------------------------------------
// Avisos (implantação: nada é bloqueado)
// ---------------------------------------------------------------------------

/** Data-limite em texto ("28/09/2026") para compor os avisos. */
export function prazoTexto(data: Date | null | undefined): string {
  const d = data ?? RENAVE_PRAZO_PADRAO;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/**
 * Frase-padrão dos avisos. Mesma estrutura em toda tela: o que a rotina vai
 * exigir, a partir de quando, e a garantia de que agora nada trava.
 */
export function avisoImplantacao(oQue: string, prazo: Date | null | undefined, base?: string): string {
  const artigo = base ? ` (${base})` : "";
  return (
    `${oQue} Quando a obrigatoriedade do Renave entrar em vigor, em ${prazoTexto(prazo)}, ` +
    `esta rotina não poderá ser concluída desta forma${artigo}. ` +
    `Por enquanto o sistema apenas avisa — nada fica bloqueado.`
  );
}

/** Aviso da venda de um veículo cuja entrada não foi registrada. */
export function avisoVendaSemEntrada(prazo: Date | null | undefined): string {
  return avisoImplantacao(
    "Este veículo não tem registro de entrada no Renave.",
    prazo,
    "art. 1º, § 1º e art. 5º, III",
  );
}

/** Aviso da consignação sem contrato eletrônico no Renave. */
export function avisoConsignacaoSemContrato(prazo: Date | null | undefined): string {
  return avisoImplantacao(
    "A consignação precisa ser formalizada por contrato eletrônico registrado no Renave, assinado " +
      "digitalmente pela loja e pelo consignante. O contrato impresso do sistema continua servindo como registro interno.",
    prazo,
    "art. 20, §§ 1º a 3º",
  );
}

/** Aviso do financiamento de terceiros / intermediação sem registro. */
export function avisoIntermediacao(prazo: Date | null | undefined): string {
  return avisoImplantacao(
    "Intermediar a venda de um veículo de terceiro exige registro eletrônico prévio no Renave " +
      "(entrada em estoque ou contrato de consignação).",
    prazo,
    "art. 20, § 1º",
  );
}

/** Aviso do financiamento em que a própria loja é a beneficiária. */
export function avisoApontamentoLoja(prazo: Date | null | undefined): string {
  return avisoImplantacao(
    "Quando o beneficiário do financiamento é a própria loja, o apontamento do gravame só é aceito " +
      "com o veículo registrado no estoque do Renave.",
    prazo,
    "art. 34, que altera a Resolução Contran nº 807/2020",
  );
}

/** Aviso do veículo com débitos/restrições em aberto. */
export function avisoVeiculoVinculado(prazo: Date | null | undefined): string {
  return avisoImplantacao(
    "Veículo com débito não liquidado ou restrição impeditiva não aceita registro de estoque no Renave.",
    prazo,
    "art. 11, § 2º",
  );
}

/**
 * Dias restantes para o consignante assinar a ATPV-e (art. 20, § 7º). Negativo
 * = prazo vencido; null = não é consignado ou não há contrato datado.
 */
export function diasParaAtpvConsignacao(
  v: { consigned: boolean; consignContractAt: Date | null },
  hoje = new Date(),
): number | null {
  if (!v.consigned || !v.consignContractAt) return null;
  const limite = new Date(v.consignContractAt);
  limite.setDate(limite.getDate() + PRAZO_ATPV_CONSIGNACAO_DIAS);
  return Math.ceil((limite.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
}
