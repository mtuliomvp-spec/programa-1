"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { fixVehiclePurchaseCostsAction, type FixResult } from "./actions";

export default function FixButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FixResult | null>(null);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={pending || (result?.ok ?? false)}
        onClick={() => {
          if (
            !confirm(
              `Remover ${count} custo(s) duplicado(s) da compra e devolver a categoria "Compra de veículo" aos títulos? O título a pagar continua no sistema — só deixa de contar como custo extra do carro.`,
            )
          )
            return;
          startTransition(async () => setResult(await fixVehiclePurchaseCostsAction()));
        }}
      >
        {pending ? "Corrigindo..." : `Corrigir os ${count} encontrados`}
      </Button>

      {result ? (
        result.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-medium">
              {result.removed} custo(s) duplicado(s) removido(s)
              {result.categoriesFixed > 0
                ? ` · ${result.categoriesFixed} título(s) voltaram à categoria "Compra de veículo"`
                : ""}
              .
            </p>
            {result.vehicles.length > 0 ? (
              <p className="mt-1 text-emerald-700">Veículos corrigidos: {result.vehicles.join(" · ")}.</p>
            ) : null}
            <p className="mt-1 text-emerald-700">
              Abra o card do veículo: o custo total agora é o preço de compra + os custos de
              verdade. Recarregue esta página para conferir que não sobrou nada.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {result.error || "Não foi possível corrigir."}
          </div>
        )
      ) : null}
    </div>
  );
}
