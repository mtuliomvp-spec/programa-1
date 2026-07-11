/**
 * Consulta de dados do veículo pela placa (integração com API externa).
 *
 * Configuração via variáveis de ambiente:
 * - PLACA_API_TOKEN: token contratado no provedor (ex.: wdapi2.com.br)
 * - PLACA_API_URL (opcional): template da URL com {placa} e {token};
 *   padrão: https://wdapi2.com.br/consulta/{placa}/{token}
 *
 * A normalização é defensiva: cada provedor devolve nomes de campos um
 * pouco diferentes, então procuramos os valores em vários lugares comuns.
 */

export type FipeOption = { modelo: string; price: number; ano?: string };

export type PlateLookupData = {
  brand?: string;
  model?: string;
  version?: string;
  manufactureYear?: number;
  modelYear?: number;
  color?: string;
  fuel?: string;
  transmission?: string;
  chassi?: string;
  fipePrice?: number;
  fipeModelo?: string;
  /** Todas as versões FIPE retornadas, da mais provável para a menos provável */
  fipeOptions?: FipeOption[];
};

export type PlateLookupResult =
  | { ok: true; data: PlateLookupData }
  | { ok: false; error: string; notConfigured?: boolean };

const DEFAULT_URL_TEMPLATE = "https://wdapi2.com.br/consulta/{placa}/{token}";

function firstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim() && value.trim() !== "0") {
      return value.trim();
    }
    if (typeof value === "number" && value > 0) return String(value);
  }
  return undefined;
}

function parseYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const year = parseInt(value.slice(0, 4), 10);
  return year >= 1950 && year <= 2100 ? year : undefined;
}

function parseBrl(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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

function fuelFromKeywords(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const fuel = value.toUpperCase();
  if (fuel.includes("FLEX") || (fuel.includes("ALCOOL") && fuel.includes("GASOLINA"))) return "Flex";
  if (fuel.includes("HIBRIDO") || fuel.includes("HÍBRIDO")) return "Híbrido";
  if (fuel.includes("ELETRICO") || fuel.includes("ELÉTRICO")) return "Elétrico";
  if (fuel.includes("DIESEL")) return "Diesel";
  if (fuel.includes("GASOLINA")) return "Gasolina";
  return undefined;
}

function normalizeFuel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return fuelFromKeywords(value) ?? titleCase(value);
}

function transmissionFromKeywords(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.toUpperCase();
  if (v.includes("CVT")) return "CVT";
  if (v.includes("AUT")) return "Automático";
  if (v.includes("MEC") || v.includes("MANUAL")) return "Manual";
  return undefined;
}

/**
 * Mede o quanto o nome de uma versão FIPE "casa" com a descrição do
 * documento do veículo. O documento abrevia e cola as palavras
 * (ex.: "HILUX CDSR A4FD" = Hilux CD SR), então comparamos as palavras
 * da versão FIPE concatenadas em sequência ("HILUX", "HILUXCD",
 * "HILUXCDSR"...) contra a descrição compactada: quanto mais longa a
 * sequência encontrada, melhor o casamento. Assim "CD SR" (CDSR) vence
 * "CD SRV" (CDSRV) para um documento que diz CDSR.
 */
function fipeMatchScore(vehicleCompact: string, fipeModelo: string): number {
  if (!vehicleCompact) return 0;
  const tokens = fipeModelo.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  let sequence = "";
  let best = 0;
  for (const token of tokens) {
    sequence += token;
    if (vehicleCompact.includes(sequence)) best = sequence.length;
    else break;
  }
  return best;
}

function normalize(raw: Record<string, unknown>): PlateLookupData {
  let brand = firstString(raw, ["marca", "MARCA", "brand", "fabricante"]);
  let model = firstString(raw, ["modelo", "MODELO", "model"]);

  // Alguns provedores devolvem "VW/GOL 1.6" num campo único
  const marcaModelo = firstString(raw, ["marcaModelo", "MARCA_MODELO", "marca_modelo"]);
  if (!brand && marcaModelo?.includes("/")) {
    const [m, ...rest] = marcaModelo.split("/");
    brand = m.trim();
    if (!model) model = rest.join("/").trim();
  }

  const extra = (raw.extra ?? {}) as Record<string, unknown>;
  const fipe = (raw.fipe ?? {}) as { dados?: unknown };
  const fipeDados = Array.isArray(fipe.dados) ? (fipe.dados as Record<string, unknown>[]) : [];

  // Todas as versões FIPE válidas, ordenadas pela melhor combinação com a
  // descrição do documento (e, em empate, pelo score do provedor — que
  // sozinho erra com frequência). A tela ainda mostra a lista completa para
  // o usuário confirmar; aqui definimos só a sugestão inicial.
  const vehicleCompact = [brand, model, firstString(raw, ["versao", "VERSAO", "version", "submodelo"]), marcaModelo]
    .filter(Boolean)
    .join(" ")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const candidates: (FipeOption & { providerScore: number; matchScore: number })[] = [];
  let fipeFuel: string | undefined;
  for (const item of fipeDados) {
    const modelo = firstString(item, ["texto_modelo", "modelo"]);
    const price = parseBrl(firstString(item, ["texto_valor", "valor", "preco"]));
    if (!modelo || !price) continue;
    if (!fipeFuel) fipeFuel = firstString(item, ["combustivel", "COMBUSTIVEL", "combustível"]);
    if (candidates.some((o) => o.modelo === modelo && o.price === price)) continue;
    candidates.push({
      modelo,
      price,
      ano: firstString(item, ["ano_modelo", "anoModelo", "ano"]),
      providerScore: Number(item.score) || 0,
      matchScore: fipeMatchScore(vehicleCompact, modelo),
    });
  }
  candidates.sort((a, b) => b.matchScore - a.matchScore || b.providerScore - a.providerScore);
  const fipeOptions: FipeOption[] = candidates.map(({ modelo, price, ano }) => ({ modelo, price, ano }));
  const bestFipe = fipeOptions[0];

  return {
    brand: titleCase(brand),
    model: titleCase(model),
    version: firstString(raw, ["versao", "VERSAO", "version", "submodelo"]),
    manufactureYear: parseYear(firstString(raw, ["ano", "ANO", "anoFabricacao", "ano_fabricacao"])),
    modelYear: parseYear(firstString(raw, ["anoModelo", "ANO_MODELO", "ano_modelo"])),
    color: titleCase(firstString(raw, ["cor", "COR", "color"])),
    fuel:
      normalizeFuel(
        firstString(raw, ["combustivel", "COMBUSTIVEL", "combustível", "COMBUSTÍVEL", "fuel"]) ||
          firstString(extra, ["combustivel", "combustível"]) ||
          fipeFuel,
      ) ||
      // último recurso: o texto da versão FIPE costuma citar o combustível
      // (ex.: "Hilux CD SR 4x4 2.8 TDI Diesel Aut.")
      fuelFromKeywords(fipeOptions.map((o) => o.modelo).join(" ")),
    transmission:
      transmissionFromKeywords(
        firstString(raw, ["cambio", "CAMBIO", "câmbio", "transmissao", "transmissão"]) ||
          firstString(extra, ["cambio", "câmbio", "transmissao"]),
      ) ?? transmissionFromKeywords(bestFipe?.modelo),
    chassi: firstString(raw, ["chassi", "CHASSI", "vin"]) || firstString(extra, ["chassi"]),
    fipePrice: bestFipe ? bestFipe.price : parseBrl(firstString(raw, ["valorFipe", "fipe_valor"])),
    fipeModelo: bestFipe?.modelo,
    fipeOptions,
  };
}

/**
 * Consulta bruta para a página de diagnóstico (somente ADMIN):
 * devolve o JSON completo do provedor + o resultado normalizado,
 * para investigar por que algum campo não foi preenchido.
 */
export async function lookupPlateRaw(
  plateInput: string,
): Promise<{ ok: true; json: Record<string, unknown>; normalized: PlateLookupData } | { ok: false; error: string }> {
  const plate = plateInput.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) {
    return { ok: false, error: "Placa inválida. Use o formato ABC1D23 ou ABC1234." };
  }
  const token = process.env.PLACA_API_TOKEN;
  const template = process.env.PLACA_API_URL || DEFAULT_URL_TEMPLATE;
  if (!token && template.includes("{token}")) {
    return { ok: false, error: "PLACA_API_TOKEN não configurado." };
  }
  const url = template.replace("{placa}", plate).replace("{token}", token || "");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!response.ok) {
      return { ok: false, error: `O provedor respondeu HTTP ${response.status}.` };
    }
    const json = (await response.json()) as Record<string, unknown>;
    return { ok: true, json, normalized: normalize(json) };
  } catch {
    return { ok: false, error: "Falha de rede ao consultar o provedor." };
  }
}

export async function lookupPlate(plateInput: string): Promise<PlateLookupResult> {
  const plate = plateInput.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) {
    return { ok: false, error: "Placa inválida. Use o formato ABC1D23 ou ABC1234." };
  }

  const token = process.env.PLACA_API_TOKEN;
  const template = process.env.PLACA_API_URL || DEFAULT_URL_TEMPLATE;
  if (!token && template.includes("{token}")) {
    return {
      ok: false,
      notConfigured: true,
      error:
        "A consulta por placa ainda não está ativada. Contrate um token em um provedor de consulta veicular (ex.: wdapi2.com.br) e configure a variável PLACA_API_TOKEN na Vercel.",
    };
  }

  const url = template.replace("{placa}", plate).replace("{token}", token || "");

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `A consulta da placa falhou (HTTP ${response.status}). Verifique o token ou tente novamente.`,
      };
    }
    const json = (await response.json()) as Record<string, unknown>;
    const data = normalize(json);
    if (!data.brand && !data.model && !data.chassi) {
      return { ok: false, error: "Nenhum dado encontrado para esta placa." };
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: "Não foi possível consultar a placa agora. Verifique a conexão e tente novamente.",
    };
  }
}
