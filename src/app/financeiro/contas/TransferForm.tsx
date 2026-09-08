"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { createTransferAction, type ContaFormState } from "./actions";

type Option = { id: string; name: string };

export default function TransferForm({
  accounts,
  cashboxDate = null,
  neutro = null,
}: {
  accounts: Option[];
  cashboxDate?: string | null;
  /**
   * Banco Neutro quando está FORA de zero (fica null quando já está zerado).
   * É a conta de compensação: sair de zero significa que uma ponta ficou sem
   * par, e o acerto é uma transferência com a conta de verdade que bancou
   * aquilo. Pode ser em várias parcelas até fechar.
   */
  neutro?: { id: string; balance: number } | null;
}) {
  const [state, formAction, pending] = useActionState(createTransferAction, {} as ContaFormState);
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts[1]?.id ?? "");

  const falta = neutro ? Math.round(Math.abs(neutro.balance) * 100) / 100 : 0;
  // Negativo pede crédito (o dinheiro ENTRA no Neutro); positivo, o contrário.
  const precisaEntrar = neutro ? neutro.balance < 0 : false;
  const envolveNeutro = Boolean(neutro && (fromId === neutro.id || toId === neutro.id));

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}

      {neutro ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚖️ O <strong>Banco Neutro (compensação)</strong> está em{" "}
          <strong>{formatCurrency(neutro.balance)}</strong>. Para encerrar o lançamento, transfira
          até <strong>{formatCurrency(falta)}</strong>{" "}
          {precisaEntrar ? "para ele" : "dele para a conta de destino"} — de uma vez ou em várias
          transferências, da conta que realmente bancou o valor.
        </div>
      ) : null}

      <Field label="De (origem)" required>
        <Select name="fromId" value={fromId} onChange={(e) => setFromId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Para (destino)" required>
        <Select name="toId" value={toId} onChange={(e) => setToId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Valor (R$)" required>
        <Input
          name="amount"
          type="number"
          step="0.01"
          min={0.01}
          // Com o Neutro na jogada, o teto é o que falta para zerá-lo: passar do
          // ponto o tiraria de zero para o outro lado. O servidor repete a trava.
          max={envolveNeutro ? falta : undefined}
          required
        />
        {envolveNeutro ? (
          <p className="mt-1 text-xs text-slate-500">
            Máximo {formatCurrency(falta)} — o que falta para o Banco Neutro voltar a zero.
          </p>
        ) : null}
      </Field>
      <p className="text-xs text-slate-500">
        Data da transferência: <strong>{cashboxDate ? `${cashboxDate} (data do caixa)` : "data do caixa aberto"}</strong>
      </p>
      <Field label="Descrição">
        <Input name="description" placeholder="Ex: depósito do caixa no banco" />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Transferindo..." : "Registrar transferência"}
      </Button>
    </form>
  );
}
