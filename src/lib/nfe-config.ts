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
  // Tributação — o contador define. CST (regime normal) ou CSOSN (Simples).
  icmsCst: z.string().default(""),
  icmsReducaoBase: z.string().default(""),
  icmsAliquota: z.string().default(""),
  pisCofinsCst: z.string().default(""),
  informacoesComplementares: z.string().default(""),
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
  if (!cfg.icmsCst) p.push("CST/CSOSN do ICMS (contador)");
  if (!cfg.pisCofinsCst) p.push("CST do PIS/COFINS (contador)");
  return p;
}
