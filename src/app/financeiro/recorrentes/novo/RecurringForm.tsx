"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import NewSupplierInline from "@/components/NewSupplierInline";
import SupplierInput from "@/components/SupplierInput";
import CategoryInput from "@/components/CategoryInput";
import MoneyInput from "@/components/MoneyInput";
import { createRecurringAction, updateRecurringAction, type RecurringFormState } from "../actions";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { toDateInputValue } from "@/lib/format";

type Option = { id: string; name: string };

export type RecurringInitial = {
  kind: "PAGAR" | "RECEBER";
  description: string;
  amount: number;
  structuralKey: string;
  periodicidade: "MENSAL" | "DIAS";
  dayOfMonth: number;
  intervalDays: number | null;
  anticipateToBusinessDay: boolean;
  cardInvoice: boolean;
  categoryLabel: string | null;
  supplierName: string;
  customerId: string | null;
  capitalBeneficiaryId: string | null;
  startDate: string; // yyyy-mm-dd
  endDate: string | null;
  notes: string | null;
};

export default function RecurringForm({
  suppliers,
  customers,
  beneficiaries,
  despesaCategories,
  receitaCategories,
  initial,
  id,
}: {
  suppliers: Option[];
  customers: Option[];
  beneficiaries: Option[];
  despesaCategories: string[];
  receitaCategories: string[];
  initial?: RecurringInitial;
  id?: string;
}) {
  const editing = !!id;
  const [state, formAction, pending] = useActionState(
    editing ? updateRecurringAction : createRecurringAction,
    {} as RecurringFormState,
  );
  const [kind, setKind] = useState<"PAGAR" | "RECEBER">(initial?.kind ?? "PAGAR");
  const [periodicidade, setPeriodicidade] = useState<"MENSAL" | "DIAS">(initial?.periodicidade ?? "MENSAL");
  const [flow, setFlow] = useState<string>(initial?.structuralKey ?? "ADMINISTRATIVO");
  const isCapital = flow === "CAPITAL";
  // Fornecedor: campo com digitação livre e sugestões (mais fácil de achar numa
  // lista grande). Envia o NOME; o servidor reaproveita/cadastra pelo nome.
  const [supplierNames, setSupplierNames] = useState<string[]>(suppliers.map((s) => s.name));
  const [supplierName, setSupplierName] = useState(initial?.supplierName ?? "");
  const [newSupplier, setNewSupplier] = useState(false);
  // Fatura de cartão: o título gerado tem lançamentos detalháveis e o valor
  // pode começar em 0 (a soma dos lançamentos vira o valor do título).
  const [cardInvoice, setCardInvoice] = useState(initial?.cardInvoice ?? false);

  const supplierField = (label: string) => (
    <Field label={label}>
      <SupplierInput
        name="supplierName"
        suppliers={supplierNames}
        value={supplierName}
        onValueChange={setSupplierName}
      />
      <button
        type="button"
        onClick={() => setNewSupplier((v) => !v)}
        className="mt-1 text-xs font-medium text-blue-700 hover:underline"
      >
        {newSupplier ? "Fechar" : "➕ Cadastrar fornecedor"}
      </button>
      {newSupplier ? (
        <NewSupplierInline
          onCreated={(name) => {
            setSupplierNames((prev) => (prev.includes(name) ? prev : [...prev, name]));
            setSupplierName(name);
            setNewSupplier(false);
          }}
        />
      ) : null}
    </Field>
  );

  return (
    <form action={formAction} className="space-y-4">
      {editing ? <input type="hidden" name="id" value={id} /> : null}
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
          defaultValue={initial?.description}
          placeholder={kind === "PAGAR" ? "Ex: Aluguel do salão" : "Ex: Aluguel de sala anexa"}
        />
        <p className="mt-1 text-xs text-slate-400">
          Dica: escreva <code>{"{competencia}"}</code> na descrição e cada título sai com o mês de
          competência (o mês anterior ao vencimento) — ex.: &quot;DAS — competência{" "}
          {"{competencia}"}&quot; vira &quot;DAS — competência 05/2026&quot; no vencimento de junho.
        </p>
      </Field>

      {kind === "PAGAR" && !isCapital ? (
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="cardInvoice"
            value="true"
            checked={cardInvoice}
            onChange={(e) => setCardInvoice(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            💳 <strong>Fatura de cartão de crédito</strong> — o título do mês vira uma linha só e,
            ao abrir, você digita os lançamentos da fatura (cada um no seu fluxo: Administrativo,
            Veículos ou Capital). A recorrência serve para marcar o dia do pagamento; o valor do
            título é a soma dos lançamentos.
          </span>
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={cardInvoice ? "Valor estimado (R$) — pode ser 0" : "Valor (R$)"} required>
          <MoneyInput name="amount" required defaultValue={initial?.amount} />
        </Field>
        <Field label="Fluxo (obra estrutural)" required>
          {/* Recorrência não tem veículo — sem carro, o fluxo é Administrativo. */}
          <Select name="structuralKey" value={flow} onChange={(e) => setFlow(e.target.value)}>
            {STRUCTURAL_FLOWS.filter((f) => f.key !== "VEICULOS").map((f) => (
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
            <Input type="number" name="dayOfMonth" min={1} max={31} defaultValue={initial?.dayOfMonth ?? 5} required />
            <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                name="anticipateToBusinessDay"
                value="true"
                defaultChecked={initial?.anticipateToBusinessDay ?? false}
                className="mt-0.5"
              />
              <span>
                Antecipar para o <strong>último dia útil</strong> quando cair em fim de semana ou
                feriado (padrão de guias de impostos: DAS, FGTS, DARF).
              </span>
            </label>
          </Field>
        ) : (
          <Field label="A cada quantos dias" required>
            <Input type="number" name="intervalDays" min={1} max={365} defaultValue={initial?.intervalDays ?? 15} required />
            <p className="mt-1 text-xs text-slate-400">Conta a partir da data em &quot;Começa em&quot;.</p>
          </Field>
        )}

        {isCapital ? (
          <Field label="Sócio (beneficiário)" required>
            <Select name="capitalBeneficiaryId" defaultValue={initial?.capitalBeneficiaryId ?? ""} required>
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
              <CategoryInput name="categoryLabel" options={despesaCategories} defaultValue={initial?.categoryLabel ?? "Despesa operacional"} />
            </Field>
            {supplierField("Fornecedor")}
          </>
        ) : null}

        {!isCapital && kind === "RECEBER" ? (
          <>
            <Field label="Categoria" required>
              <CategoryInput name="categoryLabel" options={receitaCategories} defaultValue={initial?.categoryLabel ?? "Outros"} />
            </Field>
            <Field label="Cliente">
              <Select name="customerId" defaultValue={initial?.customerId ?? ""}>
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
          <Input type="date" name="startDate" defaultValue={initial?.startDate ?? toDateInputValue(new Date())} required />
        </Field>
        <Field label="Termina em (opcional)">
          <Input type="date" name="endDate" defaultValue={initial?.endDate ?? ""} />
        </Field>
      </div>

      <Field label="Observações">
        <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : editing ? "Salvar alterações" : "Salvar recorrência"}
        </Button>
      </div>
    </form>
  );
}
