"use client";

import { perguntar } from "@/lib/confirmar";

import { useState, useTransition } from "react";

export default function DeleteRowButton({
  id,
  action,
  confirmMessage = "Tem certeza que deseja excluir este registro?",
}: {
  id: string;
  /** Pode devolver `{ error }`: a mensagem chega inteira (erro lançado vira texto genérico em produção). */
  action: (id: string) => Promise<void | { error?: string }>;
  confirmMessage?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleClick() {
    if (!await perguntar(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await action(id);
        if (r && r.error) setError(r.error);
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") return;
        setError(err instanceof Error ? err.message : "Não foi possível excluir.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50"
      >
        {pending ? "Excluindo..." : "Excluir"}
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </span>
  );
}
