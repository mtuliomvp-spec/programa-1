"use client";

import { useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "capital-ocultar-zerados";

/**
 * Seção recolhível dos sócios com saldo zerado. A preferência (oculto ou não)
 * fica no navegador; o agrupamento em si é decidido pelo servidor a cada
 * render — qualquer movimentação muda o saldo e o sócio volta sozinho para a
 * lista normal.
 */
export default function ZeroBalanceSection({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // setTimeout evita setState síncrono no effect (regra do lint) e
    // hydration mismatch — o primeiro paint sai igual ao do servidor.
    const t = setTimeout(() => {
      try {
        setHidden(localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        // localStorage indisponível — mantém visível
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const toggle = () => {
    setHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // sem persistência, mas o toggle ainda funciona na sessão
      }
      return next;
    });
  };

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100 hover:text-slate-700 print:hidden"
        title={hidden ? "Mostrar os sócios com saldo zerado" : "Ocultar os sócios com saldo zerado"}
      >
        <span
          aria-hidden
          className={`inline-block transition-transform ${hidden ? "" : "rotate-90"}`}
        >
          ▶
        </span>
        Sócios com saldo zerado ({count})
        <span className="ml-auto font-normal normal-case tracking-normal text-slate-400">
          {hidden ? "mostrar" : "ocultar"}
        </span>
      </button>
      {hidden ? null : <div className="mt-2 space-y-3">{children}</div>}
    </div>
  );
}
