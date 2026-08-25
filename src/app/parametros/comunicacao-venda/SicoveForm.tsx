"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import { saveSicoveAction, type SicoveFormState } from "./actions";

export type SicoveConfig = {
  sicoveFornecedor: string | null;
  sicoveComunicado: number | null;
  sicoveCancelamento: number | null;
  sicoveVencimentoDia: number | null;
};

export default function SicoveForm({ config }: { config: SicoveConfig }) {
  const [state, formAction, pending] = useActionState(saveSicoveAction, {} as SicoveFormState);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.success}
        </p>
      ) : null}

      <Field label="Prestadora (fornecedor do título)">
        <Input
          name="sicoveFornecedor"
          defaultValue={config.sicoveFornecedor ?? ""}
          placeholder="Ex.: R30 Registro Eletronico T. I. Ltda"
        />
        <p className="mt-1 text-xs text-slate-500">
          É quem emite o boleto mensal. O fornecedor é criado no cadastro se ainda não existir.
        </p>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Comunicação de venda (R$)">
          <MoneyInput name="sicoveComunicado" defaultValue={config.sicoveComunicado ?? undefined} />
        </Field>
        <Field label="Cancelamento (R$)">
          <MoneyInput
            name="sicoveCancelamento"
            defaultValue={config.sicoveCancelamento ?? undefined}
          />
        </Field>
        <Field label="Dia do vencimento">
          <Input
            type="number"
            name="sicoveVencimentoDia"
            min={1}
            max={31}
            defaultValue={config.sicoveVencimentoDia ?? 10}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
