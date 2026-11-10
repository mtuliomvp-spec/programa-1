"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { generatePayrollAction } from "./actions";

export default function GeneratePayrollButton({ competencia }: { competencia: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {message ? (
        <span className={`text-sm font-medium ${message.ok ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</span>
      ) : null}
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { created, error } = await generatePayrollAction(competencia);
            setMessage(
              error
                ? { ok: false, text: error }
                : {
                    ok: true,
                    text:
                      created > 0
                        ? `${created} salário(s) de ${competencia} lançado(s) em contas a pagar.`
                        : `A folha de ${competencia} já estava gerada.`,
                  },
            );
          })
        }
      >
        {pending ? "Gerando..." : `Gerar folha de ${competencia}`}
      </Button>
    </div>
  );
}
