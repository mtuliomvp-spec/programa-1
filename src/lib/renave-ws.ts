import "server-only";
import https from "node:https";
import type { RenaveAmbiente } from "@/lib/renave-ws-dados";

/**
 * Cliente do Renave-WS (API do SERPRO para concessionárias e revendas).
 *
 * Autenticação: SSL de mão dupla — a loja apresenta o certificado e-CNPJ A1
 * habilitado no Credencia; não há token. O certificado (arquivo .pfx/.p12 em
 * base64) e a senha ficam SÓ em variáveis de ambiente da instalação:
 *   RENAVE_CERT_PFX_BASE64 / RENAVE_CERT_SENHA            → produção
 *   RENAVE_CERT_HOMOLOGACAO_PFX_BASE64 / …_SENHA (opcional) → homologação
 * Nunca no banco, em log ou na tela. Em homologação, sem certificado, o
 * SERPRO atende como o "Estabelecimento padrão de teste".
 *
 * Tempo: o manual pede para considerar sem resposta só depois de 2 min (POST)
 * e 1 min (GET) — o Renave fala com o Renavam e com o Detran — e para não
 * reenviar enquanto a anterior não volta ("rajadas").
 */

const BASE: Record<RenaveAmbiente, string> = {
  HOMOLOGACAO: "https://hom.renave.estaleiro.serpro.gov.br/renave-ws",
  PRODUCAO: "https://renave.estaleiro.serpro.gov.br/renave-ws",
};

function certificado(ambiente: RenaveAmbiente): { pfx: Buffer; passphrase: string } | null {
  const pfx =
    ambiente === "PRODUCAO" ? process.env.RENAVE_CERT_PFX_BASE64 : process.env.RENAVE_CERT_HOMOLOGACAO_PFX_BASE64;
  const senha = ambiente === "PRODUCAO" ? process.env.RENAVE_CERT_SENHA : process.env.RENAVE_CERT_HOMOLOGACAO_SENHA;
  if (!pfx?.trim()) return null;
  return { pfx: Buffer.from(pfx.replace(/\s+/g, ""), "base64"), passphrase: senha ?? "" };
}

/** Produção só funciona com o certificado configurado na instalação. */
export function certificadoConfigurado(ambiente: RenaveAmbiente): boolean {
  return !!certificado(ambiente);
}

export type RenaveResposta<T = unknown> = {
  http: number;
  ok: boolean;
  body: T | null;
  /** Mensagem pronta para a tela quando !ok. */
  erro: string | null;
  /** Sem resposta no prazo: a operação pode ter sido feita — sincronize antes de repetir. */
  semResposta?: boolean;
};

type ErroRenave = { titulo?: string; detalhe?: string; mensagemParaUsuarioFinal?: string | null; logIdRastreabilidade?: string };

function mensagemErro(http: number, body: unknown, texto: string): string {
  const e = (body ?? {}) as ErroRenave;
  const msg = e.mensagemParaUsuarioFinal || e.detalhe || e.titulo;
  if (msg) return e.logIdRastreabilidade ? `${msg} (rastreio SERPRO: ${e.logIdRastreabilidade})` : msg;
  if (http === 401 || http === 403)
    return "O Renave recusou o certificado: confira se o e-CNPJ A1 está configurado na instalação e habilitado no Credencia (serviço RENAVE CONCESSIONÁRIO/LOJISTA).";
  if (http === 502 || http === 503 || http === 504) return "O Renave está indisponível agora. Tente de novo em alguns minutos.";
  return texto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || `Erro HTTP ${http} no Renave.`;
}

function chamar<T>(ambiente: RenaveAmbiente, metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<RenaveResposta<T>> {
  const url = new URL(`${BASE[ambiente]}${caminho}`);
  const cert = certificado(ambiente);
  if (ambiente === "PRODUCAO" && !cert) {
    return Promise.resolve({
      http: 0,
      ok: false,
      body: null,
      erro: "Certificado e-CNPJ do Renave não configurado na instalação (variáveis RENAVE_CERT_PFX_BASE64 e RENAVE_CERT_SENHA).",
    });
  }
  const dados = corpo === undefined ? undefined : Buffer.from(JSON.stringify(corpo));
  const limite = metodo === "POST" ? 120_000 : 60_000;
  return new Promise((resolve) => {
    let fim = false;
    const terminar = (r: RenaveResposta<T>) => {
      if (!fim) {
        fim = true;
        resolve(r);
      }
    };
    let req: ReturnType<typeof https.request>;
    try {
      req = https.request(
        url,
        {
          method: metodo,
          headers: {
            Accept: "application/json",
            ...(dados ? { "Content-Type": "application/json;charset=UTF-8", "Content-Length": dados.length } : {}),
          },
          ...(cert ? { pfx: cert.pfx, passphrase: cert.passphrase } : {}),
          timeout: limite,
        },
        (res) => {
          const partes: Buffer[] = [];
          res.on("data", (c: Buffer) => partes.push(c));
          res.on("end", () => {
            const texto = Buffer.concat(partes).toString("utf8");
            const http = res.statusCode ?? 0;
            let body: unknown = null;
            try {
              body = texto ? JSON.parse(texto) : null;
            } catch {
              body = null;
            }
            const ok = http >= 200 && http < 300;
            terminar({ http, ok, body: ok ? (body as T) : null, erro: ok ? null : mensagemErro(http, body, texto) });
          });
          res.on("error", () =>
            terminar({ http: 0, ok: false, body: null, erro: "A conexão com o Renave caiu no meio da resposta.", semResposta: true }),
          );
        },
      );
    } catch {
      terminar({
        http: 0,
        ok: false,
        body: null,
        erro: "Não foi possível abrir a conexão com o Renave — confira o certificado (arquivo e senha).",
      });
      return;
    }
    req.on("timeout", () => {
      req.destroy();
      terminar({
        http: 0,
        ok: false,
        body: null,
        erro: `O Renave não respondeu em ${limite / 60000} min. A operação pode ter sido registrada: use “Atualizar do Renave” antes de tentar de novo.`,
        semResposta: metodo === "POST",
      });
    });
    req.on("error", (e: NodeJS.ErrnoException) => {
      const certErro = /mac verify|pkcs12|PFX|bad decrypt|unsupported/i.test(e.message);
      terminar({
        http: 0,
        ok: false,
        body: null,
        erro: certErro
          ? "Certificado do Renave inválido ou senha incorreta (variáveis da instalação)."
          : "Não foi possível falar com o Renave agora.",
        semResposta: metodo === "POST" && !certErro,
      });
    });
    if (dados) req.write(dados);
    req.end();
  });
}

const q = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};
const seg = encodeURIComponent;

// --- Tipos das respostas (o que o sistema usa) ------------------------------

export type EstoqueRenave = {
  id: number;
  estado: string;
  placa: string;
  renavam: string;
  chassi?: string;
  tipoCrv?: string;
  numeroCrv?: string;
  codigoSegurancaCrv?: string;
  quilometragemHodometro?: number;
  entradaEstoque?: {
    dataHora?: string;
    dataHoraRegistro?: string;
    chaveNotaFiscalEntrada?: string | null;
    numeroTermoEntradaEstoque?: number;
    vendedor?: { tipoDocumento?: string; numeroDocumento?: string } | null;
  } | null;
  saidaEstoque?: {
    dataHora?: string;
    dataHoraRegistro?: string;
    chaveNotaFiscalSaida?: string | null;
    numeroTermoSaidaEstoque?: number;
    comprador?: { tipoDocumento?: string; numeroDocumento?: string; nome?: string } | null;
    cancelamentoSaidaEstoque?: unknown;
  } | null;
  cancelamentoEstoque?: { dataHoraCancelamentoEstoque?: string; motivoCancelamentoEstoque?: string } | null;
  restricoesVeiculo?: { codigoTipoRestricao?: string; tipoRestricao?: string }[] | null;
};

export type MockVeiculoUsado = { placa: string; chassi: string; renavam: string; codigoSegurancaCrv: string; numeroCrv: string };
/** Cada operação devolve o PDF num campo "…Base64" com nome próprio. */
export type PdfBase64 = { numeroAtpv?: string; xmlAtpvBase64?: string } & Record<string, unknown>;
export type MunicipioRenave = { id: string; nome: string; uf: string };

// --- Operações ---------------------------------------------------------------

export const renaveWs = {
  clienteAutenticado: (a: RenaveAmbiente) =>
    chamar<{ cnpj: string; nome: string; endereco?: { municipio?: MunicipioRenave } }>(a, "GET", "/api/cliente-autenticado"),

  aptidao: (a: RenaveAmbiente, v: { placa: string; renavam: string; tipoCrv: string; numeroCrv: string }) =>
    chamar(a, "GET", `/api/aptidao-veiculo-estoque${q(v)}`),

  entrada: (a: RenaveAmbiente, payload: unknown) => chamar<EstoqueRenave>(a, "POST", "/api/solicitacoes-entrada-estoque", payload),

  entradaProprio: (a: RenaveAmbiente, payload: unknown) =>
    chamar<EstoqueRenave>(a, "POST", "/api/solicitacoes-entrada-estoque-veiculo-proprio", payload),

  assinaturaVendedor: (a: RenaveAmbiente, payload: unknown) => chamar(a, "POST", "/api/atpv-assinatura-vendedor", payload),

  notaFiscal: (a: RenaveAmbiente, idEstoque: number, evento: "COMPRA" | "VENDA", chaveNotaFiscal: string) =>
    chamar(a, "POST", "/api/notas-fiscais", { idEstoque, evento, chaveNotaFiscal }),

  saida: (a: RenaveAmbiente, payload: unknown) => chamar<EstoqueRenave>(a, "POST", "/api/solicitacoes-saida-estoque", payload),

  cancelarEntrada: (a: RenaveAmbiente, payload: unknown) =>
    chamar<EstoqueRenave>(a, "POST", "/api/solicitacoes-cancelamento-estoque", payload),

  cancelarSaida: (a: RenaveAmbiente, payload: { idEstoque: number; dataCancelamentoSaidaEstoque: string; cpfOperadorResponsavel: string }) =>
    chamar<EstoqueRenave>(a, "POST", "/api/solicitacoes-cancelamento-saida-estoque", payload),

  estoque: (a: RenaveAmbiente, id: number) => chamar<EstoqueRenave>(a, "GET", `/api/estoques/${id}`),

  estoques: (a: RenaveAmbiente, f: { placa?: string; chassi?: string; estadoEstoque?: string }) =>
    chamar<EstoqueRenave[]>(a, "GET", `/api/estoques${q(f)}`),

  pdfAtpv: (a: RenaveAmbiente, placa: string, renavam: string) =>
    chamar<PdfBase64>(a, "GET", `/api/pdf-atpv/${seg(placa)}/${seg(renavam)}`),

  pdfCodigoSegurancaCrv: (a: RenaveAmbiente, placa: string, renavam: string) =>
    chamar<PdfBase64>(a, "GET", `/api/crlve/${seg(placa)}/${seg(renavam)}/pdf-codigo-seguranca-crv`),

  crlve: (a: RenaveAmbiente, placa: string, renavam: string) =>
    chamar<PdfBase64>(a, "GET", `/api/crlve/${seg(placa)}/${seg(renavam)}`),

  termoEntrada: (a: RenaveAmbiente, idEstoque: number) =>
    chamar<PdfBase64>(a, "GET", `/api/estoques/${idEstoque}/termo-entrada-estoque`),

  termoSaida: (a: RenaveAmbiente, idEstoque: number) =>
    chamar<PdfBase64>(a, "GET", `/api/estoques/${idEstoque}/termo-saida-estoque`),

  municipios: (a: RenaveAmbiente, uf: string, nome?: string) =>
    chamar<MunicipioRenave[]>(a, "GET", `/api/municipios${q({ uf, nome })}`),

  // Só em homologação: veículo de teste e a "transferência no Detran" simulada.
  criarMockUsado: (
    a: RenaveAmbiente,
    v: { documentoProprietario: string; nomeProprietario: string; sufixoPlaca: string; ufJurisdicaoVeiculo: string },
  ) => chamar<MockVeiculoUsado>(a, "POST", "/api/veiculos-usados-mock", v),

  transferirMockNoDetran: (a: RenaveAmbiente, placa: string) =>
    chamar(a, "POST", "/api/veiculos-usados-mock/transferencia-no-detran", { placa }),
};

/**
 * O PDF de uma resposta: o primeiro campo "…Base64" que decodifica em PDF
 * (pdfBase64, pdfAtpvBase64, pdfCodigoSegurancaCrvBase64…).
 */
export function pdfDaResposta(body: PdfBase64 | null): Buffer | null {
  for (const [k, v] of Object.entries(body ?? {})) {
    if (!/base64$/i.test(k) || typeof v !== "string" || !v) continue;
    const buf = Buffer.from(v, "base64");
    if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return buf;
  }
  return null;
}
