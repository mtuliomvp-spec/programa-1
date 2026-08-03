"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { importAgrastyTitlesAction, type ImportResult } from "./actions";

export default function ImportButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={pending || (result?.ok ?? false)}
        onClick={() => {
          if (!confirm("Lançar os 12 títulos dos Pix de 31/07 em Contas a pagar (saque Agrasty)?")) return;
          startTransition(async () => setResult(await importAgrastyTitlesAction()));
        }}
      >
        {pending ? "Lançando..." : "Lançar títulos"}
      </Button>

      {result ? (
        result.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-medium">
              {result.created} criado(s) · {result.skipped} já existente(s).
            </p>
            {result.beneficiaryCreated ? (
              <p className="mt-1 text-emerald-700">
                O beneficiário &quot;Agrasty&quot; não existia no Capital e foi cadastrado.
              </p>
            ) : null}
            <p className="mt-1 text-emerald-700">
              Agora dê baixa de cada título em Contas a pagar, na conta que realmente pagou (veja
              as observações de cada um) — a baixa gera a retirada no capital da Agrasty.
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
