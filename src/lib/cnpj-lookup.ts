/**
 * Consulta de dados da empresa pelo CNPJ (igual ao Agrasty):
 * BrasilAPI como fonte principal e ReceitaWS como reserva.
 * Ambas são gratuitas e não exigem token.
 *
 * Variáveis opcionais (para testes ou troca de provedor):
 * - CNPJ_API_URL: template com {cnpj} (padrão BrasilAPI)
 * - CNPJ_API_URL_FALLBACK: template com {cnpj} (padrão ReceitaWS)
 */

export type CnpjData = {
  name?: string;
  fantasia?: string;
  phone?: string;
  email?: string;
  address?: string;
  situacao?: string;
};

export type CnpjLookupResult = { ok: true; data: CnpjData } | { ok: false; error: string };

const DEFAULT_PRIMARY = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}";
const DEFAULT_FALLBACK = "https://receitaws.com.br/v1/cnpj/{cnpj}";

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function titleCase(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function formatPhone(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

function formatCep(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value;
}

function normalize(raw: Record<string, unknown>): CnpjData {
  // BrasilAPI usa razao_social/nome_fantasia; ReceitaWS usa nome/fantasia
  const name = firstString(raw, ["razao_social", "nome"]);
  const fantasia = firstString(raw, ["nome_fantasia", "fantasia"]);

  const logradouro = firstString(raw, ["logradouro", "descricao_tipo_de_logradouro"])
    ? [firstString(raw, ["descricao_tipo_de_logradouro"]), firstString(raw, ["logradouro"])]
        .filter(Boolean)
        .join(" ")
    : undefined;
  const numero = firstString(raw, ["numero"]);
  const complemento = firstString(raw, ["complemento"]);
  const bairro = firstString(raw, ["bairro"]);
  const municipio = firstString(raw, ["municipio"]);
  const uf = firstString(raw, ["uf"]);
  const cep = formatCep(firstString(raw, ["cep"]));

  const parts: string[] = [];
  if (logradouro) parts.push([titleCase(logradouro), numero].filter(Boolean).join(", "));
  if (complemento) parts.push(complemento);
  if (bairro) parts.push(titleCase(bairro)!);
  if (municipio) {
    parts.push(uf ? `${titleCase(municipio)}/${uf.toUpperCase()}` : titleCase(municipio)!);
  }
  if (cep) parts.push(`CEP ${cep}`);

  return {
    name: titleCase(name),
    fantasia: titleCase(fantasia),
    phone: formatPhone(firstString(raw, ["ddd_telefone_1", "telefone"])),
    email: firstString(raw, ["email"])?.toLowerCase(),
    address: parts.length ? parts.join(" - ") : undefined,
    situacao: firstString(raw, ["descricao_situacao_cadastral", "situacao"]),
  };
}

async function fetchProvider(template: string, cnpj: string): Promise<CnpjData | null> {
  const url = template.replace("{cnpj}", cnpj);
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!response.ok) return null;
  const json = (await response.json()) as Record<string, unknown>;
  // ReceitaWS devolve HTTP 200 com {status: "ERROR"} quando não encontra
  if (json.status === "ERROR") return null;
  const data = normalize(json);
  return data.name ? data : null;
}

export async function lookupCnpj(input: string): Promise<CnpjLookupResult> {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11) {
    return { ok: false, error: "Esse número é um CPF — a busca automática funciona só para CNPJ." };
  }
  if (digits.length !== 14) {
    return { ok: false, error: "CNPJ incompleto. Digite os 14 números (com ou sem pontuação)." };
  }

  const primary = process.env.CNPJ_API_URL || DEFAULT_PRIMARY;
  const fallback = process.env.CNPJ_API_URL_FALLBACK || DEFAULT_FALLBACK;

  try {
    const data = (await fetchProvider(primary, digits).catch(() => null)) ??
      (await fetchProvider(fallback, digits).catch(() => null));
    if (!data) {
      return { ok: false, error: "CNPJ não encontrado. Confira os números e tente de novo." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Não foi possível consultar o CNPJ agora. Tente novamente." };
  }
}
