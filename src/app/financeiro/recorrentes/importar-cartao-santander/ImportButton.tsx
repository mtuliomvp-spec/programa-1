"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { importCartaoSantanderAction, type ImportResult } from "./actions";

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
              "Criar a recorrência do cartão Santander (dia 4) e o título de 04/08/2026 com os 53 lançamentos da fatura (R$ 14.870,98)?",
            )
          )
            return;
          startTransition(async () => setResult(await importCartaoSantanderAction()));
        }}
      >
        {pending ? "Criando..." : "Criar rotina do cartão + fatura de agosto"}
      </Button>

      {result ? (
        result.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-medium">
              Recorrência {result.recurringCreated ? "criada" : "já existia"} · título{" "}
              {result.payableCreated ? "criado" : "reaproveitado"} · {result.itemsCreated}{" "}
              lançamento(s) criado(s)
              {result.itemsUpdated > 0 ? ` · ${result.itemsUpdated} ajustado(s) para o Capital` : ""}.
            </p>
            <p className="mt-1 text-emerald-700">
              Cada lançamento entrou no <strong>Capital do sócio indicado</strong> (Lovable/Anthropic
              → Agrasty; cartão 9792 → Marcelo; demais → Marco Túlio). As retiradas são lançadas na
              baixa da fatura. Para mudar algum, abra o título em Contas a pagar (Editar) — cada
              lançamento tem o botão Editar.
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
