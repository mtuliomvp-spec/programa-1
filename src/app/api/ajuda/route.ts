import Anthropic from "@anthropic-ai/sdk";
import { getSessionUser } from "@/lib/auth";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";
import { erroDaIa } from "@/lib/ai-errors";
import { getCompany } from "@/lib/company";
import { nomeDaLoja } from "@/lib/nome-loja";
import { contextoDoUsuario, historicoSeguro, instrucoesDoAssistente } from "@/lib/ajuda-chat";

export const dynamic = "force-dynamic";

const erro = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });

/**
 * Chat de ajuda: recebe a conversa e devolve a resposta do assistente em
 * TEXTO CORRIDO, aos pedaços (stream), para aparecer enquanto é escrita.
 * Usa a mesma chave/provedor da IA da loja (Parâmetros › Parecer IA).
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return erro(401, "Sessão expirada. Entre de novo no sistema.");

  let body: { messages?: unknown; pagina?: unknown };
  try {
    body = await request.json();
  } catch {
    return erro(400, "Pedido inválido.");
  }
  const messages = historicoSeguro(body.messages);
  if (!messages.length) return erro(400, "Escreva a sua dúvida.");
  const pagina = typeof body.pagina === "string" ? body.pagina.slice(0, 200) : null;

  const config = await getParecerConfig();
  if (!config.apiKey) {
    return erro(503, "O assistente ainda não está configurado: falta a chave da IA em Parâmetros › Parecer IA.");
  }
  const company = await getCompany().catch(() => null);
  const instrucoes = instrucoesDoAssistente(nomeDaLoja(company));
  const contexto = contextoDoUsuario(user, pagina);

  // OpenAI: sem stream (a resposta chega inteira de uma vez).
  if (config.provider === "OPENAI") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1024,
        messages: [{ role: "system", content: `${instrucoes}\n\n## Contexto\n${contexto}` }, ...messages],
      }),
    }).catch(() => null);
    if (!res || !res.ok) {
      return erro(502, res?.status === 401 ? "Chave de IA inválida. Confira nos Parâmetros." : "A IA não respondeu. Tente de novo.");
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    await recordAiUsage({
      feature: "ajuda",
      provider: config.provider,
      model: config.model,
      usage: { input_tokens: json.usage?.prompt_tokens, output_tokens: json.usage?.completion_tokens },
    });
    return new Response(json.choices?.[0]?.message?.content ?? "", {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 2 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const resposta = client.messages.stream({
          model: config.model,
          max_tokens: 1024,
          // O catálogo é grande e igual para todos: fica em cache na IA
          // (pago ~10% nas perguntas seguintes). O contexto do usuário vem depois.
          system: [
            { type: "text", text: instrucoes, cache_control: { type: "ephemeral" } },
            { type: "text", text: `## Contexto\n${contexto}` },
          ],
          messages,
        });
        for await (const ev of resposta) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(ev.delta.text));
          }
        }
        const final = await resposta.finalMessage();
        await recordAiUsage({ feature: "ajuda", provider: config.provider, model: config.model, usage: final.usage });
      } catch (e) {
        await recordAiUsage({
          feature: "ajuda",
          provider: config.provider,
          model: config.model,
          ok: false,
          errorMessage: e instanceof Error ? e.message.slice(0, 300) : "erro",
        });
        controller.enqueue(encoder.encode(`\n\n⚠️ ${erroDaIa(e).message}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
