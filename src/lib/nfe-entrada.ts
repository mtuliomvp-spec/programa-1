import { cfopDaOperacao, ncmSugerido, pendenciasNfe, regraVigente, type NfeConfig } from "@/lib/nfe-config";
import { faltasEnderecoNfe, type Endereco } from "@/lib/endereco";

/**
 * Monta a NF-e do veículo usado no formato da Focus NFe:
 *  - ENTRADA (compra, tipo_documento 0): o "destinatário" da nota é quem
 *    vendeu o carro (o fornecedor);
 *  - SAÍDA (venda, tipo_documento 1): o destinatário é o comprador (cliente).
 * Emitente: os dados ficam no cadastro da empresa no painel da Focus —
 * mandamos só o CNPJ e o regime vigente (o regime vem daqui porque a mudança
 * agendada vale no dia exato).
 *
 * Funções puras: recebem tudo pronto e devolvem o payload ou o que falta.
 */

export const NOME_HOMOLOGACAO = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

export type VeiculoNfe = {
  id: string;
  plate: string;
  chassi: string | null;
  renavam: string | null;
  brand: string;
  model: string;
  version: string | null;
  manufactureYear: number;
  modelYear: number;
  color: string | null;
  km: number;
  fuel?: string | null;
  purchasePrice: number;
  consigned: boolean;
  intermediation: boolean;
};

export type VendedorNfe = {
  name: string;
  document: string | null;
  phone: string | null;
  endereco: Endereco | null;
  inscricaoEstadual?: string | null;
};

type Comum = {
  cfg: NfeConfig;
  empresa: { cnpj: string | null; inscricaoEstadual: string | null; uf: string | null };
  veiculo: VeiculoNfe;
  agora: Date;
  /** Ajustes feitos na tela antes de emitir. */
  ncm?: string;
  descricao?: string;
  informacoes?: string;
};

export type EntradaInput = Comum & { vendedor: VendedorNfe | null };

export type SaidaInput = Comum & {
  /** Comprador (cliente da venda). */
  comprador: VendedorNfe | null;
  venda: {
    status: string;
    totalAmount: number;
    consigned: boolean;
    transferCharged?: boolean;
    transferAmount?: number;
  } | null;
  /** Valor da nota ajustado na tela (padrão: valor da venda). */
  valor?: number;
};

export type EntradaResultado =
  | { ok: true; payload: Record<string, unknown>; cfop: string; valor: number; descricao: string }
  | { ok: false; faltas: string[] };

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Data/hora no fuso de São Paulo, como a SEFAZ espera ("2026-10-14T10:30:00-03:00"). */
export function dataHoraSefaz(d: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}-03:00`;
}

/** "FIAT MOBI LIKE 1.0 2020/2021 PLACA ABC1D23" — o que cabe no nome do item (120). */
export function descricaoVeiculo(v: VeiculoNfe): string {
  return [
    "VEICULO USADO",
    v.brand,
    v.model,
    v.version,
    `${v.manufactureYear}/${v.modelYear}`,
    v.plate ? `PLACA ${v.plate}` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .slice(0, 120);
}

/** Chassi, RENAVAM, cor e km — vão nas informações adicionais do item. */
export function detalhesVeiculo(v: VeiculoNfe): string {
  return [
    v.chassi ? `CHASSI ${v.chassi}` : null,
    v.renavam ? `RENAVAM ${dig(v.renavam)}` : null,
    v.color ? `COR ${v.color}` : null,
    v.km ? `KM ${v.km}` : null,
  ]
    .filter(Boolean)
    .join(" - ")
    .toUpperCase()
    .slice(0, 500);
}

const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Indicador da IE do destinatário: empresa com IE ativa é contribuinte (1) e a
 * SEFAZ exige o número — confere no cadastro nacional e rejeita "IE do
 * destinatário não informada"; "ISENTO" é 2; pessoa física ou sem IE, 9.
 */
export function indicadorIe(doc: string, ie: string | null | undefined): Record<string, unknown> {
  if (doc.length === 14 && ie) {
    if (/^ISENT/i.test(ie)) return { indicador_inscricao_estadual_destinatario: 2 };
    const n = dig(ie);
    if (n.length >= 2) {
      return { indicador_inscricao_estadual_destinatario: 1, inscricao_estadual_destinatario: n };
    }
  }
  return { indicador_inscricao_estadual_destinatario: 9 };
}

/** Empresa com IE (número) é contribuinte do ICMS. */
function ieContribuinte(doc: string, ie: string | null | undefined): boolean {
  return doc.length === 14 && !!ie && !/^ISENT/i.test(ie) && dig(ie).length >= 2;
}

export function montarNfeEntrada(i: EntradaInput): EntradaResultado {
  const faltas: string[] = [];
  const v = i.veiculo;
  if (v.intermediation) faltas.push("Veículo de intermediação não tem nota de entrada da loja.");
  if (!(v.purchasePrice > 0)) faltas.push(v.consigned ? "Valor combinado com o consignante." : "Valor da compra do veículo.");
  return montar(i, {
    tipo: "ENTRADA",
    pessoa: i.vendedor,
    papel: "fornecedor",
    semPessoa: "Fornecedor (quem vendeu o carro) no cadastro do veículo.",
    valor: v.purchasePrice,
    consignado: v.consigned,
    faltas,
  });
}

/**
 * Valor da nota de venda: só o VEÍCULO (orientação do contador) — a
 * transferência cobrada junto na venda é serviço e não entra na nota.
 */
export function valorDoVeiculoNaVenda(venda: NonNullable<SaidaInput["venda"]>): number {
  const transf = venda.transferCharged ? (venda.transferAmount ?? 0) : 0;
  return r2(Math.max(0, venda.totalAmount - transf));
}

export function montarNfeSaida(i: SaidaInput): EntradaResultado {
  const faltas: string[] = [];
  const v = i.veiculo;
  const consignado = !!i.venda?.consigned || v.consigned;
  if (v.intermediation) faltas.push("Intermediação (financiamento de terceiros) não tem nota de venda da loja.");
  if (!i.venda) faltas.push("Venda registrada para este veículo.");
  else if (i.venda.status === "CANCELADA") faltas.push("A venda deste veículo está cancelada.");
  const valor = i.valor ?? (i.venda ? valorDoVeiculoNaVenda(i.venda) : 0);
  if (!(valor > 0)) faltas.push("Valor da venda.");
  return montar(i, {
    tipo: "SAIDA",
    pessoa: i.comprador,
    papel: "cliente",
    semPessoa: "Cliente (comprador) na venda.",
    valor,
    consignado,
    faltas,
  });
}

function montar(
  i: Comum,
  o: {
    tipo: "ENTRADA" | "SAIDA";
    pessoa: VendedorNfe | null;
    papel: "fornecedor" | "cliente";
    semPessoa: string;
    valor: number;
    consignado: boolean;
    faltas: string[];
  },
): EntradaResultado {
  const { cfg, empresa, veiculo: v } = i;
  const vendedor = o.pessoa;
  const faltas = o.faltas;
  const entrada = o.tipo === "ENTRADA";

  // Configuração (o que é de emissão; provedor/certificado/credenciamento a
  // própria Focus recusa se faltar).
  // As do regime novo só barram a partir da data da mudança — antes disso são
  // aviso na tela de configuração, não motivo para travar a nota de hoje.
  const regraNovaJa = regraVigente(cfg, i.agora).regraNova;
  const doConfig = pendenciasNfe(cfg, !!dig(empresa.cnpj), !!empresa.inscricaoEstadual?.trim()).filter(
    (p) => !/provedor|certificado|credenciamento/i.test(p) && (regraNovaJa || !/novo regime/i.test(p)),
  );
  faltas.push(...doConfig.map((p) => `Configuração da NF-e: ${p}`));

  if (!v.chassi?.trim()) faltas.push("Chassi do veículo (Editar veículo).");
  if (!dig(v.renavam)) faltas.push("RENAVAM do veículo (Editar veículo).");

  if (!vendedor) {
    faltas.push(o.semPessoa);
  } else {
    const doc = dig(vendedor.document);
    if (doc.length !== 11 && doc.length !== 14) faltas.push(`CPF/CNPJ do ${o.papel} ${vendedor.name}.`);
    const fe = faltasEnderecoNfe(vendedor.endereco);
    if (fe.length) {
      faltas.push(`Endereço do ${o.papel} ${vendedor.name}: ${fe.join(", ")} (cadastro do ${o.papel}).`);
    }
  }

  const ncm = dig(i.ncm || ncmSugerido(v).ncm || cfg.ncmPadrao);
  if (ncm.length !== 8) faltas.push("NCM do veículo (8 dígitos).");

  const regra = regraVigente(cfg, i.agora, o.consignado);
  const icms: Record<string, unknown> = { icms_origem: 0, icms_situacao_tributaria: regra.icmsCst };
  const valor = r2(o.valor);
  if (["00", "20"].includes(regra.icmsCst)) {
    const reducao = regra.icmsCst === "20" ? num(regra.icmsReducaoBase || "0") : 0;
    const aliquota = num(regra.icmsAliquota || "");
    if (!Number.isFinite(aliquota) || aliquota <= 0) faltas.push("Alíquota do ICMS (configuração da NF-e).");
    if (regra.icmsCst === "20" && !(reducao > 0)) faltas.push("Redução da base do ICMS (configuração da NF-e).");
    const base = r2(valor * (1 - (reducao || 0) / 100));
    Object.assign(icms, {
      icms_modalidade_base_calculo: 3,
      ...(regra.icmsCst === "20" ? { icms_reducao_base_calculo: reducao } : {}),
      icms_base_calculo: base,
      icms_aliquota: aliquota,
      icms_valor: r2((base * aliquota) / 100),
    });
  } else if (regra.icmsCst && !/^(1\d\d|[2-5]00|900|40|41|50)$/.test(regra.icmsCst)) {
    faltas.push(`O código de ICMS ${regra.icmsCst} ainda não é calculado pelo sistema — fale com o suporte.`);
  }
  // A SEFAZ recusa CSOSN 900 na venda a não contribuinte ("CSOSN incompatível
  // na operação com Não Contribuinte") — avisa antes de gastar a tentativa.
  if (
    !entrada &&
    regra.icmsCst === "900" &&
    !(vendedor && ieContribuinte(dig(vendedor.document), vendedor.inscricaoEstadual))
  ) {
    faltas.push(
      "CSOSN 900 não é aceito pela SEFAZ na venda a pessoa física/não contribuinte — use 102 (deixe vazio o CSOSN da consignação na configuração).",
    );
  }
  if (["01", "02", "03"].includes(regra.pisCofinsCst)) {
    faltas.push(`PIS/COFINS tributado (CST ${regra.pisCofinsCst}) ainda não é calculado pelo sistema — fale com o suporte.`);
  }

  if (faltas.length || !vendedor) return { ok: false, faltas };

  const end = vendedor.endereco!;
  const doc = dig(vendedor.document);
  const cfop = cfopDaOperacao(cfg, entrada ? "entrada" : "saida", empresa.uf, end.uf, o.consignado);
  const interestadual = !!empresa.uf && end.uf !== empresa.uf.trim().toUpperCase();
  const descricao = (i.descricao?.trim() || descricaoVeiculo(v)).toUpperCase().slice(0, 120);
  const homologacao = cfg.ambiente !== "PRODUCAO";
  const informacoes = [i.informacoes?.trim(), cfg.informacoesComplementares.trim()].filter(Boolean).join(" ");

  const payload: Record<string, unknown> = {
    natureza_operacao: (o.consignado
      ? entrada
        ? cfg.naturezaConsigEntrada || "Entrada em consignação mercantil"
        : cfg.naturezaConsigSaida || "Venda de mercadoria recebida em consignação"
      : entrada
        ? cfg.naturezaEntrada || "Compra para comercialização"
        : cfg.naturezaSaida || "Venda de mercadoria adquirida de terceiros"
    ).slice(0, 60),
    data_emissao: dataHoraSefaz(i.agora),
    tipo_documento: entrada ? 0 : 1,
    local_destino: interestadual ? 2 : 1,
    finalidade_emissao: 1,
    // Venda a empresa contribuinte (com IE) não é a consumidor final.
    consumidor_final: !entrada && ieContribuinte(doc, vendedor.inscricaoEstadual) ? 0 : 1,
    presenca_comprador: 1,
    cnpj_emitente: dig(empresa.cnpj),
    regime_tributario_emitente: Number(regra.regime),
    nome_destinatario: homologacao ? NOME_HOMOLOGACAO : vendedor.name.slice(0, 60),
    ...(doc.length === 11 ? { cpf_destinatario: doc } : { cnpj_destinatario: doc }),
    ...indicadorIe(doc, vendedor.inscricaoEstadual),
    logradouro_destinatario: end.logradouro,
    numero_destinatario: end.numero || "S/N",
    ...(end.complemento ? { complemento_destinatario: end.complemento } : {}),
    bairro_destinatario: end.bairro,
    municipio_destinatario: end.cidade,
    codigo_municipio_destinatario: Number(end.ibge),
    uf_destinatario: end.uf,
    cep_destinatario: dig(end.cep),
    ...(dig(vendedor.phone).length >= 10 ? { telefone_destinatario: Number(dig(vendedor.phone).slice(0, 14)) } : {}),
    modalidade_frete: 9,
    valor_produtos: valor,
    valor_total: valor,
    ...(informacoes ? { informacoes_adicionais_contribuinte: informacoes.slice(0, 5000) } : {}),
    items: [
      {
        numero_item: 1,
        codigo_produto: (v.plate || v.id).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 60),
        descricao,
        informacoes_adicionais_item: detalhesVeiculo(v) || undefined,
        cfop,
        codigo_ncm: ncm,
        unidade_comercial: "UN",
        quantidade_comercial: 1,
        valor_unitario_comercial: valor,
        unidade_tributavel: "UN",
        quantidade_tributavel: 1,
        valor_unitario_tributavel: valor,
        valor_bruto: valor,
        inclui_no_total: 1,
        ...icms,
        pis_situacao_tributaria: regra.pisCofinsCst,
        cofins_situacao_tributaria: regra.pisCofinsCst,
      },
    ],
  };
  return { ok: true, payload, cfop, valor, descricao };
}
