"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { generatePayrollAction } from "./actions";

export default function GeneratePayrollButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      {message ? <span className="text-sm font-medium text-emerald-700">{message}</span> : null}
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { created } = await generatePayrollAction();
            setMessage(
              created > 0
                ? `${created} salário(s) lançado(s) em contas a pagar.`
                : "Folha deste mês já estava gerada.",
            );
          })
        }
      >
        {pending ? "Gerando..." : "Gerar folha do mês"}
      </Button>
    </div>
  );
}
