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
  // NCM do item (8 dígitos). Automóvel de passageiros é 8703.xx.xx e utilitário
  // 8704.xx.xx — o código exato depende do motor/combustível; este é o padrão,
  // ajustável na hora de emitir.
  ncmPadrao: z
    .string()
    .transform((s) => s.replace(/\D/g, ""))
    .refine((s) => s === "" || /^\d{8}$/.test(s), "NCM tem 8 dígitos (ex.: 8703.23.10).")
    .default(""),
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
): string {
  const fora =
    !!ufLoja && !!ufOutraParte && ufLoja.trim().toUpperCase() !== ufOutraParte.trim().toUpperCase();
  if (tipo === "entrada") return fora ? cfg.cfopEntradaForaUf : cfg.cfopEntradaUf;
  return fora ? cfg.cfopSaidaForaUf : cfg.cfopSaidaUf;
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
