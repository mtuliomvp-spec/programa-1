import "server-only";
import { GUIA } from "@/lib/guia/catalogo";
import { MANUAL_DO_SISTEMA } from "@/lib/ajuda-manual";
import { navGroupsFor } from "@/lib/nav";

/**
 * Chat de ajuda: um assistente que tira dúvidas de USO do sistema.
 *
 * O que ele sabe vem do próprio código, num lugar só:
 * - o manual do sistema (o mesmo texto do PDF entregue ao cliente, gerado por
 *   docs/geradores/gera_manual_texto.py) — o que cada tela faz e o passo a passo;
 * - o catálogo do Modo guia (src/lib/guia/catalogo.ts) — o que cada botão faz,
 *   o que precisa antes e o que acontece depois;
 * - o menu que ESTE usuário enxerga (com os endereços), para mandar só para
 *   telas que ele consegue abrir.
 *
 * Não lê dados da loja (saldos, títulos, clientes): só explica o sistema.
 */

/** O catálogo do Modo guia em texto corrido (é a "documentação" do assistente). */
function catalogoEmTexto(): string {
  return Object.entries(GUIA)
    .map(([id, g]) => {
      const linhas = [`### ${g.titulo} (${id})`, `O que faz: ${g.oQueFaz}`];
      if (g.precisa?.length) linhas.push(`Antes: ${g.precisa.join(" | ")}`);
      if (g.depois?.length) linhas.push(`Depois: ${g.depois.join(" | ")}`);
      if (g.conferir?.length) linhas.push(`Conferir em: ${g.conferir.map((c) => `${c.rotulo} (${c.href})`).join(", ")}`);
      return linhas.join("\n");
    })
    .join("\n\n");
}

// O catálogo é fixo por versão: montado uma vez (e cacheado também na IA).
let catalogoCache: string | null = null;

export function instrucoesDoAssistente(nomeLoja: string): string {
  catalogoCache ??= catalogoEmTexto();
  return [
    `Você é o assistente de ajuda do sistema de gestão da ${nomeLoja} (revenda de veículos seminovos).`,
    "Seu trabalho é tirar dúvidas de USO do sistema: onde fica cada coisa, como fazer cada rotina e o que acontece depois de cada botão.",
    "",
    "Regras:",
    "- Responda em português do Brasil, curto e direto, em passos numerados quando for um procedimento.",
    "- Baseie-se SOMENTE no material abaixo (manual, catálogo de botões e menu). Não invente telas, botões, campos nem regras.",
    "- Se o material não cobre a dúvida, diga com franqueza que não tem essa informação e sugira falar com o administrador do sistema.",
    "- Você NÃO vê os dados da loja (saldos, títulos, clientes, carros). Se pedirem um número ou um registro, explique em qual tela consultar.",
    "- Ao citar uma tela, use link em Markdown com o endereço do menu, por exemplo [Contas a pagar](/financeiro/a-pagar). Só use endereços que aparecem no menu do usuário ou no catálogo.",
    "- Se a tela necessária não está no menu do usuário, diga que ele não tem acesso e que o administrador pode liberar em Usuários.",
    "- Não dê orientação contábil, fiscal ou jurídica além do que o sistema faz; para isso, indique o contador.",
    "- Use **negrito** para nomes de botões. Não use tabelas nem títulos grandes.",
    "",
    "## Manual do sistema (tela por tela)",
    MANUAL_DO_SISTEMA,
    "",
    "## Catálogo de botões e rotinas (Modo guia)",
    catalogoCache,
  ].join("\n");
}

/** Contexto do usuário: o menu que ele enxerga e a tela em que está. */
export function contextoDoUsuario(
  user: { name: string; role: "ADMIN" | "OPERADOR" | "SUPER_ADMIN"; permissions: string[] },
  pagina: string | null,
): string {
  const menu = navGroupsFor(user)
    .map((g) => `${g.title}: ${g.items.map((i) => `${i.label} (${i.href})`).join("; ")}`)
    .join("\n");
  const perfil = user.role === "OPERADOR" ? "operador (acesso conforme o perfil)" : "administrador";
  return [
    `Usuário: ${user.name} — ${perfil}.`,
    pagina ? `Tela aberta agora: ${pagina}` : null,
    "Menu que este usuário enxerga:",
    menu || "(nenhuma tela liberada)",
  ]
    .filter(Boolean)
    .join("\n");
}

export type MensagemChat = { role: "user" | "assistant"; content: string };

/** Limpa o histórico vindo do navegador: papéis válidos, tamanho e quantidade. */
export function historicoSeguro(raw: unknown): MensagemChat[] {
  if (!Array.isArray(raw)) return [];
  const msgs = raw
    .filter(
      (m): m is MensagemChat =>
        !!m &&
        typeof m === "object" &&
        ((m as MensagemChat).role === "user" || (m as MensagemChat).role === "assistant") &&
        typeof (m as MensagemChat).content === "string" &&
        (m as MensagemChat).content.trim() !== "",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-16);
  // A conversa precisa começar pelo usuário e terminar com a pergunta dele.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  return msgs.length && msgs[msgs.length - 1].role === "user" ? msgs : [];
}
