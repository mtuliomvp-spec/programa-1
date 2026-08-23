import { ALL_PERMISSIONS } from "@/lib/permissions";

/**
 * Transporte de perfis de acesso entre instalações.
 *
 * Cada loja roda em um banco próprio, então os perfis criados numa instalação
 * não existem na outra. Aqui está o formato do arquivo que a tela de Perfis
 * exporta e importa — é assim que o fornecedor leva os mesmos perfis do
 * sistema em produção para a demonstração e para cada instalação nova.
 */

export const PROFILE_FILE_FORMAT = "fincore360.perfis";
export const PROFILE_FILE_VERSION = 1;

export type PerfilTransportado = { nome: string; permissoes: string[] };

export type ArquivoDePerfis = {
  formato: typeof PROFILE_FILE_FORMAT;
  versao: number;
  exportadoEm: string;
  perfis: PerfilTransportado[];
};

export function montarArquivoDePerfis(
  perfis: { name: string; permissions: string[] }[],
): ArquivoDePerfis {
  return {
    formato: PROFILE_FILE_FORMAT,
    versao: PROFILE_FILE_VERSION,
    exportadoEm: new Date().toISOString(),
    perfis: perfis.map((p) => ({ nome: p.name, permissoes: [...p.permissions].sort() })),
  };
}

export type LeituraDePerfis =
  | { ok: true; perfis: PerfilTransportado[]; permissoesIgnoradas: number }
  | { ok: false; error: string };

const VALIDAS = new Set(ALL_PERMISSIONS);

function comoLista(dados: unknown): unknown[] | null {
  if (Array.isArray(dados)) return dados;
  if (dados && typeof dados === "object") {
    // "perfis" é o nosso export; "profiles" aceita também o backup completo do
    // sistema, para quem já tiver esse arquivo em mãos.
    const obj = dados as Record<string, unknown>;
    if (Array.isArray(obj.perfis)) return obj.perfis;
    if (Array.isArray(obj.profiles)) return obj.profiles;
  }
  return null;
}

/**
 * Lê o arquivo exportado. Descarta permissões que esta versão do sistema não
 * conhece (instalação mais antiga/nova) em vez de recusar o arquivo inteiro —
 * o que sobra continua valendo.
 */
export function lerArquivoDePerfis(texto: string): LeituraDePerfis {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, error: "O arquivo não é um export de perfis (não é um JSON válido)." };
  }

  const lista = comoLista(dados);
  if (!lista) return { ok: false, error: "O arquivo não tem uma lista de perfis." };

  const perfis: PerfilTransportado[] = [];
  const nomesUsados = new Set<string>();
  let permissoesIgnoradas = 0;

  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const nome = String(obj.nome ?? obj.name ?? "").trim();
    if (!nome) continue;
    const chave = nome.toLowerCase();
    if (nomesUsados.has(chave)) continue;

    const brutas = obj.permissoes ?? obj.permissions;
    const permissoes: string[] = [];
    if (Array.isArray(brutas)) {
      for (const p of brutas) {
        const perm = String(p);
        if (VALIDAS.has(perm)) {
          if (!permissoes.includes(perm)) permissoes.push(perm);
        } else {
          permissoesIgnoradas++;
        }
      }
    }

    nomesUsados.add(chave);
    perfis.push({ nome, permissoes });
  }

  if (perfis.length === 0) {
    return { ok: false, error: "Nenhum perfil encontrado no arquivo." };
  }
  return { ok: true, perfis, permissoesIgnoradas };
}
