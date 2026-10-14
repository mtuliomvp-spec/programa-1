import "server-only";

/**
 * Cliente da API v2 da Focus NFe (https://doc.focusnfe.com.br).
 *
 * Autenticação HTTP Basic: usuário = token da empresa, senha em branco. Os
 * tokens ficam em variáveis de ambiente — FOCUS_NFE_TOKEN_HOMOLOGACAO e
 * FOCUS_NFE_TOKEN_PRODUCAO —, nunca no banco. Sem a variável, a chamada sai sem
 * cabeçalho (num ambiente cujo proxy injeta a credencial, isso basta; fora
 * dele a Focus responde 401 e o erro aparece na tela).
 */

export type Ambiente = "HOMOLOGACAO" | "PRODUCAO";

const BASE: Record<Ambiente, string> = {
  HOMOLOGACAO: "https://homologacao.focusnfe.com.br",
  PRODUCAO: "https://api.focusnfe.com.br",
};

function token(ambiente: Ambiente): string | undefined {
  const v = ambiente === "PRODUCAO" ? process.env.FOCUS_NFE_TOKEN_PRODUCAO : process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO;
  return v?.trim() || undefined;
}

function headers(ambiente: Ambiente, json = false): Record<string, string> {
  const h: Record<string, string> = {};
  const t = token(ambiente);
  if (t) h.Authorization = `Basic ${Buffer.from(`${t}:`).toString("base64")}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/** Resposta da Focus para emissão/consulta (campos que usamos). */
export type FocusNfe = {
  status?: string; // processando_autorizacao | autorizado | erro_autorizacao | cancelado | denegado
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  protocolo?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  caminho_xml_cancelamento?: string;
  // Erros de requisição (4xx)
  codigo?: string;
  mensagem?: string;
  erros?: { mensagem?: string; campo?: string }[];
};

export type FocusResultado = { http: number; body: FocusNfe };

async function chamar(ambiente: Ambiente, path: string, init: RequestInit): Promise<FocusResultado> {
  let res: Response;
  try {
    res = await fetch(`${BASE[ambiente]}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return { http: 0, body: { codigo: "sem_conexao", mensagem: "Não foi possível falar com a Focus NFe agora." } };
  }
  const texto = await res.text();
  let body: FocusNfe;
  try {
    body = JSON.parse(texto) as FocusNfe;
  } catch {
    body =
      res.status === 401
        ? { codigo: "nao_autorizado", mensagem: "Token da Focus NFe ausente ou inválido para este ambiente." }
        : { codigo: "resposta_invalida", mensagem: texto.slice(0, 300) || `HTTP ${res.status}` };
  }
  return { http: res.status, body };
}

export function emitirNfe(ambiente: Ambiente, ref: string, payload: unknown) {
  return chamar(ambiente, `/v2/nfe?ref=${encodeURIComponent(ref)}`, {
    method: "POST",
    headers: headers(ambiente, true),
    body: JSON.stringify(payload),
  });
}

export function consultarNfe(ambiente: Ambiente, ref: string) {
  return chamar(ambiente, `/v2/nfe/${encodeURIComponent(ref)}?completa=0`, {
    method: "GET",
    headers: headers(ambiente),
  });
}

export function cancelarNfe(ambiente: Ambiente, ref: string, justificativa: string) {
  return chamar(ambiente, `/v2/nfe/${encodeURIComponent(ref)}`, {
    method: "DELETE",
    headers: headers(ambiente, true),
    body: JSON.stringify({ justificativa }),
  });
}

/** Resposta da Focus para NFS-e nacional (campos que usamos). */
export type FocusNfse = {
  status?: string; // processando_autorizacao | autorizado | erro_autorizacao | cancelado | negado
  numero?: string;
  codigo_verificacao?: string;
  url?: string;
  url_danfse?: string;
  caminho_xml_nota_fiscal?: string;
  codigo?: string;
  mensagem?: string;
  erros?: { codigo?: string; mensagem?: string; correcao?: string }[];
};

export async function emitirNfsen(ambiente: Ambiente, ref: string, payload: unknown) {
  return (await chamar(ambiente, `/v2/nfsen?ref=${encodeURIComponent(ref)}`, {
    method: "POST",
    headers: headers(ambiente, true),
    body: JSON.stringify(payload),
  })) as { http: number; body: FocusNfse };
}

export async function consultarNfsen(ambiente: Ambiente, ref: string) {
  return (await chamar(ambiente, `/v2/nfsen/${encodeURIComponent(ref)}`, {
    method: "GET",
    headers: headers(ambiente),
  })) as { http: number; body: FocusNfse };
}

export async function cancelarNfsen(ambiente: Ambiente, ref: string, justificativa: string) {
  return (await chamar(ambiente, `/v2/nfsen/${encodeURIComponent(ref)}`, {
    method: "DELETE",
    headers: headers(ambiente, true),
    body: JSON.stringify({ justificativa }),
  })) as { http: number; body: FocusNfse };
}

export function mensagemErroNfse(body: FocusNfse): string {
  const base = body.mensagem || "Erro na emissão da NFS-e.";
  const det = (body.erros ?? []).map((e) => [e.codigo, e.mensagem, e.correcao].filter(Boolean).join(" — "));
  return det.length ? det.join("; ") : base;
}

/** URL absoluta (DANFSe) só da própria Focus/portal nacional; caminho relativo vai pela base do ambiente. */
export async function baixarUrl(ambiente: Ambiente, urlOuCaminho: string): Promise<Response | null> {
  if (urlOuCaminho.startsWith("/")) return baixarArquivo(ambiente, urlOuCaminho);
  try {
    const u = new URL(urlOuCaminho);
    if (u.protocol !== "https:" || !/(^|\.)(focusnfe\.com\.br|nfse\.gov\.br)$/.test(u.hostname)) return null;
    // O token só vai para a própria Focus — nunca para o portal do governo.
    const daFocus = /(^|\.)focusnfe\.com\.br$/.test(u.hostname);
    const res = await fetch(u, {
      headers: daFocus ? headers(ambiente) : {},
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** Baixa um arquivo da nota (XML/DANFE) pelo caminho devolvido na consulta. */
export async function baixarArquivo(ambiente: Ambiente, caminho: string): Promise<Response | null> {
  if (!caminho.startsWith("/")) return null;
  try {
    const res = await fetch(`${BASE[ambiente]}${caminho}`, {
      headers: headers(ambiente),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** Mensagem legível de um erro da Focus (validação lista campo a campo). */
export function mensagemDeErro(body: FocusNfe): string {
  const base = body.mensagem_sefaz || body.mensagem || "Erro desconhecido na emissão.";
  const detalhes = (body.erros ?? [])
    .map((e) => [e.campo, e.mensagem].filter(Boolean).join(": "))
    .filter(Boolean);
  return detalhes.length ? `${base} — ${detalhes.join("; ")}` : base;
}
