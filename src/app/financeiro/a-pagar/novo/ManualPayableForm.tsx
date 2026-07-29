"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import CategoryInput from "@/components/CategoryInput";
import SupplierInput from "@/components/SupplierInput";
import NewSupplierInline from "@/components/NewSupplierInline";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { createManualPayableAction, type ManualPayableState } from "../actions";
import { toDateInputValue } from "@/lib/format";

type CostCenter = { id: string; name: string };
type Vehicle = { id: string; label: string };
type Beneficiary = { id: string; name: string };

export default function ManualPayableForm({
  supplierNames,
  costCenters,
  vehicles,
  beneficiaries,
  categories,
}: {
  supplierNames: string[];
  costCenters: CostCenter[];
  vehicles: Vehicle[];
  beneficiaries: Beneficiary[];
  categories: string[];
}) {
  const [state, formAction, pending] = useActionState(createManualPayableAction, {} as ManualPayableState);
  const [paymentMode, setPaymentMode] = useState<"A_VISTA" | "PARCELADO">("A_VISTA");
  const [installmentPeriod, setInstallmentPeriod] = useState<"MENSAL" | "DIAS">("MENSAL");
  const [flow, setFlow] = useState<string>("ADMINISTRATIVO");
  const [supplierName, setSupplierName] = useState("");
  const [newSupplier, setNewSupplier] = useState(false);
  const isCapital = flow === "CAPITAL";

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div>
      ) : null}
      <Field label="Descrição" required>
        <Input name="description" required placeholder="Ex: Aluguel do salão de vendas" />
      </Field>

      <Field label="Fluxo (obra estrutural)">
        <Select name="structuralKey" value={flow} onChange={(e) => setFlow(e.target.value)}>
          {STRUCTURAL_FLOWS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.name}
            </option>
          ))}
        </Select>
      </Field>

      {flow === "VEICULOS" ? (
        <Field label="Veículo (opcional)">
          <Select name="vehicleId" defaultValue="">
            <option value="">Nenhum (custo geral de veículos)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
          {vehicles.length > 0 ? (
            <p className="mt-1 text-xs text-slate-400">
              O valor entra no custo desse veículo. Se já foi vendido (vendido),
              entra como despesa pós-venda (centro Administrativo).
            </p>
          ) : null}
        </Field>
      ) : null}

      {isCapital ? (
        <Field label="Beneficiário do capital" required>
          <Select name="capitalBeneficiaryId" defaultValue="" required>
            <option value="">Selecione o beneficiário</option>
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Categoria" required>
          <CategoryInput name="categoryLabel" options={categories} defaultValue="Outros" />
        </Field>
        <Field label="Fornecedor" required>
          <SupplierInput
            name="supplierName"
            suppliers={supplierNames}
            value={supplierName}
            onValueChange={setSupplierName}
            required
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">
              {isCapital ? "A quem o valor foi pago." : "Numa tarifa bancária, escolha o próprio banco."}
            </p>
            <button
              type="button"
              onClick={() => setNewSupplier((v) => !v)}
              className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
            >
              {newSupplier ? "Fechar" : "➕ Cadastrar fornecedor"}
            </button>
          </div>
          {newSupplier ? (
            <NewSupplierInline
              onCreated={(nm) => {
                setSupplierName(nm);
                setNewSupplier(false);
              }}
            />
          ) : null}
        </Field>
        <Field label="Nº do documento">
          <Input name="documentNumber" placeholder="Nota fiscal, fatura, boleto..." />
        </Field>
        <Field label="Forma">
          <Select
            name="paymentMode"
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as "A_VISTA" | "PARCELADO")}
          >
            <option value="A_VISTA">À vista (título único)</option>
            <option value="PARCELADO">Parcelado</option>
          </Select>
        </Field>
        <Field label={paymentMode === "PARCELADO" ? "Valor total (soma das parcelas)" : "Valor"} required>
          <Input type="number" step="0.01" min={0.01} name="amount" required />
        </Field>
        {paymentMode === "PARCELADO" ? (
          <>
            <Field label="Número de parcelas" required>
              <Input type="number" step="1" min={2} name="installmentsCount" required placeholder="Ex: 3" />
            </Field>
            <Field label="Vencimentos">
              <Select
                name="installmentPeriod"
                value={installmentPeriod}
                onChange={(e) => setInstallmentPeriod(e.target.value as "MENSAL" | "DIAS")}
              >
                <option value="MENSAL">Todo mês (mesmo dia do 1º vencimento)</option>
                <option value="DIAS">Periódico — a cada X dias</option>
              </Select>
            </Field>
            {installmentPeriod === "DIAS" ? (
              <Field label="A cada quantos dias?" required>
                <Input type="number" step="1" min={1} name="installmentDays" defaultValue="30" required placeholder="Ex: 15, 20, 30..." />
              </Field>
            ) : null}
          </>
        ) : null}
        <Field
          label={
            paymentMode === "PARCELADO"
              ? installmentPeriod === "DIAS"
                ? "1º vencimento (demais a cada X dias)"
                : "1º vencimento (demais a cada mês)"
              : "Vencimento"
          }
          required
        >
          <Input type="date" name="dueDate" defaultValue={toDateInputValue(new Date())} required />
        </Field>
        {!isCapital ? (
          <Field label="Centro de custo (obra, imóvel...)">
            <Select name="costCenterId" defaultValue="">
              <option value="">Nenhum (usa o fluxo acima)</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <p className="text-xs text-slate-400">
        O título nasce pendente — a baixa é feita em Contas a pagar (na data do caixa) conforme for pago.
      </p>
      <Field label="Observações">
        <Textarea name="notes" rows={3} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Lançar conta"}
        </Button>
      </div>
    </form>
  );
}
