import { z } from "zod";

/**
 * Emissão de NF-e pelo sistema: o provedor contratado (que fala com a SEFAZ),
 * o ambiente e a regra fiscal que o CONTADOR definiu. Fica em
 * CompanySettings.nfeConfig (JSON) — os campos mudam conforme o contador
 * detalha a tributação, sem migração a cada ajuste.
 *
 * O token do provedor e o certificado A1 NÃO ficam aqui: o certificado vai no
 * painel do provedor e o token em variável de ambiente.
 */

export const NFE_PROVEDORES = ["FOCUS_NFE", "BRASIL_NFE", "OUTRO"] as const;
export const nfeProvedorLabel: Record<(typeof NFE_PROVEDORES)[number], string> = {
  FOCUS_NFE: "Focus NFe",
  BRASIL_NFE: "Brasil NFe",
  OUTRO: "Outro",
};

/** CRT da NF-e: 1 Simples Nacional, 2 Simples com excesso de sublimite, 3 Regime normal. */
export const NFE_REGIMES = ["1", "2", "3"] as const;
export const nfeRegimeLabel: Record<(typeof NFE_REGIMES)[number], string> = {
  "1": "Simples Nacional",
  "2": "Simples Nacional — excesso de sublimite",
  "3": "Regime normal (Lucro Presumido / Real)",
};

const cfop = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s === "" || /^[1-7]\d{3}$/.test(s), "CFOP tem 4 dígitos (ex.: 1.102).");

export const nfeConfigSchema = z.object({
  provedor: z.enum(NFE_PROVEDORES).nullable().default(null),
  provedorNome: z.string().default(""),
  ambiente: z.enum(["HOMOLOGACAO", "PRODUCAO"]).default("HOMOLOGACAO"),
  credenciadaSefaz: z.boolean().default(false),
  certificadoA1: z.boolean().default(false),
  regime: z.enum(NFE_REGIMES).nullable().default(null),
  serie: z.string().default("1"),
  // Entrada: compra para comercialização (de pessoa física, em regra).
  naturezaEntrada: z.string().default("Compra para comercialização"),
  cfopEntradaUf: cfop.default("1102"),
  cfopEntradaForaUf: cfop.default("2102"),
  // Saída: venda de mercadoria adquirida de terceiros.
  naturezaSaida: z.string().default("Venda de mercadoria adquirida de terceiros"),
  cfopSaidaUf: cfop.default("5102"),
  cfopSaidaForaUf: cfop.default("6102"),
  // Consignação mercantil: CFOPs e natureza próprios (o contador definiu
  // 1.917/2.917 na entrada e 5.115/6.115 na venda).
  naturezaConsigEntrada: z.string().default("Entrada em consignação mercantil"),
  cfopConsigEntradaUf: cfop.default("1917"),
  cfopConsigEntradaForaUf: cfop.default("2917"),
  naturezaConsigSaida: z.string().default("Venda de mercadoria recebida em consignação"),
  cfopConsigSaidaUf: cfop.default("5115"),
  cfopConsigSaidaForaUf: cfop.default("6115"),
  // NCM do item (8 dígitos). Automóvel de passageiros é 8703.xx.xx e utilitário
  // 8704.xx.xx — o código exato depende do motor/combustível; este é o padrão,
  // ajustável na hora de emitir.
  ncmPadrao: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s === "" || /^\d{8}$/.test(s), "NCM tem 8 dígitos (ex.: 8703.23.10).")
    .default(""),
  // NCM das picapes médias/grandes (posição 8704) — o contador informa.
  ncmPicape: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s === "" || /^\d{8}$/.test(s), "NCM das picapes tem 8 dígitos (ex.: 8704.21.10).")
    .default(""),
  // NFS-e (serviço — comissão de retorno/seguro cobrada dos bancos), padrão
  // nacional. Os padrões são os das notas que a loja já emitia: 10.02.02
  // (agenciamento/intermediação de contratos), NBS 1.0905.11.00, São Luís.
  // Inscrição Municipal da loja — São Luís exige na DPS (rejeição E0116 sem ela).
  nfseInscricaoMunicipal: z.string().default(""),
  nfseCodigoTributacao: z.string().default("100202"),
  nfseNbs: z.string().default("109051100"),
  nfseMunicipioIbge: z.string().default("2111300"),
  // Percentual aproximado dos tributos no Simples (Lei 12.741) — para ME/EPP o
  // Ambiente Nacional exige este campo (pTotTribSN) e recusa o "não informar"
  // (E0712). Vazio = 0. A alíquota efetiva do DAS vem do contador.
  nfsePercentualSimples: z.string().default(""),
  // ISS retido pelo tomador? As notas da loja saem "Não Retido".
  nfseIssRetido: z.boolean().default(false),
  // Tributação — o contador define. CST (regime normal) ou CSOSN (Simples).
  icmsCst: z.string().default(""),
  // Consignação pode ter tratamento próprio (ex.: CSOSN 900 em vez de 102).
  // Vazio = usa o mesmo de icmsCst.
  icmsCstConsignacao: z.string().default(""),
  icmsReducaoBase: z.string().default(""),
  icmsAliquota: z.string().default(""),
  pisCofinsCst: z.string().default(""),
  informacoesComplementares: z.string().default(""),
  // Mudança de regime AGENDADA (ex.: Simples → Lucro Presumido em janeiro):
  // a partir de `regimeNovoDesde` (AAAA-MM-DD) as notas saem com a regra nova,
  // sem depender de alguém lembrar de trocar a configuração no dia.
  regimeNovo: z.enum(NFE_REGIMES).nullable().default(null),
  regimeNovoDesde: z.string().default(""),
  icmsCstNovo: z.string().default(""),
  icmsCstConsignacaoNovo: z.string().default(""),
  icmsReducaoBaseNovo: z.string().default(""),
  icmsAliquotaNovo: z.string().default(""),
  pisCofinsCstNovo: z.string().default(""),
});

export type NfeConfig = z.infer<typeof nfeConfigSchema>;

/** Lê o JSON salvo; o que faltar (ou estiver inválido) vem com o padrão. */
export function lerNfeConfig(raw: unknown): NfeConfig {
  const base = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const parsed = nfeConfigSchema.safeParse(base);
  if (parsed.success) return parsed.data;
  // Campo inválido isolado não derruba o resto: descarta só os que falharam.
  const bons = { ...base };
  for (const issue of parsed.error.issues) delete bons[String(issue.path[0])];
  return nfeConfigSchema.parse(bons);
}

/** "87032310" → "8703.23.10". */
export function formatarNcm(n: string): string {
  return /^\d{8}$/.test(n) ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : n;
}

/** "1102" → "1.102". */
export function formatarCfop(c: string): string {
  return /^\d{4}$/.test(c) ? `${c[0]}.${c.slice(1)}` : c;
}

/**
 * CFOP da operação pela UF da outra parte: mesma UF da loja → interno (1/5),
 * outra UF → interestadual (2/6). UF desconhecida = interno (o caso comum).
 */
export function cfopDaOperacao(
  cfg: NfeConfig,
  tipo: "entrada" | "saida",
  ufLoja: string | null | undefined,
  ufOutraParte: string | null | undefined,
  consignacao = false,
): string {
  const fora =
    !!ufLoja && !!ufOutraParte && ufLoja.trim().toUpperCase() !== ufOutraParte.trim().toUpperCase();
  if (consignacao) {
    if (tipo === "entrada") return fora ? cfg.cfopConsigEntradaForaUf : cfg.cfopConsigEntradaUf;
    return fora ? cfg.cfopConsigSaidaForaUf : cfg.cfopConsigSaidaUf;
  }
  if (tipo === "entrada") return fora ? cfg.cfopEntradaForaUf : cfg.cfopEntradaUf;
  return fora ? cfg.cfopSaidaForaUf : cfg.cfopSaidaUf;
}

/**
 * NCM do automóvel pela cilindrada (orientação do contador): até 1.0 →
 * 8703.21.00; até 1.5 → 8703.22.10; até 3.0 → 8703.23.10; acima → 8703.24.10.
 * A cilindrada sai da versão/modelo ("1.0 Turbo", "1.6 MSI").
 *
 * Picapes (orientação do contador): as COMPACTAS, com carga abaixo de 1 t
 * (Strada, Saveiro, Montana, Oroch…), ficam na 8703 pela cilindrada; as médias
 * e grandes (Hilux, S10, Ranger, Toro…) vão para a 8704 pelo combustível; sem
 * combustível cadastrado, vale o "NCM das picapes 8704" da configuração.
 * Diesel/elétrico/híbrido de passeio têm posição própria: aí vale o NCM padrão,
 * conferido na tela.
 */
const PICAPE_COMPACTA = /\b(strada|saveiro|montana|oroch|courier|hoggar)\b/i;
const PICAPE_8704 =
  /\b(hilux|s-?10|ranger|amarok|l200|triton|frontier|toro|maverick|rampage|fiorino|d-?20|f-?250|ram|silverado|tundra)\b/i;

export function ncmSugerido(v: {
  model: string;
  version: string | null;
  fuel?: string | null;
}): { ncm: string | null; motivo: string; posicao8704?: boolean } {
  const texto = `${v.model} ${v.version ?? ""}`;
  if (PICAPE_8704.test(texto)) {
    // Picape completa (com caçamba), PBT abaixo de 5 t — pelo combustível
    // (orientação do contador): diesel 8704.21.90; flex/gasolina/etanol
    // 8704.31.90; 100% elétrica 8704.60.00.
    const comb = `${v.fuel ?? ""} ${texto}`;
    if (/diesel/i.test(comb)) return { ncm: "87042190", motivo: "picape média/grande a diesel — 8704.21.90" };
    if (/el[eé]tric/i.test(comb) && !/h[ií]brid/i.test(comb)) {
      return { ncm: "87046000", motivo: "picape 100% elétrica — 8704.60.00" };
    }
    if (/flex|gasolina|etanol|[aá]lcool/i.test(comb)) {
      return { ncm: "87043190", motivo: "picape média/grande flex/gasolina — 8704.31.90" };
    }
    return {
      ncm: null,
      motivo: /h[ií]brid/i.test(comb)
        ? "picape híbrida — posição 8704 (confira o NCM com o contador)"
        : "picape média/grande sem combustível cadastrado — posição 8704",
      posicao8704: true,
    };
  }
  const compacta = PICAPE_COMPACTA.test(texto);
  if (!compacta && /diesel|el[eé]tric|h[ií]brid/i.test(`${v.fuel ?? ""} ${texto}`)) {
    return { ncm: null, motivo: "diesel/elétrico/híbrido tem posição própria — confira o NCM" };
  }
  const m = texto.match(/\b(\d)[.,](\d)\b/);
  if (!m) return { ncm: null, motivo: "cilindrada não encontrada na versão — confira o NCM" };
  const litros = Number(`${m[1]}.${m[2]}`);
  const cc = `${m[1]}.${m[2]}`;
  const sufixo = compacta ? " · picape compacta (carga abaixo de 1 t) fica na 8703" : "";
  if (litros <= 1.0) return { ncm: "87032100", motivo: `motor ${cc} (até 1.000 cm³)${sufixo}` };
  if (litros <= 1.5) return { ncm: "87032210", motivo: `motor ${cc} (1.000 a 1.500 cm³)${sufixo}` };
  if (litros <= 3.0) return { ncm: "87032310", motivo: `motor ${cc} (1.500 a 3.000 cm³)${sufixo}` };
  return { ncm: "87032410", motivo: `motor ${cc} (acima de 3.000 cm³)${sufixo}` };
}

/** NCM que vai na nota: o sugerido; picape 8704 usa o da configuração; senão o padrão. */
export function ncmDoVeiculo(
  cfg: NfeConfig,
  v: { model: string; version: string | null; fuel?: string | null },
): { ncm: string; motivo: string } {
  const s = ncmSugerido(v);
  if (s.posicao8704) {
    return {
      ncm: cfg.ncmPicape,
      motivo: cfg.ncmPicape ? `${s.motivo} (NCM das picapes da configuração)` : `${s.motivo} — informe o NCM`,
    };
  }
  return { ncm: s.ncm ?? cfg.ncmPadrao, motivo: s.motivo };
}

/** CST do PIS/COFINS: sempre 2 dígitos (o CSOSN de 3 dígitos é do ICMS). */
export const CST_PIS_COFINS_VALIDOS = [
  "01", "02", "03", "04", "05", "06", "07", "08", "09",
  "49", "50", "51", "52", "53", "54", "55", "56", "60", "61", "62", "63", "64", "65", "66", "67",
  "70", "71", "72", "73", "74", "75", "98", "99",
];

export function erroCstPisCofins(codigo: string): string | null {
  const c = codigo.trim();
  if (!c || CST_PIS_COFINS_VALIDOS.includes(c)) return null;
  return `“${c}” não é CST do PIS/COFINS — ele tem 2 dígitos (ex.: 49 ou 99). O 102 é o CSOSN do ICMS.`;
}

/** Simples Nacional (CRT 1 e 2) usa CSOSN (3 dígitos); o regime normal usa CST (2 dígitos). */
export const CSOSN_VALIDOS = ["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"];
export const CST_ICMS_VALIDOS = ["00", "10", "20", "30", "40", "41", "50", "51", "60", "70", "90"];

export function usaCsosn(regime: string | null): boolean {
  return regime === "1" || regime === "2";
}

/** Código de ICMS incompatível com o regime (CSOSN no regime normal ou o contrário). */
export function erroCodigoIcms(regime: string | null, codigo: string): string | null {
  const c = codigo.trim();
  if (!c || !regime) return null;
  if (usaCsosn(regime)) {
    return CSOSN_VALIDOS.includes(c) ? null : `“${c}” não é CSOSN — no Simples Nacional o código tem 3 dígitos (ex.: 102).`;
  }
  return CST_ICMS_VALIDOS.includes(c) ? null : `“${c}” não é CST do ICMS — no regime normal o código tem 2 dígitos (ex.: 20).`;
}

/** "2027-01-01" → "01/01/2027". */
export function dataBr(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso;
}

export type RegraTributaria = {
  regime: (typeof NFE_REGIMES)[number] | null;
  icmsCst: string;
  icmsReducaoBase: string;
  icmsAliquota: string;
  pisCofinsCst: string;
  /** true quando já vale a regra da mudança agendada. */
  regraNova: boolean;
};

/**
 * A regra que vale para uma nota emitida em `data` (dia em São Paulo): antes
 * da mudança agendada, a atual; a partir dela, a nova. Na consignação, o
 * código próprio (se houver) vence o geral.
 */
export function regraVigente(cfg: NfeConfig, data: Date, consignacao = false): RegraTributaria {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(data);
  const nova = !!cfg.regimeNovo && /^\d{4}-\d{2}-\d{2}$/.test(cfg.regimeNovoDesde) && dia >= cfg.regimeNovoDesde;
  if (nova) {
    return {
      regime: cfg.regimeNovo,
      icmsCst: (consignacao && cfg.icmsCstConsignacaoNovo) || cfg.icmsCstNovo,
      icmsReducaoBase: cfg.icmsReducaoBaseNovo,
      icmsAliquota: cfg.icmsAliquotaNovo,
      pisCofinsCst: cfg.pisCofinsCstNovo,
      regraNova: true,
    };
  }
  return {
    regime: cfg.regime,
    icmsCst: (consignacao && cfg.icmsCstConsignacao) || cfg.icmsCst,
    icmsReducaoBase: cfg.icmsReducaoBase,
    icmsAliquota: cfg.icmsAliquota,
    pisCofinsCst: cfg.pisCofinsCst,
    regraNova: false,
  };
}

/** O que ainda falta para a loja poder emitir — vira o checklist da tela. */
export function pendenciasNfe(cfg: NfeConfig, temCnpj: boolean, temIe: boolean): string[] {
  const p: string[] = [];
  if (!temCnpj) p.push("CNPJ da empresa (Parâmetros)");
  if (!temIe) p.push("Inscrição estadual (Parâmetros)");
  if (!cfg.credenciadaSefaz) p.push("Credenciamento na SEFAZ para emitir NF-e");
  if (!cfg.certificadoA1) p.push("Certificado e-CNPJ A1 enviado ao provedor");
  if (!cfg.provedor) p.push("Provedor de emissão contratado");
  if (!cfg.regime) p.push("Regime tributário (CRT)");
  if (!cfg.cfopEntradaUf || !cfg.cfopEntradaForaUf) p.push("CFOP de entrada");
  if (!cfg.cfopSaidaUf || !cfg.cfopSaidaForaUf) p.push("CFOP de saída");
  if (!cfg.ncmPadrao) p.push("NCM padrão dos veículos (contador)");
  if (!cfg.icmsCst) p.push("CST/CSOSN do ICMS (contador)");
  for (const c of [cfg.icmsCst, cfg.icmsCstConsignacao]) {
    const e = erroCodigoIcms(cfg.regime, c);
    if (e) p.push(e);
  }
  if (!cfg.pisCofinsCst) p.push("CST do PIS/COFINS (contador)");
  if (cfg.regimeNovo) {
    const quando = cfg.regimeNovoDesde ? ` (a partir de ${dataBr(cfg.regimeNovoDesde)})` : "";
    if (!cfg.regimeNovoDesde) p.push("Data em que o novo regime começa");
    if (!cfg.icmsCstNovo) p.push(`${usaCsosn(cfg.regimeNovo) ? "CSOSN" : "CST"} do ICMS no novo regime${quando}`);
    for (const c of [cfg.icmsCstNovo, cfg.icmsCstConsignacaoNovo]) {
      const e = erroCodigoIcms(cfg.regimeNovo, c);
      if (e) p.push(`Novo regime: ${e}`);
    }
    if (!cfg.pisCofinsCstNovo) p.push(`CST do PIS/COFINS no novo regime${quando}`);
  }
  return p;
}
