"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import NewSupplierInline from "@/components/NewSupplierInline";
import { createRecurringAction, type RecurringFormState } from "../actions";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { toDateInputValue } from "@/lib/format";

type Option = { id: string; name: string };

export default function RecurringForm({
  suppliers,
  customers,
  beneficiaries,
}: {
  suppliers: Option[];
  customers: Option[];
  beneficiaries: Option[];
}) {
  const [state, formAction, pending] = useActionState(createRecurringAction, {} as RecurringFormState);
  const [kind, setKind] = useState<"PAGAR" | "RECEBER">("PAGAR");
  const [periodicidade, setPeriodicidade] = useState<"MENSAL" | "DIAS">("MENSAL");
  const [flow, setFlow] = useState<string>("ADMINISTRATIVO");
  const isCapital = flow === "CAPITAL";
  // Fornecedor: lista + seleção controladas, para poder cadastrar um novo na hora.
  const [supplierList, setSupplierList] = useState<Option[]>(suppliers);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplier, setNewSupplier] = useState(false);

  const supplierField = (label: string) => (
    <Field label={label}>
      <Select name="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
        <option value="">Sem fornecedor</option>
        {supplierList.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <button
        type="button"
        onClick={() => setNewSupplier((v) => !v)}
        className="mt-1 text-xs font-medium text-blue-700 hover:underline"
      >
        {newSupplier ? "Fechar" : "➕ Cadastrar fornecedor"}
      </button>
      {newSupplier ? (
        <NewSupplierInline
          onCreated={(name, id) => {
            setSupplierList((prev) => (prev.some((s) => s.id === id) ? prev : [...prev, { id, name }]));
            setSupplierId(id);
            setNewSupplier(false);
          }}
        />
      ) : null}
    </Field>
  );

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
        <Field label="Fluxo (obra estrutural)" required>
          <Select name="structuralKey" value={flow} onChange={(e) => setFlow(e.target.value)}>
            {STRUCTURAL_FLOWS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Periodicidade" required>
          <Select
            name="periodicidade"
            value={periodicidade}
            onChange={(e) => setPeriodicidade(e.target.value as "MENSAL" | "DIAS")}
          >
            <option value="MENSAL">Mensal (dia do mês)</option>
            <option value="DIAS">A cada N dias</option>
          </Select>
        </Field>
        {periodicidade === "MENSAL" ? (
          <Field label="Dia do vencimento (1 a 31)" required>
            <Input type="number" name="dayOfMonth" min={1} max={31} defaultValue={5} required />
          </Field>
        ) : (
          <Field label="A cada quantos dias" required>
            <Input type="number" name="intervalDays" min={1} max={365} defaultValue={15} required />
            <p className="mt-1 text-xs text-slate-400">Conta a partir da data em &quot;Começa em&quot;.</p>
          </Field>
        )}

        {isCapital ? (
          <Field label="Sócio (beneficiário)" required>
            <Select name="capitalBeneficiaryId" defaultValue="" required>
              <option value="">Selecione o sócio</option>
              {beneficiaries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-400">
              {kind === "PAGAR"
                ? "Cada título vira uma RETIRADA do sócio quando você paga."
                : "Cada título vira um APORTE do sócio quando você recebe."}
            </p>
          </Field>
        ) : null}

        {isCapital && kind === "PAGAR" ? supplierField("Fornecedor (opcional)") : null}

        {!isCapital && kind === "PAGAR" ? (
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
            {supplierField("Fornecedor")}
          </>
        ) : null}

        {!isCapital && kind === "RECEBER" ? (
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
        ) : null}

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
