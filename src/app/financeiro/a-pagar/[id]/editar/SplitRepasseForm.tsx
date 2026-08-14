"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import DebtItemsField from "@/components/DebtItemsField";
import { formatCurrency } from "@/lib/format";
import { splitConsignedRepasseAction, type SplitRepasseState } from "../../actions";

/**
 * Desmembra o título de débitos do repasse (consignado) em várias guias — cada
 * linha vira um título próprio, pagável separadamente. A diferença entre a soma
 * das guias e o valor descontado do dono vira custo (acréscimo) ou ganho
 * (desconto) do veículo — mesma lógica da edição de valor.
 */
export default function SplitRepasseForm({
  payableId,
  amount,
  returnTo,
}: {
  payableId: string;
  /** Valor atual do título — o que foi descontado do proprietário. */
  amount: number;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(
    splitConsignedRepasseAction,
    {} as SplitRepasseState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={payableId} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}

      <p className="text-sm text-slate-600">
        Este título soma <strong>{formatCurrency(amount)}</strong> (o descontado do proprietário).
        Abra em guias — IPVA, multas, licenciamento — e <strong>cada linha vira um título</strong>{" "}
        com o próprio vencimento, pago separadamente. Se a soma das guias for diferente do
        descontado, a diferença é da loja: guia mais cara entra como <strong>custo do veículo</strong>,
        mais barata <strong>reduz o custo</strong> (a devolução ao proprietário não muda). Sem data,
        a guia vence na data deste título.
      </p>

      <DebtItemsField name="items" agreed={amount} mode="devolucao" startOpen />

      <Button type="submit" disabled={pending} variant="secondary" className="w-full">
        {pending ? "Desmembrando..." : "Desmembrar em títulos"}
      </Button>
      <p className="text-xs text-slate-400">
        O título original é substituído pelas guias — a ação não pode ser desfeita (mas cada guia
        continua editável).
      </p>
    </form>
  );
}
