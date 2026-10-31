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

/**
 * Planos à venda. O sistema é o mesmo; muda a franquia de leituras automáticas
 * de documento (IA) incluída por mês. O anúncio usa estes valores — mudou
 * aqui, mude lá também.
 */
export type PlanoId = "ESSENCIAL" | "COMPLETO";
export type Plano = { id: PlanoId; nome: string; preco: number; leituras: number; destaque?: boolean };
export const PLANOS: readonly Plano[] = [
  { id: "ESSENCIAL", nome: "Essencial", preco: 399, leituras: 150 },
  { id: "COMPLETO", nome: "Completo", preco: 599, leituras: 500, destaque: true },
];

export function planoPorId(id: string | null | undefined): Plano | undefined {
  return PLANOS.find((p) => p.id === id);
}

/** Para onde vão os pedidos de cadastro — e o contato mostrado na página. */
export function emailComercial(): string {
  return (process.env.FINCORE_EMAIL_COMERCIAL || "marcotuliomvp@hotmail.com").trim();
}

/** Prazo de análise do cadastro prometido ao lojista (dias corridos). */
export const DIAS_ANALISE = 3;

/** Cada leitura acima da franquia, em reais. */
export const PRECO_LEITURA_EXCEDENTE = 0.4;

/** Taxa de implantação (pagamento único), em reais. */
export const TAXA_IMPLANTACAO = 790;

/**
 * Lançamento: implantação grátis para pedidos enviados até esta data (fim do
 * dia, horário de Brasília). Depois dela a página volta sozinha a cobrar a
 * taxa — o anúncio no Google precisa ser trocado à mão.
 */
export const IMPLANTACAO_GRATIS_ATE = "15/11/2026";
const FIM_PROMOCAO = new Date("2026-11-16T03:00:00Z");

export function implantacaoGratis(em: Date = new Date()): boolean {
  return em.getTime() < FIM_PROMOCAO.getTime();
}
