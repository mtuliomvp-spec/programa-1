"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const CHAVE = "fincore.chatAjuda";
const SUGESTOES = [
  "Como faço a venda de um veículo consignado?",
  "Como pago um boleto que já está no Contas a pagar?",
  "O que significa “Processo de transferência em aberto”?",
  "Como abro e fecho o caixa do dia?",
];

/** Negrito, `código` e [links](/tela) — o resto é texto puro (nada de HTML). */
function inline(texto: string, aoNavegar: () => void): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g);
  return partes.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(p))
      return (
        <code key={i} className="rounded bg-slate-100 px-1 text-[0.85em]">
          {p.slice(1, -1)}
        </code>
      );
    const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      // Só telas do próprio sistema viram link; endereço externo fica texto.
      return link[2].startsWith("/") && !link[2].startsWith("//") ? (
        <Link key={i} href={link[2]} onClick={aoNavegar} className="font-medium text-blue-700 underline">
          {link[1]}
        </Link>
      ) : (
        <Fragment key={i}>{link[1]}</Fragment>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/** Markdown mínimo da resposta: parágrafos, listas com "-" e "1.". */
function Resposta({ texto, aoNavegar }: { texto: string; aoNavegar: () => void }) {
  const linhas = texto.split("\n");
  return (
    <div className="space-y-1.5">
      {linhas.map((l, i) => {
        const t = l.trim();
        if (!t) return null;
        const item = t.match(/^(?:[-*•]|(\d+)[.)])\s+(.*)$/);
        if (item)
          return (
            <div key={i} className="flex gap-2">
              <span className="shrink-0 text-slate-400">{item[1] ? `${item[1]}.` : "•"}</span>
              <span>{inline(item[2], aoNavegar)}</span>
            </div>
          );
        const titulo = t.match(/^#{1,6}\s+(.*)$/);
        if (titulo)
          return (
            <p key={i} className="font-semibold">
              {inline(titulo[1], aoNavegar)}
            </p>
          );
        return <p key={i}>{inline(t, aoNavegar)}</p>;
      })}
    </div>
  );
}

/**
 * Chat de ajuda: botão flutuante em todas as telas. O assistente explica como
 * usar o sistema (catálogo do Modo guia + o menu do usuário). A conversa fica
 * só nesta aba do navegador.
 */
export default function ChatAjuda() {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLTextAreaElement>(null);
  const cancelarRef = useRef<AbortController | null>(null);

  // Conversa guardada na aba (sobrevive à troca de tela e ao recarregar).
  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(CHAVE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento da aba
      if (salvo) setMsgs(JSON.parse(salvo) as Msg[]);
    } catch {
      // armazenamento indisponível: começa vazio
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE, JSON.stringify(msgs.slice(-30)));
    } catch {
      // sem armazenamento: a conversa vale só enquanto a tela estiver aberta
    }
  }, [msgs]);
  useEffect(() => {
    if (aberto) fimRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, aberto]);
  useEffect(() => {
    if (aberto) entradaRef.current?.focus();
  }, [aberto]);

  // No celular o painel cobre a tela: ao seguir um link, fecha.
  const aoNavegar = () => {
    if (window.matchMedia("(max-width: 639px)").matches) setAberto(false);
  };

  async function enviar(pergunta: string) {
    const q = pergunta.trim();
    if (!q || enviando) return;
    const historico: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...historico, { role: "assistant", content: "" }]);
    setTexto("");
    setEnviando(true);
    const ctrl = new AbortController();
    cancelarRef.current = ctrl;
    const escrever = (parcial: string) =>
      setMsgs((prev) => [...prev.slice(0, -1), { role: "assistant", content: parcial }]);
    try {
      const res = await fetch("/api/ajuda", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: historico, pagina: pathname }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        escrever(`⚠️ ${j?.error ?? "Não foi possível responder agora. Tente de novo."}`);
        return;
      }
      const leitor = res.body.getReader();
      const dec = new TextDecoder();
      let acumulado = "";
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        acumulado += dec.decode(value, { stream: true });
        escrever(acumulado);
      }
      if (!acumulado.trim()) escrever("⚠️ A resposta veio vazia. Tente perguntar de outro jeito.");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setMsgs((prev) => {
          const ultima = prev[prev.length - 1];
          return ultima?.content ? prev : prev.slice(0, -1);
        });
      } else {
        escrever("⚠️ Sem conexão com o servidor. Confira a internet e tente de novo.");
      }
    } finally {
      setEnviando(false);
      cancelarRef.current = null;
    }
  }

  return (
    <div className="print:hidden">
      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-700"
          aria-label="Abrir o chat de ajuda"
        >
          💬 Ajuda
        </button>
      ) : (
        <div
          role="dialog"
          aria-label="Chat de ajuda"
          className="fixed inset-0 z-[60] flex flex-col bg-white sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(600px,calc(100vh-2rem))] sm:w-[400px] sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">💬 Assistente de ajuda</p>
              <p className="text-xs text-slate-500">Tira dúvidas de como usar o sistema</p>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length ? (
                <button
                  type="button"
                  onClick={() => {
                    cancelarRef.current?.abort();
                    setMsgs([]);
                  }}
                  className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                >
                  Nova conversa
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {msgs.length === 0 ? (
              <div className="space-y-2">
                <p className="text-slate-600">
                  Olá! Pergunte como fazer qualquer rotina do sistema. Por exemplo:
                </p>
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => enviar(s)}
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                  >
                    {s}
                  </button>
                ))}
                <p className="pt-1 text-xs text-slate-400">
                  O assistente explica o uso do sistema; ele não vê os dados da loja.
                </p>
              </div>
            ) : (
              msgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-slate-900 px-3 py-2 text-white">
                      {m.content}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-slate-800">
                    {m.content ? (
                      <Resposta texto={m.content} aoNavegar={aoNavegar} />
                    ) : (
                      <span className="text-slate-400">digitando…</span>
                    )}
                  </div>
                ),
              )
            )}
            <div ref={fimRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-slate-100 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <textarea
              ref={entradaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, 2000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar(texto);
                }
              }}
              rows={1}
              placeholder="Escreva sua dúvida…"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            {enviando ? (
              <button
                type="button"
                onClick={() => cancelarRef.current?.abort()}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Parar
              </button>
            ) : (
              <button
                type="submit"
                disabled={!texto.trim()}
                className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Enviar
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
