import { regraVigente, type NfeConfig } from "@/lib/nfe-config";
import type { Endereco } from "@/lib/endereco";

/**
 * NFS-e (padrão nacional) da comissão que a loja cobra dos bancos/seguradoras
 * sobre o retorno do financiamento e o seguro — o banco informa o valor e a
 * loja emite a nota contra ele (o "tomador"). Formato da Focus NFe (/v2/nfsen).
 *
 * Função pura: recebe tudo pronto e devolve o payload ou o que falta.
 */

export const DESCRICOES_NFSE = [
  "COMISSÃO SOBRE RETORNO",
  "COMISSÃO SOBRE FINANCIAMENTO",
  "COMISSÃO SOBRE SEGURO",
  "INTERMEDIAÇÃO DE SEGUROS",
] as const;

export type TomadorNfse = {
  name: string;
  document: string | null;
  email?: string | null;
  phone?: string | null;
  endereco: Endereco | null;
};

export type NfseInput = {
  cfg: NfeConfig;
  empresa: { cnpj: string | null };
  tomador: TomadorNfse | null;
  descricao: string;
  valor: number;
  /** Mês/dia de competência (AAAA-MM-DD). */
  competencia: string;
  informacoes?: string;
  agora: Date;
};

export type NfseResultado = { ok: true; payload: Record<string, unknown> } | { ok: false; faltas: string[] };

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** "2026-10-14T10:30:00-0300" — formato do exemplo da Focus para a DPS. */
function dataHoraDps(d: Date): string {
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
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}-0300`;
}

/** "6,5" → 6.5; vazio ou inválido → 0. */
function percentualSimples(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 100 ? Math.round(n * 100) / 100 : 0;
}

export function montarNfse(i: NfseInput): NfseResultado {
  const { cfg, tomador } = i;
  const faltas: string[] = [];
  const cnpj = dig(i.empresa.cnpj);
  if (cnpj.length !== 14) faltas.push("CNPJ da empresa (Parâmetros).");

  const regra = regraVigente(cfg, i.agora);
  // O que a loja tem hoje é Simples Nacional (ME/EPP). Regime normal (Lucro
  // Presumido, a partir de 2027) exige ISS/PIS/COFINS na nota — ainda não.
  if (regra.regime === "3") {
    faltas.push("NFS-e no regime normal (Lucro Presumido) ainda não está configurada — fale com o suporte.");
  }
  if (!dig(cfg.nfseInscricaoMunicipal)) {
    faltas.push("Inscrição municipal da loja (Parâmetros → Nota fiscal → NFS-e).");
  }
  if (dig(cfg.nfseCodigoTributacao).length !== 6) faltas.push("Código de tributação nacional do serviço (6 dígitos).");
  if (dig(cfg.nfseMunicipioIbge).length !== 7) faltas.push("Município da prestação (código IBGE).");

  if (!tomador) {
    faltas.push("Tomador (o banco/seguradora).");
  } else {
    const doc = dig(tomador.document);
    if (doc.length !== 14 && doc.length !== 11) faltas.push(`CNPJ do tomador ${tomador.name} (cadastro do cliente).`);
  }
  const descricao = i.descricao.trim();
  if (!descricao) faltas.push("Descrição do serviço.");
  if (!(i.valor > 0)) faltas.push("Valor da nota.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.competencia)) faltas.push("Competência.");

  if (faltas.length || !tomador) return { ok: false, faltas };

  const doc = dig(tomador.document);
  const end = tomador.endereco;
  const enderecoTomador =
    end && end.logradouro && end.cidade && end.ibge
      ? {
          logradouro_tomador: end.logradouro,
          numero_tomador: end.numero || "S/N",
          ...(end.complemento ? { complemento_tomador: end.complemento } : {}),
          bairro_tomador: end.bairro || "-",
          codigo_municipio_tomador: Number(end.ibge),
          cep_tomador: Number(dig(end.cep)),
        }
      : {};

  const payload: Record<string, unknown> = {
    data_emissao: dataHoraDps(i.agora),
    data_competencia: i.competencia,
    emitente_dps: 1,
    codigo_municipio_emissora: Number(dig(cfg.nfseMunicipioIbge)),
    cnpj_prestador: cnpj,
    inscricao_municipal_prestador: dig(cfg.nfseInscricaoMunicipal).slice(0, 15),
    // 3 = optante ME/EPP; 1 = apuração dos tributos federais e municipal pelo SN.
    codigo_opcao_simples_nacional: 3,
    regime_tributario_simples_nacional: 1,
    regime_especial_tributacao: 0,
    ...(doc.length === 14 ? { cnpj_tomador: doc } : { cpf_tomador: doc }),
    razao_social_tomador: tomador.name.slice(0, 150),
    ...enderecoTomador,
    ...(tomador.email ? { email_tomador: tomador.email.slice(0, 80) } : {}),
    codigo_municipio_prestacao: Number(dig(cfg.nfseMunicipioIbge)),
    codigo_tributacao_nacional_iss: dig(cfg.nfseCodigoTributacao),
    ...(dig(cfg.nfseNbs).length === 9 ? { codigo_nbs: dig(cfg.nfseNbs) } : {}),
    descricao_servico: descricao.slice(0, 1000),
    valor_servico: Math.round(i.valor * 100) / 100,
    tributacao_iss: 1,
    tipo_retencao_iss: cfg.nfseIssRetido ? 2 : 1,
    // Totais aproximados dos tributos (Lei 12.741). Sem o grupo o XML é
    // recusado; para ME/EPP o "não informar" (indTotTrib) também é (E0712) —
    // vai o percentual aproximado do Simples.
    percentual_total_tributos_simples_nacional: percentualSimples(cfg.nfsePercentualSimples),
    ...(i.informacoes?.trim() ? { informacoes_complementares: i.informacoes.trim().slice(0, 2000) } : {}),
  };
  return { ok: true, payload };
}
