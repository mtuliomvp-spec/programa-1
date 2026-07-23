"use client";

import { useActionState, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Button, Field, Input, Select } from "@/components/ui";
import { withdrawWithSubstituteAction, type CapitalFormState } from "../actions";

type AppliedAccount = { accountId: string; accountName: string; applied: number };
type Substitute = { id: string; name: string; free: number };
type PayAccount = { id: string; name: string };

export default function SubstitutionWithdrawForm({
  beneficiaryId,
  appliedAccounts,
  substitutes,
  payAccounts,
  today,
}: {
  beneficiaryId: string;
  appliedAccounts: AppliedAccount[];
  substitutes: Substitute[];
  payAccounts: PayAccount[];
  today: string;
}) {
  const [state, submit, pending] = useActionState(withdrawWithSubstituteAction, {} as CapitalFormState);
  const [open, setOpen] = useState(false);

  if (appliedAccounts.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">Sacar capital que está aplicado</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Parte do capital deste sócio está numa conta de Aplicação. Para sacar por outra conta,
            outro sócio assume a fatia aplicada (o capital livre dele vira aplicado).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          {open ? "Fechar" : "Sacar com substituição"}
        </button>
      </div>

      {open ? (
        <form action={submit} className="mt-4 space-y-3 border-t border-amber-200 pt-4">
          {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
          <input type="hidden" name="beneficiaryId" value={beneficiaryId} />
          <Field label="De qual aplicação sai a fatia?" required>
            <Select name="accountId" required>
              <option value="">Selecione…</option>
              {appliedAccounts.map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {a.accountName} · aplicado {formatCurrency(a.applied)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quem assume a fatia (substituto)" required>
            <Select name="substituteId" required>
              <option value="">Selecione…</option>
              {substitutes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · capital livre {formatCurrency(s.free)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Conta de onde o dinheiro sai" required>
            <Select name="payFromAccountId" required>
              <option value="">Selecione…</option>
              {payAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)" required>
              <Input name="amount" type="number" step="0.01" min="0.01" required placeholder="0,00" />
            </Field>
            <Field label="Data" required>
              <Input name="date" type="date" defaultValue={today} required />
            </Field>
          </div>
          <Field label="Observação">
            <Input name="description" placeholder="Opcional" />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Registrando…" : "Confirmar retirada com substituição"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
