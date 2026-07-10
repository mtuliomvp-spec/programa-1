"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createRecurringAction, type RecurringFormState } from "../actions";
import { toDateInputValue } from "@/lib/format";

type Option = { id: string; name: string };

export default function RecurringForm({
  suppliers,
  customers,
}: {
  suppliers: Option[];
  customers: Option[];
}) {
  const [state, formAction, pending] = useActionState(createRecurringAction, {} as RecurringFormState);
  const [kind, setKind] = useState<"PAGAR" | "RECEBER">("PAGAR");

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <Field label="Tipo" required>
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as "PAGAR" | "RECEBER")}>
          <option value="PAGAR">Conta a pagar (despesa fixa)</option>
          <option value="RECEBER">Conta a receber (receita fixa)</option>
        </Select>
      </Field>

      <Field label="Descrição" required>
        <Input
          name="description"
          required
          placeholder={kind === "PAGAR" ? "Ex: Aluguel do salão" : "Ex: Aluguel de sala anexa"}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Valor (R$)" required>
          <Input type="number" step="0.01" min={0.01} name="amount" required />
        </Field>
        <Field label="Dia do vencimento (1 a 31)" required>
          <Input type="number" name="dayOfMonth" min={1} max={31} defaultValue={5} required />
        </Field>

        {kind === "PAGAR" ? (
          <>
            <Field label="Categoria" required>
              <Select name="categoryPagar" defaultValue="DESPESA_OPERACIONAL">
                <option value="DESPESA_OPERACIONAL">Despesa operacional</option>
                <option value="COMISSAO">Comissão</option>
                <option value="SALARIO">Salário</option>
                <option value="COMBUSTIVEL">Combustível</option>
                <option value="OUTROS">Outros</option>
              </Select>
            </Field>
            <Field label="Fornecedor">
              <Select name="supplierId" defaultValue="">
                <option value="">Sem fornecedor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Categoria" required>
              <Select name="categoryReceber" defaultValue="OUTROS">
                <option value="OUTROS">Outros</option>
                <option value="VENDA_VEICULO">Venda de veículo</option>
                <option value="VENDA_PECA">Venda de peças</option>
              </Select>
            </Field>
            <Field label="Cliente">
              <Select name="customerId" defaultValue="">
                <option value="">Sem cliente</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}

        <Field label="Começa em" required>
          <Input type="date" name="startDate" defaultValue={toDateInputValue(new Date())} required />
        </Field>
        <Field label="Termina em (opcional)">
          <Input type="date" name="endDate" />
        </Field>
      </div>

      <Field label="Observações">
        <Textarea name="notes" rows={2} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar recorrência"}
        </Button>
      </div>
    </form>
  );
}
