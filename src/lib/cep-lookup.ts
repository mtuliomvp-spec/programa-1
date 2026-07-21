/**
 * Consulta de endereço pelo CEP via ViaCEP (gratuito, sem token).
 * Variável opcional CEP_API_URL: template com {cep} (padrão ViaCEP).
 */

export type CepData = {
  logradouro?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  /** Endereço já montado (logradouro - bairro - cidade/UF - CEP) para preencher o campo. */
  address?: string;
};

export type CepLookupResult = { ok: true; data: CepData } | { ok: false; error: string };

const DEFAULT_URL = "https://viacep.com.br/ws/{cep}/json/";

function s(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function formatCep(digits: string): string {
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export async function lookupCep(input: string): Promise<CepLookupResult> {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length !== 8) {
    return { ok: false, error: "CEP incompleto. Digite os 8 números." };
  }
  const url = (process.env.CEP_API_URL || DEFAULT_URL).replace("{cep}", digits);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!response.ok) return { ok: false, error: "Não foi possível consultar o CEP agora." };
    const json = (await response.json()) as Record<string, unknown>;
    if (json.erro) return { ok: false, error: "CEP não encontrado. Confira os números." };

    const logradouro = s(json.logradouro);
    const bairro = s(json.bairro);
    const cidade = s(json.localidade);
    const uf = s(json.uf);
    const cep = formatCep(digits);

    const parts: string[] = [];
    if (logradouro) parts.push(logradouro);
    if (bairro) parts.push(bairro);
    if (cidade) parts.push(uf ? `${cidade}/${uf}` : cidade);
    parts.push(`CEP ${cep}`);

    return {
      ok: true,
      data: { logradouro, bairro, cidade, uf, cep, address: parts.join(" - ") },
    };
  } catch {
    return { ok: false, error: "Não foi possível consultar o CEP agora. Tente novamente." };
  }
}
