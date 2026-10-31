"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { GUIA, type GuiaItem } from "@/lib/guia/catalogo";
import { EVENTO_GUIA_FEITO, entregarGuiaPendente, type GuiaFeitoDetalhe } from "@/lib/guia/eventos";

/**
 * Modo guia: um interruptor no topo da tela (sempre no demo; nas lojas, quando
 * o administrador liga em Parâmetros). Ligado, passar o
 * mouse (ou o foco do teclado) num botão marcado com `data-guia` mostra o que
 * ele faz, o que precisa antes e o que acontece depois; no celular, o
 * primeiro toque explica e o "Continuar" executa. Depois da operação, a tela
 * avisa (`guiaFeito`) e aparece o painel "O que foi feito". Desligado, a tela
 * funciona exatamente como sempre.
 *
 * A preferência fica no navegador de quem testa (não é dado do sistema).
 */

const CHAVE = "fincore-guia";
let memoria = false;
const ouvintes = new Set<() => void>();

function lerLigado(): boolean {
  try {
    const v = localStorage.getItem(CHAVE);
    if (v !== null) return v === "1";
  } catch {
    // Navegador sem armazenamento (aba anônima bloqueada): vale a memória.
  }
  return memoria;
}

function gravarLigado(v: boolean) {
  memoria = v;
  try {
    localStorage.setItem(CHAVE, v ? "1" : "0");
  } catch {
    // Sem armazenamento: fica só nesta aba.
  }
  ouvintes.forEach((f) => f());
}

function inscrever(cb: () => void) {
  ouvintes.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    ouvintes.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

type Alvo = { el: HTMLElement; item: GuiaItem; toque: boolean };

/** Botões e links: no toque, o primeiro clique só explica. Campos não são bloqueados. */
function bloqueiaNoToque(el: HTMLElement): boolean {
  return el.tagName === "BUTTON" || el.tagName === "A";
}

export default function ModoGuia() {
  const ligado = useSyncExternalStore(inscrever, lerLigado, () => false);
  const caminho = usePathname();
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [feito, setFeito] = useState<GuiaFeitoDetalhe | null>(null);
  const balaoRef = useRef<HTMLDivElement>(null);
  // Elemento já explicado no toque: o "Continuar" o clica de verdade.
  const liberadoRef = useRef<HTMLElement | null>(null);
  const tipoPonteiroRef = useRef<string>("mouse");

  useEffect(() => {
    if (!ligado) return;
    const achar = (t: EventTarget | null) =>
      t instanceof Element ? (t.closest("[data-guia]") as HTMLElement | null) : null;
    const mostrar = (el: HTMLElement, toque: boolean) => {
      const item = GUIA[el.dataset.guia ?? ""];
      if (item) setAlvo({ el, item, toque });
    };

    const aoPonteiroDescer = (e: PointerEvent) => {
      tipoPonteiroRef.current = e.pointerType;
    };
    const aoEntrar = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = achar(e.target);
      if (el) mostrar(el, false);
    };
    const aoSair = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = achar(e.target);
      if (!el) return;
      const indo = e.relatedTarget instanceof Node ? e.relatedTarget : null;
      if (indo && el.contains(indo)) return;
      setAlvo((a) => (a && a.el === el && !a.toque ? null : a));
    };
    const aoFocar = (e: FocusEvent) => {
      const el = achar(e.target);
      if (el && tipoPonteiroRef.current !== "touch") mostrar(el, false);
    };
    const aoDesfocar = (e: FocusEvent) => {
      const el = achar(e.target);
      if (el) setAlvo((a) => (a && a.el === el && !a.toque ? null : a));
    };
    const aoClicar = (e: MouseEvent) => {
      if (tipoPonteiroRef.current !== "touch") {
        setAlvo((a) => (a && !a.toque ? null : a));
        return;
      }
      const el = achar(e.target);
      if (!el || !GUIA[el.dataset.guia ?? ""]) return;
      if (liberadoRef.current === el) {
        liberadoRef.current = null;
        return;
      }
      if (bloqueiaNoToque(el)) {
        e.preventDefault();
        e.stopPropagation();
      }
      mostrar(el, true);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAlvo(null);
    };
    // Rolou a tela: o balão acompanha o botão (novo objeto = reposiciona).
    const aoRolar = () => setAlvo((a) => (a ? { ...a } : a));
    const aoFeito = (e: Event) => {
      setAlvo(null);
      setFeito((e as CustomEvent<GuiaFeitoDetalhe>).detail);
    };

    document.addEventListener("pointerdown", aoPonteiroDescer, true);
    document.addEventListener("pointerover", aoEntrar, true);
    document.addEventListener("pointerout", aoSair, true);
    document.addEventListener("focusin", aoFocar, true);
    document.addEventListener("focusout", aoDesfocar, true);
    document.addEventListener("click", aoClicar, true);
    document.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener(EVENTO_GUIA_FEITO, aoFeito);
    return () => {
      document.removeEventListener("pointerdown", aoPonteiroDescer, true);
      document.removeEventListener("pointerover", aoEntrar, true);
      document.removeEventListener("pointerout", aoSair, true);
      document.removeEventListener("focusin", aoFocar, true);
      document.removeEventListener("focusout", aoDesfocar, true);
      document.removeEventListener("click", aoClicar, true);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", aoRolar, true);
      window.removeEventListener(EVENTO_GUIA_FEITO, aoFeito);
    };
  }, [ligado]);

  // Operação que terminou noutra página (ex.: cadastrar veículo → ficha): o
  // resumo guardado aparece quando a página de destino abre. Vem depois do
  // efeito que escuta o evento, para ele já estar ouvindo.
  useEffect(() => {
    if (ligado) entregarGuiaPendente(caminho);
  }, [ligado, caminho]);

  // Posiciona o balão junto do botão: embaixo se couber, senão em cima. Mexe
  // direto no estilo — a medida só existe depois de o balão estar na tela.
  useLayoutEffect(() => {
    const balao = balaoRef.current;
    if (!alvo || !balao) return;
    const r = alvo.el.getBoundingClientRect();
    const b = balao.getBoundingClientRect();
    const margem = 8;
    const left = Math.min(Math.max(r.left, margem), window.innerWidth - b.width - margem);
    const embaixo = r.bottom + margem;
    const top = embaixo + b.height <= window.innerHeight - margem ? embaixo : Math.max(margem, r.top - b.height - margem);
    balao.style.top = `${top}px`;
    balao.style.left = `${left}px`;
  }, [alvo]);

  function alternar() {
    const novo = !ligado;
    gravarLigado(novo);
    if (!novo) {
      setAlvo(null);
      setFeito(null);
    }
  }

  function continuar() {
    if (!alvo) return;
    const el = alvo.el;
    setAlvo(null);
    liberadoRef.current = el;
    el.click();
  }

  const item = feito ? GUIA[feito.id] : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          onClick={alternar}
          className="flex items-center gap-2.5 text-sm font-semibold text-indigo-900"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${ligado ? "bg-indigo-600" : "bg-slate-300"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${ligado ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </span>
          🎓 Modo guia {ligado ? "ligado" : "desligado"}
        </button>
        <p className="text-xs text-indigo-800">
          {ligado
            ? "Passe o mouse sobre um botão para ver o que ele faz antes de clicar (no celular, o primeiro toque explica). Já explicados: Contas a pagar, Contas e caixas, Contas a receber, cadastro de veículo, vendas e Renave."
            : "Ligue para ver, antes de clicar, o que cada botão faz e o que acontece depois."}
        </p>
      </div>

      {ligado && alvo ? (
        <div
          ref={balaoRef}
          role="tooltip"
          style={{ top: -9999, left: -9999 }}
          className={`fixed z-[60] w-[min(22rem,calc(100vw-1rem))] rounded-xl bg-slate-900 p-4 text-sm text-slate-100 shadow-2xl ${alvo.toque ? "" : "pointer-events-none"}`}
        >
          <p className="font-semibold text-white">🎓 {alvo.item.titulo}</p>
          <p className="mt-1 leading-relaxed">{alvo.item.oQueFaz}</p>
          {alvo.item.precisa?.length ? (
            <>
              <p className="mt-3 text-xs font-semibold tracking-wide text-indigo-300 uppercase">Antes de clicar</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 leading-relaxed">
                {alvo.item.precisa.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          ) : null}
          {alvo.item.depois?.length ? (
            <>
              <p className="mt-3 text-xs font-semibold tracking-wide text-emerald-300 uppercase">O que acontece</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 leading-relaxed">
                {alvo.item.depois.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          ) : null}
          {alvo.toque ? (
            <div className="mt-4 flex gap-2">
              {bloqueiaNoToque(alvo.el) ? (
                <button type="button" onClick={continuar} className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white">
                  Continuar
                </button>
              ) : null}
              <button type="button" onClick={() => setAlvo(null)} className="rounded-lg px-3 py-2 text-slate-300">
                Fechar
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {ligado && feito ? (
        <div
          role="status"
          className="fixed top-16 right-4 left-4 z-[60] rounded-xl border border-emerald-300 bg-white p-4 text-sm shadow-2xl sm:left-auto sm:w-96 md:top-4"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-emerald-800">✅ O que foi feito{item ? ` — ${item.titulo}` : ""}</p>
            <button type="button" onClick={() => setFeito(null)} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">
              ✕
            </button>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-slate-700">
            {feito.linhas.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {item?.conferir?.length ? (
            <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span className="text-slate-500">Confira em:</span>
              {item.conferir.map((c) => (
                <Link key={c.href} href={c.href} className="font-medium text-blue-700 hover:underline">
                  {c.rotulo}
                </Link>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
