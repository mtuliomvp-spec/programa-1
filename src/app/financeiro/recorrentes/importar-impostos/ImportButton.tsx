"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { importImpostosAction, type ImportResult } from "./actions";

export default function ImportButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={pending || (result?.ok ?? false)}
        onClick={() => {
          if (
            !confirm(
              "Cadastrar as 3 recorrências de impostos (DAS, FGTS e DARF INSS) e lançar as guias de 20/07/2026?",
            )
          )
            return;
          startTransition(async () => setResult(await importImpostosAction()));
        }}
      >
        {pending ? "Cadastrando..." : "Cadastrar recorrências e lançar guias"}
      </Button>

      {result ? (
        result.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-medium">
              {result.recurringCreated} recorrência(s) criada(s) · {result.recurringSkipped} já
              existente(s) · {result.firstTitlesCreated} guia(s) de 20/07 lançada(s)
              {result.generated > 0 ? ` · ${result.generated} título(s) dos próximos meses gerado(s)` : ""}
              .
            </p>
            <p className="mt-1 text-emerald-700">
              Os títulos estão em Contas a pagar (PENDENTES). O valor de cada mês varia — confira a
              guia e ajuste o título (Editar) antes de dar a baixa. O DAS de 20/07 saiu com o valor
              da última guia conhecida; confirme o valor real da competência 06/2026.
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {result.error}
          </p>
        )
      ) : null}
    </div>
  );
}
