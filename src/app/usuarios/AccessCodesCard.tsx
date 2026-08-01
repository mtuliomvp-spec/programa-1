"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { generateAccessCodeAction, deleteAccessCodeAction } from "./actions";

type CodeRow = {
  id: string;
  code: string;
  createdBy: string | null;
  createdAt: string; // formatada
  usedByEmail: string | null;
  usedAt: string | null; // formatada
};

/** Códigos de liberação do primeiro acesso: gere e informe à pessoa; sem um
 *  código válido o "Cadastrar primeiro acesso" da página pública não prossegue. */
export default function AccessCodesCard({ available, used }: { available: CodeRow[]; used: CodeRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function generate() {
    setMsg(null);
    start(async () => {
      const r = await generateAccessCodeAction();
      if (!r.ok) {
        setMsg(r.error || "Não foi possível gerar.");
        return;
      }
      setMsg(`Código gerado: ${r.code}`);
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const r = await deleteAccessCodeAction(id);
      if (!r.ok) alert(r.error || "Não foi possível excluir.");
      router.refresh();
    });
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard indisponível: o código está visível para copiar manualmente
    }
  }

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={pending} onClick={generate}>
          {pending ? "Gerando..." : "🔑 Gerar código"}
        </Button>
        {msg ? <p className="text-sm font-medium text-slate-700">{msg}</p> : null}
      </div>

      {available.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {available.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
              <span className="font-mono text-lg font-bold tracking-widest text-slate-900">{c.code}</span>
              <button
                type="button"
                onClick={() => copy(c.code)}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                {copied === c.code ? "✅ Copiado" : "Copiar"}
              </button>
              <span className="text-xs text-slate-400">
                gerado por {c.createdBy || "—"} em {c.createdAt}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(c.id)}
                className="ml-auto text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
              >
                Excluir
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Nenhum código disponível — gere um e informe à pessoa que vai se cadastrar.
        </p>
      )}

      {used.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Últimos utilizados</p>
          <ul className="space-y-1">
            {used.map((c) => (
              <li key={c.id} className="text-xs text-slate-500">
                <span className="font-mono font-semibold">{c.code}</span> — usado por {c.usedByEmail || "—"} em {c.usedAt}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
