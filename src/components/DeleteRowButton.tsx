"use client";

import { useState, useTransition } from "react";

export default function DeleteRowButton({
  id,
  action,
  confirmMessage = "Tem certeza que deseja excluir este registro?",
}: {
  id: string;
  action: (id: string) => Promise<void>;
  confirmMessage?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      try {
        await action(id);
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
