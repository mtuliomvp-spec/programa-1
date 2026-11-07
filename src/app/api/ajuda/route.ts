import Anthropic from "@anthropic-ai/sdk";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getParecerConfig } from "@/lib/parecer-ia";
import { recordAiUsage } from "@/lib/ai-usage";
import { erroDaIa } from "@/lib/ai-errors";
import { getCompany } from "@/lib/company";
import { nomeDaLoja } from "@/lib/nome-loja";
import { contextoDoUsuario, historicoSeguro, instrucoesDoAssistente } from "@/lib/ajuda-chat";
import { executarFerramenta, ferramentasDoUsuario, rotuloDaFerramenta } from "@/lib/ajuda-ferramentas";

export const dynamic = "force-dynamic";

const erro = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });

/** Linha de STATUS no meio do texto ("consultando…"): o chat mostra e descarta. */
const STATUS = "\u001e";

/** Rodadas de consulta por pergunta (evita laço sem fim). */
const MAX_RODADAS = 5;

/**
 * Chat de ajuda: recebe a conversa e devolve a resposta do assistente em
 * TEXTO CORRIDO, aos pedaços (stream). Quando precisa de dados, o assistente
 * chama as consultas permitidas a este usuário e segue respondendo.
 * Usa a mesma chave/provedor da IA da loja (Parâmetros › Parecer IA).
 * Cada pergunta e resposta fica registrada para o administrador.
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
  const pergunta = messages[messages.length - 1].content;

  const config = await getParecerConfig();
  if (!config.apiKey) {
    return erro(503, "O assistente ainda não está configurado: falta a chave da IA em Parâmetros › Parecer IA.");
  }
  const company = await getCompany().catch(() => null);
  const instrucoes = instrucoesDoAssistente(nomeDaLoja(company));
  const contexto = contextoDoUsuario(user, pagina);

  const registrar = (resposta: string, ferramentas: string[], ok: boolean) =>
    prisma.chatAjudaPergunta
      .create({
        data: {
          userId: user.id,
          userName: user.name,
          pergunta: pergunta.slice(0, 4000),
          resposta: resposta.slice(0, 20000),
          pagina,
          ferramentas,
          ok,
        },
      })
      .catch((e) => console.error("[chat-ajuda] registrar", e));

  // OpenAI: sem stream e sem consultas (a resposta chega inteira de uma vez).
  if (config.provider === "OPENAI") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `${instrucoes}\n\n## Contexto\n${contexto}\n\n(Nesta instalação as consultas aos dados não estão disponíveis: indique a tela.)`,
          },
          ...messages,
        ],
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
    const resposta = json.choices?.[0]?.message?.content ?? "";
    await registrar(resposta, [], !!resposta);
    return new Response(resposta, {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const client = new Anthropic({ apiKey: config.apiKey, maxRetries: 2 });
  const tools = ferramentasDoUsuario(user);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let resposta = "";
      const usadas: string[] = [];
      let ok = true;
      const conversa: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
      try {
        for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
          const ultima = rodada === MAX_RODADAS - 1;
          const s = client.messages.stream({
            model: config.model,
            max_tokens: 1500,
            // O material é grande e igual para todos: fica em cache na IA
            // (pago ~10% nas perguntas seguintes). O contexto vem depois.
            system: [
              { type: "text", text: instrucoes, cache_control: { type: "ephemeral" } },
              { type: "text", text: `## Contexto\n${contexto}\nHoje: ${new Date().toISOString().slice(0, 10)}` },
            ],
            // Na última rodada, sem consultas: força a resposta final.
            ...(tools.length && !ultima ? { tools } : {}),
            messages: conversa,
          });
          for await (const ev of s) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
              resposta += ev.delta.text;
              controller.enqueue(encoder.encode(ev.delta.text));
            }
          }
          const final = await s.finalMessage();
          await recordAiUsage({ feature: "ajuda", provider: config.provider, model: config.model, usage: final.usage });
          const pedidos = final.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
          if (final.stop_reason !== "tool_use" || !pedidos.length) break;

          controller.enqueue(
            encoder.encode(`${STATUS}Consultando ${[...new Set(pedidos.map((p) => rotuloDaFerramenta(p.name)))].join(", ")}…\n`),
          );
          const resultados: Anthropic.ToolResultBlockParam[] = [];
          for (const p of pedidos) {
            usadas.push(p.name);
            resultados.push({
              type: "tool_result",
              tool_use_id: p.id,
              content: await executarFerramenta(user, p.name, p.input),
            });
          }
          conversa.push({ role: "assistant", content: final.content });
          conversa.push({ role: "user", content: resultados });
        }
      } catch (e) {
        ok = false;
        await recordAiUsage({
          feature: "ajuda",
          provider: config.provider,
          model: config.model,
          ok: false,
          errorMessage: e instanceof Error ? e.message.slice(0, 300) : "erro",
        });
        const msg = `\n\n⚠️ ${erroDaIa(e).message}`;
        resposta += msg;
        controller.enqueue(encoder.encode(msg));
      } finally {
        await registrar(resposta, [...new Set(usadas)], ok && resposta.trim() !== "");
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
