import { isDemoMode } from "@/lib/demo-mode";

/**
 * Página pública de venda do Fincore360 (/assinar): é o destino do anúncio do
 * sistema no Google. Só existe na instalação de DEMONSTRAÇÃO — ou onde a
 * variável PAGINA_ASSINATURA estiver ligada —, nunca no site de uma loja
 * cliente (lá a vitrine é dos carros dela).
 *
 * Arquivo puro (sem `server-only`): lido por páginas, actions e pelo proxy.
 */
export function paginaAssinaturaAtiva(): boolean {
  const v = (process.env.PAGINA_ASSINATURA || "").trim().toLowerCase();
  return isDemoMode() || v === "1" || v === "true" || v === "sim" || v === "on";
}

/** Mensalidade anunciada, em reais. */
export const PRECO_MENSAL = Number(process.env.FINCORE_PRECO_MENSAL) || 399;

/** Para onde vão os pedidos de cadastro — e o contato mostrado na página. */
export function emailComercial(): string {
  return (process.env.FINCORE_EMAIL_COMERCIAL || "marcotuliomvp@hotmail.com").trim();
}

/** Prazo de análise do cadastro prometido ao lojista (dias corridos). */
export const DIAS_ANALISE = 3;

/** Leituras automáticas de documento (IA) incluídas na mensalidade. */
export const FRANQUIA_LEITURAS = 500;

/** Cada leitura acima da franquia, em reais. */
export const PRECO_LEITURA_EXCEDENTE = 0.4;

/** Taxa de implantação (pagamento único), em reais. */
export const TAXA_IMPLANTACAO = 790;
