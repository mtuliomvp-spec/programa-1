"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import CategoryInput from "@/components/CategoryInput";
import SupplierInput from "@/components/SupplierInput";
import NewSupplierInline from "@/components/NewSupplierInline";
import NewCustomerInline from "@/components/NewCustomerInline";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { createCashEntryAction, type CashEntryState } from "./actions";

type Account = { id: string; name: string };
type Vehicle = { id: string; label: string };
type Beneficiary = { id: string; name: string; applied?: number; free?: number };
type Customer = { id: string; name: string };

const initial: CashEntryState = {};

export default function CashEntryForm({
  accounts,
  supplierNames,
  vehicles,
  beneficiaries,
  customers,
  categories,
  defaultDate,
  lockedDate = false,
  preselectedAccountId,
}: {
  accounts: Account[];
  supplierNames: string[];
  vehicles: Vehicle[];
  beneficiaries: Beneficiary[];
  customers: Customer[];
  categories: string[];
  defaultDate: string;
  lockedDate?: boolean;
  preselectedAccountId?: string;
}) {
  const [state, formAction, pending] = useActionState(createCashEntryAction, initial);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"entrada" | "saida">("saida");
  const [flow, setFlow] = useState<string>("ADMINISTRATIVO");
  const [supplierName, setSupplierName] = useState("");
  const [newSupplier, setNewSupplier] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [amount, setAmount] = useState("");
  const [capitalBeneficiaryId, setCapitalBeneficiaryId] = useState("");
  const [description, setDescription] = useState("");
  const [customerList, setCustomerList] = useState(customers);
  const [customerId, setCustomerId] = useState("");
  const [newCustomer, setNewCustomer] = useState(false);
  const lastAutoDesc = useRef("");
  const formRef = useRef<HTMLFormElement>(null);

  // É sinal de veículo? Entrada, fluxo Veículos e veículo selecionado.
  const isSinal = kind === "entrada" && flow === "VEICULOS" && !!vehicleId;

  // Preenche a descrição automaticamente para o sinal (mantém editável e não
  // sobrescreve o que o usuário digitou manualmente).
  useEffect(() => {
    const label = vehicles.find((v) => v.id === vehicleId)?.label ?? "";
    const auto = isSinal && label ? `Sinal / entrada antecipada - ${label}` : "";
    setDescription((prev) => {
      if (auto) return prev === "" || prev === lastAutoDesc.current ? auto : prev;
      return prev === lastAutoDesc.current ? "" : prev;
    });
    lastAutoDesc.current = auto;
  }, [isSinal, vehicleId, vehicles]);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setKind("saida");
      setFlow("ADMINISTRATIVO");
      setSupplierName("");
      setNewSupplier(false);
      setVehicleId("");
      setAmount("");
      setCapitalBeneficiaryId("");
      setDescription("");
      setCustomerId("");
      setNewCustomer(false);
      lastAutoDesc.current = "";
    }
  }, [state.ok]);

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Cadastre uma conta financeira (caixa/banco) para poder lançar no movimento de caixa.
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} className="print:hidden">
        ➕ Novo lançamento
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold text-slate-800">Novo lançamento no caixa</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          Fechar
        </button>
      </div>

      {state.error ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Lançamento registrado. Pode adicionar outro.
        </p>
      ) : null}

      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              kind === "entrada"
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-500"
            }`}
          >
            <input
              type="radio"
              name="kind"
              value="entrada"
              className="sr-only"
              checked={kind === "entrada"}
              onChange={() => setKind("entrada")}
            />
            📥 Entrada
          </label>
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              kind === "saida"
                ? "border-rose-400 bg-rose-50 text-rose-700"
                : "border-slate-200 text-slate-500"
            }`}
          >
            <input
              type="radio"
              name="kind"
              value="saida"
              className="sr-only"
              checked={kind === "saida"}
              onChange={() => setKind("saida")}
            />
            📤 Saída
          </label>
        </div>

        <Field label="Descrição" required>
          <Input
            name="description"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Tarifa bancária / Venda de sucata"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" required>
            <Input
              name="amount"
              type="number"
              step="0.01"
              min={0.01}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          {lockedDate ? (
            <Field label="Data">
              {/* Travada na data do caixa aberto: o valor enviado é fixo. */}
              <input type="hidden" name="date" value={defaultDate} />
              <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                {formatDate(defaultDate)}
                <span className="ml-2 text-xs text-slate-400">(caixa aberto)</span>
              </div>
            </Field>
          ) : (
            <Field label="Data" required>
              <Input name="date" type="date" defaultValue={defaultDate} required />
            </Field>
          )}
        </div>

        <Field label="Conta" required>
          <Select name="accountId" defaultValue={preselectedAccountId || accounts[0]?.id} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
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
          <Field
            label={
              kind === "entrada"
                ? "Veículo — sinal / entrada antecipada"
                : "Veículo (opcional)"
            }
          >
            <Select
              name="vehicleId"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              <option value="">
                {kind === "entrada" ? "Nenhum (receita geral de veículos)" : "Nenhum (custo geral de veículos)"}
              </option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </Select>
            {vehicles.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">Nenhum veículo em estoque.</p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">
                {kind === "entrada"
                  ? "Escolhendo um veículo, o valor entra como SINAL / entrada antecipada dele e é abatido quando a venda for fechada."
                  : "O valor entra no custo pago desse veículo. Se já foi vendido (vendido), entra como despesa pós-venda (centro Administrativo)."}
              </p>
            )}
          </Field>
        ) : null}

        {kind === "entrada" ? (
          <Field label={isSinal ? "Cliente que está dando o sinal" : "Cliente (opcional)"}>
            <Select name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Selecione o cliente (opcional)</option>
              {customerList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setNewCustomer((v) => !v)}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                {newCustomer ? "Fechar" : "➕ Cadastrar cliente"}
              </button>
            </div>
            {newCustomer ? (
              <NewCustomerInline
                onCreated={(c) => {
                  setCustomerList((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
                  setCustomerId(c.id);
                  setNewCustomer(false);
                }}
              />
            ) : null}
          </Field>
        ) : null}

        {flow === "CAPITAL" ? (
          <Field label="Beneficiário do capital" required>
            <Select
              name="capitalBeneficiaryId"
              value={capitalBeneficiaryId}
              onChange={(e) => setCapitalBeneficiaryId(e.target.value)}
              required
            >
              <option value="">Selecione o beneficiário</option>
              {beneficiaries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-400">
              {kind === "entrada" ? "Entrada no Capital = aporte do beneficiário." : "De quem é o capital."}
            </p>
            {beneficiaries.length === 0 ? (
              <p className="mt-1 text-xs text-amber-600">
                Nenhum beneficiário cadastrado. Cadastre em Capital.
              </p>
            ) : null}
            {(() => {
              // Aviso (não bloqueia): saque de capital acima do capital livre do
              // sócio — parte está aplicada numa conta de Aplicação.
              if (kind !== "saida") return null;
              const b = beneficiaries.find((x) => x.id === capitalBeneficiaryId);
              const applied = b?.applied ?? 0;
              const free = b?.free ?? 0;
              const val = Number(amount) || 0;
              if (!b || applied <= 0 || val <= free) return null;
              return (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ⚠️ <strong>{b.name}</strong> tem <strong>{formatCurrency(applied)}</strong> aplicado.
                  O capital livre dele é <strong>{formatCurrency(free)}</strong>. Se este saque é do
                  dinheiro aplicado, considere usar{" "}
                  <Link href={`/capital/${b.id}`} className="font-semibold underline">
                    Sacar com substituição
                  </Link>{" "}
                  (Capital → {b.name}). Você pode seguir mesmo assim.
                </div>
              );
            })()}
          </Field>
        ) : null}

        {kind === "saida" ? (
          <>
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
                  {flow === "CAPITAL"
                    ? "A quem o valor foi pago."
                    : "Numa tarifa bancária, escolha o próprio banco."}
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
          </>
        ) : null}

        <Field label="Observações">
          <Textarea name="notes" rows={2} />
        </Field>

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Lançando..." : "Lançar no caixa"}
        </Button>
      </form>
    </div>
  );
}
