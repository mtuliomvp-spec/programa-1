"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { importPlanoCasfAction, type ImportResult } from "./actions";

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
              "Cadastrar a recorrência do plano CASF (dia 05, capital do Marco Antonio) e lançar o boleto de 05/08/2026 (R$ 3.370,17)?",
            )
          )
            return;
          startTransition(async () => setResult(await importPlanoCasfAction()));
        }}
      >
        {pending ? "Cadastrando..." : "Cadastrar recorrência e lançar o boleto de agosto"}
      </Button>

      {result ? (
        result.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-medium">
              {result.recurringCreated ? "Recorrência criada" : "Recorrência já existia"} ·{" "}
              {result.firstTitleCreated
                ? "boleto de 05/08 lançado"
                : "título de agosto já existia"}{" "}
              · débito do capital de {result.beneficiaryName}
              {result.generated > 0
                ? ` · ${result.generated} título(s) dos próximos meses gerado(s)`
                : ""}
              .
            </p>
            <p className="mt-1 text-emerald-700">
              O título está em Contas a pagar (PENDENTE). Quando pagar, a baixa vira retirada do
              capital do {result.beneficiaryName}. Nos próximos meses, ajuste o valor do título
              conforme o boleto (a coparticipação muda) antes de dar a baixa.
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
