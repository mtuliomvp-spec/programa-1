import "server-only";

/**
 * Consulta de débitos veiculares (IPVA, multas, licenciamento) pela
 * placa, no mesmo provedor da consulta cadastral (wdapi2 / API Placas).
 *
 * Estratégia (igual ao Agrasty):
 * 1. tenta o payload da consulta cadastral (/consulta/) — alguns planos
 *    já incluem os arrays `debitos` e `multas`;
 * 2. se vazio, tenta o endpoint dedicado /debitos/ (adicional do plano).
 *
 * Se o plano não incluir débitos, devolvemos uma mensagem amigável —
 * o restante do fluxo fica pronto para quando o adicional for ativado.
 */

export type VehicleDebt = {
  category: "IPVA" | "MULTA" | "LICENCIAMENTO";
  description: string;
  amount: number;
  dueDate: string; // ISO yyyy-mm-dd
};

export type DebtsLookupResult =
  | { ok: true; debts: VehicleDebt[] }
  | { ok: false; error: string; notConfigured?: boolean };

const DEFAULT_CONSULTA = "https://wdapi2.com.br/consulta/{placa}/{token}";
const DEFAULT_DEBITOS = "https://wdapi2.com.br/debitos/{placa}/{token}";

function parseValorBRL(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const s = String(value).replace(/[^\d,.-]/g, "").trim();
  if (!s) return 0;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = parseFloat(norm);
  return Number.isFinite(n) ? n : 0;
}

function parseDataISO(value: unknown): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function extractArrays(payload: Record<string, unknown>): {
  debitos: Record<string, unknown>[];
  multas: Record<string, unknown>[];
} {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = payload[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
    return [];
  };
  return {
    debitos: pick("debitos", "Debitos", "debito", "dividas"),
    multas: pick("multas", "Multas", "infracoes"),
  };
}

function normalize(
  debitos: Record<string, unknown>[],
  multas: Record<string, unknown>[],
): VehicleDebt[] {
  const today = new Date().toISOString().slice(0, 10);
  const results: VehicleDebt[] = [];

  for (const deb of debitos) {
    const amount = parseValorBRL(deb.valor ?? deb.valor_total ?? deb.saldo ?? deb.total);
    if (amount <= 0) continue;
    const raw = String(deb.descricao || deb.tipo || deb.categoria || "").trim();
    const exercicio = String(deb.exercicio || deb.ano || deb.ano_exercicio || "").trim();
    const lower = raw.toLowerCase();

    let category: VehicleDebt["category"] = "IPVA";
    let description = raw || "Débito";
    if (lower.includes("licenc")) {
      category = "LICENCIAMENTO";
      description = `Licenciamento ${exercicio}`.trim();
    } else if (lower.includes("multa") || lower.includes("infra")) {
      category = "MULTA";
    } else if (lower.includes("ipva")) {
      description = `IPVA ${exercicio}`.trim();
    } else if (exercicio) {
      description = `${raw} ${exercicio}`.trim();
    }

    results.push({
      category,
      description,
      amount,
      dueDate: parseDataISO(deb.data_vencimento || deb.vencimento || deb.data) || today,
    });
  }

  for (const multa of multas) {
    const amount = parseValorBRL(multa.valor ?? multa.valor_total ?? multa.saldo);
    if (amount <= 0) continue;
    const description =
      String(multa.descricao || multa.infracao || multa.orgao || "Multa de trânsito").trim();
    results.push({
      category: "MULTA",
      description,
      amount,
      dueDate: parseDataISO(multa.data_vencimento || multa.vencimento || multa.data) || today,
    });
  }

  return results;
}

export async function lookupVehicleDebts(plateInput: string): Promise<DebtsLookupResult> {
  const plate = plateInput.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) {
    return { ok: false, error: "Placa inválida." };
  }

  const token = process.env.PLACA_API_TOKEN;
  if (!token) {
    return {
      ok: false,
      notConfigured: true,
      error:
        "Consulta por placa não configurada. Defina PLACA_API_TOKEN na Vercel (o mesmo token do wdapi2/API Placas).",
    };
  }

  const build = (template: string) =>
    template.replace("{placa}", plate).replace("{token}", token);

  const fetchJson = async (url: string): Promise<Record<string, unknown> | null> => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000), cache: "no-store" });
      const text = await response.text();
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        if (!response.ok || json.error || json.erro) return null;
        return json;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  };

  // 1) payload da consulta cadastral
  const consulta = await fetchJson(build(process.env.PLACA_API_URL || DEFAULT_CONSULTA));
  let arrays = consulta ? extractArrays(consulta) : { debitos: [], multas: [] };

  // 2) fallback: endpoint dedicado de débitos
  if (arrays.debitos.length === 0 && arrays.multas.length === 0) {
    const debitos = await fetchJson(build(process.env.PLACA_DEBITOS_URL || DEFAULT_DEBITOS));
    if (debitos) arrays = extractArrays(debitos);
  }

  const debts = normalize(arrays.debitos, arrays.multas);
  if (debts.length === 0) {
    return {
      ok: false,
      error:
        "Nenhum débito retornado para esta placa. Ou o veículo está em dia, ou o seu plano da API ainda não inclui o adicional de débitos — assim que incluir, esta consulta passa a funcionar sozinha.",
    };
  }

  return { ok: true, debts };
}
