"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import DebtItemsField from "@/components/DebtItemsField";
import { formatCurrency } from "@/lib/format";
import { splitSameTotalAction, type SplitSameTotalState } from "../../actions";

/**
 * Desmembra um título de devolução (cliente/proprietário) em várias partes,
 * cada uma com valor e vencimento próprios — a soma PRECISA ser igual ao valor
 * do título (o total devido vem da venda e não muda aqui).
 */
export default function SplitSameTotalForm({
  payableId,
  amount,
  returnTo,
}: {
  payableId: string;
  amount: number;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(
    splitSameTotalAction,
    {} as SplitSameTotalState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={payableId} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}

      <p className="text-sm text-slate-600">
        Divida este título de <strong>{formatCurrency(amount)}</strong> em partes — cada linha vira
        um título próprio, com o seu vencimento, pago separadamente. A{" "}
        <strong>soma precisa ser exatamente {formatCurrency(amount)}</strong>: o total devido vem da
        venda e não muda aqui, só a forma de pagar. Sem descrição, as partes são numeradas; sem
        data, vencem na data do título original.
      </p>

      <DebtItemsField name="items" agreed={amount} mode="exato" startOpen />

      <Button type="submit" disabled={pending} variant="secondary" className="w-full">
        {pending ? "Desmembrando..." : "Desmembrar em títulos"}
      </Button>
      <p className="text-xs text-slate-400">
        O título original é substituído pelas partes — a ação não pode ser desfeita (mas cada parte
        continua editável).
      </p>
    </form>
  );
}
