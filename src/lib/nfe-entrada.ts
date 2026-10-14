import { cfopDaOperacao, pendenciasNfe, regraVigente, type NfeConfig } from "@/lib/nfe-config";
import { faltasEnderecoNfe, type Endereco } from "@/lib/endereco";

/**
 * Monta a NF-e de ENTRADA (compra do veículo usado) no formato da Focus NFe.
 *
 * A loja emite a nota da própria compra (tipo_documento 0): o "destinatário"
 * da nota é quem vendeu o carro (o fornecedor). Emitente: os dados ficam no
 * cadastro da empresa no painel da Focus — mandamos só o CNPJ e o regime
 * vigente (o regime vem daqui porque a mudança agendada vale no dia exato).
 *
 * Função pura: recebe tudo pronto e devolve o payload ou o que falta.
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
  purchasePrice: number;
  consigned: boolean;
  intermediation: boolean;
};

export type VendedorNfe = {
  name: string;
  document: string | null;
  phone: string | null;
  endereco: Endereco | null;
};

export type EntradaInput = {
  cfg: NfeConfig;
  empresa: { cnpj: string | null; inscricaoEstadual: string | null; uf: string | null };
  veiculo: VeiculoNfe;
  vendedor: VendedorNfe | null;
  agora: Date;
  /** Ajustes feitos na tela antes de emitir. */
  ncm?: string;
  descricao?: string;
  informacoes?: string;
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

export function montarNfeEntrada(i: EntradaInput): EntradaResultado {
  const { cfg, empresa, veiculo: v, vendedor } = i;
  const faltas: string[] = [];

  // Configuração (o que é de emissão; provedor/certificado/credenciamento a
  // própria Focus recusa se faltar).
  // As do regime novo só barram a partir da data da mudança — antes disso são
  // aviso na tela de configuração, não motivo para travar a nota de hoje.
  const regraNovaJa = regraVigente(cfg, i.agora).regraNova;
  const doConfig = pendenciasNfe(cfg, !!dig(empresa.cnpj), !!empresa.inscricaoEstadual?.trim()).filter(
    (p) => !/provedor|certificado|credenciamento/i.test(p) && (regraNovaJa || !/novo regime/i.test(p)),
  );
  faltas.push(...doConfig.map((p) => `Configuração da NF-e: ${p}`));

  if (v.intermediation) faltas.push("Veículo de intermediação não tem nota de entrada da loja.");
  if (v.consigned) faltas.push("Veículo consignado: a nota de entrada de consignação ainda não está configurada.");
  if (!(v.purchasePrice > 0)) faltas.push("Valor da compra do veículo.");
  if (!v.chassi?.trim()) faltas.push("Chassi do veículo (Editar veículo).");
  if (!dig(v.renavam)) faltas.push("RENAVAM do veículo (Editar veículo).");

  if (!vendedor) {
    faltas.push("Fornecedor (quem vendeu o carro) no cadastro do veículo.");
  } else {
    const doc = dig(vendedor.document);
    if (doc.length !== 11 && doc.length !== 14) faltas.push(`CPF/CNPJ do fornecedor ${vendedor.name}.`);
    const fe = faltasEnderecoNfe(vendedor.endereco);
    if (fe.length) faltas.push(`Endereço do fornecedor ${vendedor.name}: ${fe.join(", ")} (cadastro do fornecedor).`);
  }

  const ncm = dig(i.ncm || cfg.ncmPadrao);
  if (ncm.length !== 8) faltas.push("NCM do veículo (8 dígitos).");

  const regra = regraVigente(cfg, i.agora, v.consigned);
  const icms: Record<string, unknown> = { icms_origem: 0, icms_situacao_tributaria: regra.icmsCst };
  const valor = r2(v.purchasePrice);
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
  if (["01", "02", "03"].includes(regra.pisCofinsCst)) {
    faltas.push(`PIS/COFINS tributado (CST ${regra.pisCofinsCst}) ainda não é calculado pelo sistema — fale com o suporte.`);
  }

  if (faltas.length || !vendedor) return { ok: false, faltas };

  const end = vendedor.endereco!;
  const doc = dig(vendedor.document);
  const cfop = cfopDaOperacao(cfg, "entrada", empresa.uf, end.uf);
  const interestadual = !!empresa.uf && end.uf !== empresa.uf.trim().toUpperCase();
  const descricao = (i.descricao?.trim() || descricaoVeiculo(v)).toUpperCase().slice(0, 120);
  const homologacao = cfg.ambiente !== "PRODUCAO";
  const informacoes = [i.informacoes?.trim(), cfg.informacoesComplementares.trim()].filter(Boolean).join(" ");

  const payload: Record<string, unknown> = {
    natureza_operacao: cfg.naturezaEntrada || "Compra para comercialização",
    data_emissao: dataHoraSefaz(i.agora),
    tipo_documento: 0,
    local_destino: interestadual ? 2 : 1,
    finalidade_emissao: 1,
    consumidor_final: 1,
    presenca_comprador: 1,
    cnpj_emitente: dig(empresa.cnpj),
    regime_tributario_emitente: Number(regra.regime),
    nome_destinatario: homologacao ? NOME_HOMOLOGACAO : vendedor.name.slice(0, 60),
    ...(doc.length === 11 ? { cpf_destinatario: doc } : { cnpj_destinatario: doc }),
    indicador_inscricao_estadual_destinatario: 9,
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
