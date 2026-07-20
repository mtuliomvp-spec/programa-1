"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { closeMonthAction, reopenMonthAction } from "./actions";

/** Botão "Fechar mês" com confirmação (mostra o resultado que vai ao capital). */
export function CloseMonthButton({
  year,
  month,
  label,
  resultLabel,
}: {
  year: number;
  month: number;
  label: string;
  resultLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (
      !confirm(
        `Fechar o mês ${label}?\n\nO resultado (${resultLabel}) será transferido para o capital da empresa e o mês ficará travado para novos lançamentos.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      const r = await closeMonthAction(year, month);
      if (!r.ok) {
        setError(r.error || "Não foi possível fechar o mês.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <Button type="button" onClick={run} disabled={pending}>
        {pending ? "Fechando..." : `🔒 Fechar ${label}`}
      </Button>
      {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}

/** Botão "Reabrir" (só o fechamento mais recente pode ser reaberto). */
export function ReopenMonthButton({ year, month, label }: { year: number; month: number; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    if (
      !confirm(
        `Reabrir o mês ${label}?\n\nOs lançamentos do fechamento (resultado no capital e pró-labore) serão estornados e o mês volta a aceitar lançamentos.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      const r = await reopenMonthAction(year, month);
      if (!r.ok) {
        setError(r.error || "Não foi possível reabrir o mês.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50"
      >
        {pending ? "Reabrindo..." : "Reabrir"}
      </button>
      {error ? <p className="mt-1 text-xs font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}
