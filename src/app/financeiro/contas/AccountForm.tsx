"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import BankInput from "@/components/BankInput";
import { createAccountAction, type ContaFormState } from "./actions";

export default function AccountForm() {
  const [state, formAction, pending] = useActionState(createAccountAction, {} as ContaFormState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Nome" required>
        <Input name="name" required placeholder="Ex: Caixa da loja / Banco Itaú" />
      </Field>
      <Field label="Tipo" required>
        <Select name="type" defaultValue="CAIXA">
          <option value="CAIXA">Caixa físico</option>
          <option value="BANCO">Banco (conta corrente)</option>
          <option value="POUPANCA">Poupança</option>
          <option value="OUTRO">Outro</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Banco">
          <BankInput name="bankName" placeholder="Ex: Itaú" />
        </Field>
        <Field label="Agência">
          <Input name="agency" placeholder="0000" />
        </Field>
      </div>
      <Field label="Número da conta">
        <Input name="accountNumber" placeholder="00000-0" />
      </Field>
      <Field label="Saldo inicial (R$)">
        <Input name="initialBalance" type="number" step="0.01" defaultValue={0} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="isDefault" value="true" className="h-4 w-4 rounded border-slate-300" />
        Usar como conta padrão das baixas
      </label>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Cadastrar conta"}
      </Button>
    </form>
  );
}
