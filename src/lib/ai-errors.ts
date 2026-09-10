import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Traduz o erro de uma chamada à IA para uma frase que diz O QUE FAZER.
 *
 * Todo leitor (boleto, comprovante, NF, CRLV, contrato, fatura, ATPV) chamava
 * a API e repetia o mesmo `catch`. O que sobrava sem tradução ia para a tela
 * como JSON cru — foi assim que "sua conta está sem créditos" virou
 * `400 {"type":"error","error":{"type":"invalid_request_error",...}}` na cara
 * de quem só queria importar uma nota.
 *
 * Devolve o Error pronto para lançar (em vez de lançar), para o chamador
 * decidir se lança ou embrulha.
 */
export function erroDaIa(e: unknown): Error {
  if (e instanceof Anthropic.AuthenticationError) {
    return new Error("Chave de IA inválida. Confira nos Parâmetros.");
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new Error("Limite de uso da IA excedido. Aguarde alguns minutos e tente de novo.");
  }

  const texto = e instanceof Anthropic.APIError ? e.message || "" : "";

  // SEM CRÉDITOS: a Anthropic recusa como 400 (pedido inválido), então sem
  // este ramo o usuário via o JSON cru e achava que o erro era no arquivo.
  // Não é a chave (ela é válida) nem o documento: é saldo.
  if (/credit balance is too low|purchase credits|insufficient credits?/i.test(texto)) {
    return new Error(
      "A IA está sem créditos. A conta da Anthropic dona da chave precisa de recarga: entre em console.anthropic.com com ela, vá em Plans & Billing e compre créditos (ou ligue a recarga automática). Não é nada com o seu arquivo — assim que o saldo entrar, funciona de novo.",
    );
  }

  // Sobrecarga passageira do provedor (529 "overloaded" e afins): não é o
  // arquivo nem a chave — repetir em instantes resolve.
  if (e instanceof Anthropic.APIError && (Number(e.status) >= 500 || /overloaded/i.test(texto))) {
    return new Error(
      "Os servidores da IA estão sobrecarregados neste momento — não é nada com o seu arquivo. Aguarde um minuto e tente de novo.",
    );
  }

  if (e instanceof Anthropic.APIError) {
    // Inclui o detalhe da API: sem ele, um 400 (pedido recusado) vira
    // adivinhação — o número sozinho não diz o que precisa ser corrigido.
    const detalhe = texto.replace(/\s+/g, " ").trim().slice(0, 300);
    return new Error(
      `A IA recusou o pedido (${e.status})${detalhe ? `: ${detalhe}` : "."} Tente novamente.`,
    );
  }

  return e instanceof Error ? e : new Error(String(e));
}
