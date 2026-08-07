"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import CategoryInput from "@/components/CategoryInput";
import SupplierInput from "@/components/SupplierInput";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { formatCurrency, formatDate } from "@/lib/format";
import { createFromBankTxnAction, type BankTxn } from "./actions";

type Option = { id: string; name: string };
type Vehicle = { id: string; label: string };

/**
 * Formulário completo para lançar uma linha do extrato que ainda não existe no
 * sistema — os mesmos campos de "Nova conta a pagar" (fluxo, veículo/sócio,
 * categoria, fornecedor...), em vez de criar um lançamento genérico. O título
 * nasce PAGO/RECEBIDO na data e na conta do extrato.
 */
export default function CreateEntryForm({
  txn,
  accountName,
  accountId,
  supplierNames,
  customers,
  vehicles,
  beneficiaries,
  costCenters,
  categories,
  onClose,
  onCreated,
}: {
  txn: BankTxn;
  accountName: string;
  accountId: string;
  supplierNames: string[];
  customers: Option[];
  vehicles: Vehicle[];
  beneficiaries: Option[];
  costCenters: Option[];
  categories: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const isOut = txn.amount < 0;
  const [flow, setFlow] = useState("ADMINISTRATIVO");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isCapital = flow === "CAPITAL";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => (fd.get(k) as string | null)?.trim() || undefined;
    setError(null);
    startTransition(async () => {
      const res = await createFromBankTxnAction({
        fitId: txn.fitId,
        date: txn.date,
        amount: txn.amount,
        description: get("description") || txn.memo,
        categoryLabel: get("categoryLabel") || "",
        documentNumber: get("documentNumber"),
        structuralKey: flow,
        vehicleId: flow === "VEICULOS" ? get("vehicleId") : undefined,
        capitalBeneficiaryId: isCapital ? get("capitalBeneficiaryId") : undefined,
        costCenterId: isCapital ? undefined : get("costCenterId"),
        supplierName: isOut ? get("supplierName") : undefined,
        customerId: isOut ? undefined : get("customerId"),
        notes: get("notes"),
        accountId,
      });
      if (!res.ok) {
        setError(res.error || "Não foi possível criar o lançamento.");
        return;
      }
      onCreated();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-base font-semibold text-slate-900">
            {isOut ? "Lançar conta paga" : "Lançar recebimento"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {formatDate(txn.date)} ·{" "}
            <span className={isOut ? "text-rose-600" : "text-emerald-600"}>
              {formatCurrency(txn.amount)}
            </span>{" "}
            · {accountName}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            O lançamento entra já {isOut ? "pago" : "recebido"}, com a data do extrato
            ({formatDate(txn.date)}) e nessa conta. Valor e data vêm do banco e não mudam aqui.
          </p>
        </div>

        <form onSubmit={submit} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <Field label="Descrição" required>
            <Input name="description" required defaultValue={txn.memo.slice(0, 180)} />
          </Field>

          <Field label="Fluxo (obra estrutural)">
            <Select name="structuralKey" value={flow} onChange={(e) => setFlow(e.target.value)}>
              {STRUCTURAL_FLOWS.filter((f) => isOut || f.key !== "VEICULOS").map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>

          {isOut && flow === "VEICULOS" ? (
            <Field label="Veículo (opcional)">
              <Select name="vehicleId" defaultValue="">
                <option value="">Nenhum — entra como Administrativo</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-400">
                O valor entra no custo desse veículo (ou como despesa pós-venda, se já vendido).
              </p>
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
              <p className="mt-1 text-xs text-slate-400">
                {isOut
                  ? "A baixa gera a retirada do capital desse sócio."
                  : "O recebimento gera o aporte no capital desse sócio."}
              </p>
            </Field>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Categoria" required>
              <CategoryInput name="categoryLabel" options={categories} defaultValue="Outros" />
            </Field>
            {isOut ? (
              <Field label={isCapital ? "Fornecedor (opcional)" : "Fornecedor"} required={!isCapital}>
                <SupplierInput name="supplierName" suppliers={supplierNames} required={!isCapital} />
                <p className="mt-1 text-xs text-slate-400">
                  {isCapital
                    ? "A quem o valor foi pago. Em branco se foi ao próprio beneficiário."
                    : "Numa tarifa bancária, escolha o próprio banco."}
                </p>
              </Field>
            ) : (
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
            )}
            <Field label="Nº do documento">
              <Input name="documentNumber" placeholder="Nota fiscal, recibo, boleto..." />
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

          <Field label="Observações">
            <Textarea name="notes" rows={2} />
          </Field>

          <div className="flex justify-end gap-2 pb-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : isOut ? "Lançar conta paga" : "Lançar recebimento"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
