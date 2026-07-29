"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { importPmzTitlesAction, type ImportResult } from "./actions";

export default function ImportButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={pending || (result?.ok ?? false)}
        onClick={() => {
          if (!confirm("Importar os títulos da PMZ para Contas a pagar?")) return;
          startTransition(async () => setResult(await importPmzTitlesAction()));
        }}
      >
        {pending ? "Importando..." : "Importar títulos"}
      </Button>

      {result ? (
        result.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-medium">
              {result.created} criado(s) · {result.skipped} já existente(s).
            </p>
            {result.semPlaca.length > 0 ? (
              <p className="mt-1 text-emerald-700">
                Sem vínculo de veículo (lançados como conta simples — use Editar para vincular):{" "}
                {result.semPlaca.join(", ")}
              </p>
            ) : null}
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
