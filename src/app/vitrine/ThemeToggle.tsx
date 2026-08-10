"use client";

import { useSyncExternalStore } from "react";

// Observa a classe .dark do <html> (fonte da verdade do tema).
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/**
 * Alterna claro/escuro na vitrine. O padrão segue o tema do aparelho
 * (prefers-color-scheme, aplicado pelo ThemeScript antes da pintura); o toque
 * salva a escolha no navegador e ela passa a valer nas próximas visitas.
 */
export default function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false, // render no servidor: assume claro (o ThemeScript corrige antes da pintura)
  );

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("mvp-vitrine-theme", next ? "dark" : "light");
    } catch {
      // navegação privada sem localStorage — só aplica na sessão atual
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Mudar para modo claro" : "Mudar para modo escuro"}
      title={dark ? "Modo claro" : "Modo escuro"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-base hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
