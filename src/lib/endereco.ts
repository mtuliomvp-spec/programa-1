import { z } from "zod";

/**
 * Endereço em campos separados — é como a NF-e exige (logradouro, número,
 * bairro, município com código IBGE, UF e CEP). Fica em `endereco` (JSON) no
 * cliente e no fornecedor; o `address` de texto continua existindo, montado a
 * partir daqui, porque é ele que sai nos contratos e documentos impressos.
 */
export const enderecoSchema = z.object({
  cep: z.string().default(""),
  logradouro: z.string().default(""),
  numero: z.string().default(""),
  complemento: z.string().default(""),
  bairro: z.string().default(""),
  cidade: z.string().default(""),
  uf: z.string().default(""),
  // Código IBGE do município (7 dígitos) — vem da busca pelo CEP.
  ibge: z.string().default(""),
});

export type Endereco = z.infer<typeof enderecoSchema>;

export const ENDERECO_CAMPOS = ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "ibge"] as const;

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export function lerEndereco(raw: unknown): Endereco | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = enderecoSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function formatarCep(cep: string): string {
  const d = cep.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

/** Normaliza o que veio do formulário; tudo vazio → null (sem endereço estruturado). */
export function normalizarEndereco(e: Partial<Endereco>): Endereco | null {
  const t = (s?: string) => (s ?? "").trim().replace(/\s+/g, " ");
  const end: Endereco = {
    cep: formatarCep(t(e.cep)),
    logradouro: t(e.logradouro).slice(0, 120),
    numero: t(e.numero).slice(0, 20),
    complemento: t(e.complemento).slice(0, 60),
    bairro: t(e.bairro).slice(0, 60),
    cidade: t(e.cidade).slice(0, 60),
    uf: t(e.uf).toUpperCase().slice(0, 2),
    ibge: t(e.ibge).replace(/\D/g, "").slice(0, 7),
  };
  const algum = end.cep || end.logradouro || end.numero || end.bairro || end.cidade;
  return algum ? end : null;
}

/** "Rua X, 123 - Apto 4 - Centro - São Luís/MA - CEP 65000-000" (mesmo formato da busca por CNPJ). */
export function enderecoTexto(e: Endereco): string {
  const partes: string[] = [];
  if (e.logradouro) partes.push([e.logradouro, e.numero].filter(Boolean).join(", "));
  if (e.complemento) partes.push(e.complemento);
  if (e.bairro) partes.push(e.bairro);
  if (e.cidade) partes.push(e.uf ? `${e.cidade}/${e.uf}` : e.cidade);
  if (e.cep) partes.push(`CEP ${e.cep}`);
  return partes.join(" - ");
}

/** O que falta para o endereço servir numa NF-e (vazio = completo). */
export function faltasEnderecoNfe(e: Endereco | null): string[] {
  if (!e) return ["endereço"];
  const f: string[] = [];
  if (e.cep.replace(/\D/g, "").length !== 8) f.push("CEP");
  if (!e.logradouro) f.push("logradouro");
  if (!e.numero) f.push("número (use S/N se não houver)");
  if (!e.bairro) f.push("bairro");
  if (!e.cidade) f.push("cidade");
  if (!(UFS as readonly string[]).includes(e.uf)) f.push("UF");
  if (e.ibge.length !== 7) f.push("código IBGE do município (busque pelo CEP)");
  return f;
}

/** Lê os campos `end_*` de um FormData. */
export function enderecoDoForm(formData: FormData): Endereco | null {
  const g = (k: string) => String(formData.get(`end_${k}`) ?? "");
  return normalizarEndereco({
    cep: g("cep"),
    logradouro: g("logradouro"),
    numero: g("numero"),
    complemento: g("complemento"),
    bairro: g("bairro"),
    cidade: g("cidade"),
    uf: g("uf"),
    ibge: g("ibge"),
  });
}
