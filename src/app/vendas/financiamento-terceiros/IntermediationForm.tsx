"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { lookupPlateAction } from "@/app/estoque/actions";
import { toDateInputValue, formatCurrency } from "@/lib/format";
import { computeReturn, retornoLabel } from "@/lib/retorno";
import { createIntermediationAction } from "./actions";
import type { IntermediationFormState } from "./core";

type Customer = { id: string; name: string };
type Financer = { id: string; name: string; returnTaxPercent: number; sellerReturnPercent: number };
type UserOption = { id: string; name: string };

const initialState: IntermediationFormState = {};

export default function IntermediationForm({
  customers,
  financers,
  users,
}: {
  customers: Customer[];
  financers: Financer[];
  users: UserOption[];
}) {
  const [state, formAction, pending] = useActionState(createIntermediationAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [looking, startLookup] = useTransition();
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);

  const [financing, setFinancing] = useState(0);
  const [refund, setRefund] = useState(0);
  const [commission, setCommission] = useState(0);
  const [transferCharged, setTransferCharged] = useState(false);
  const [transferAmount, setTransferAmount] = useState(0);
  const [financerId, setFinancerId] = useState("");
  const [returnLevel, setReturnLevel] = useState(0);
  const [takeReturnCommission, setTakeReturnCommission] = useState(false);
  const [referrals, setReferrals] = useState<{ name: string; amount: number }[]>([]);

  const financer = financers.find((f) => f.id === financerId) || null;

  // Retorno líquido previsto (após imposto) e comissão do vendedor sobre ele.
  const retorno = useMemo(() => {
    if (!financer || returnLevel <= 0 || financing <= 0) return null;
    return computeReturn(financing, returnLevel, financer.returnTaxPercent);
  }, [financer, returnLevel, financing]);
  const returnSellerCommission =
    takeReturnCommission && retorno && financer && financer.sellerReturnPercent > 0
      ? Math.round(retorno.net * (financer.sellerReturnPercent / 100) * 100) / 100
      : 0;

  const referralsTotal = referrals.reduce((s, r) => s + (r.amount || 0), 0);
  const grossProfit = Math.max(0, financing - refund); // lucro bruto (F − D)
  const netProfit =
    grossProfit -
    (commission || 0) -
    (transferCharged ? transferAmount || 0 : 0) -
    referralsTotal -
    returnSellerCommission +
    (retorno ? retorno.net : 0);

  function setField(name: string, value: string | undefined) {
    if (!value) return;
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement) el.value = value;
  }

  function handlePlateLookup() {
    const el = formRef.current?.elements.namedItem("plate");
    const plate = el instanceof HTMLInputElement ? el.value.trim() : "";
    if (!plate) {
      setLookupMsg("Digite a placa antes de buscar.");
      return;
    }
    setLookupMsg(null);
    startLookup(async () => {
      const r = await lookupPlateAction(plate);
      if (!r.ok) {
        setLookupMsg(r.error || "Não foi possível consultar a placa.");
        return;
      }
      const d = r.data;
      setField("brand", d.brand);
      setField("model", d.model);
      setField("manufactureYear", d.manufactureYear ? String(d.manufactureYear) : undefined);
      setField("modelYear", d.modelYear ? String(d.modelYear) : undefined);
      setField("color", d.color);
      setField("chassi", d.chassi);
      setField("fuel", d.fuel);
      setLookupMsg(`Dados encontrados: ${d.brand ?? ""} ${d.model ?? ""}. Confira e complete.`);
    });
  }

  function setReferral(i: number, field: "name" | "amount", value: string) {
    setReferrals((rows) =>
      rows.map((r, idx) =>
        idx === i ? { ...r, [field]: field === "amount" ? Number(value) || 0 : value } : r,
      ),
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="referrals" value={JSON.stringify(referrals.filter((r) => r.name || r.amount > 0))} />

      {/* Proprietário do documento (VENDEDOR) */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          Proprietário do documento (Vendedor)
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome do proprietário" required>
            <Input name="ownerName" required placeholder="Quem é o dono do veículo/documento" />
          </Field>
          <Field label="CPF/CNPJ">
            <Input name="ownerDocument" placeholder="Documento do proprietário" />
          </Field>
          <Field label="Telefone">
            <Input name="ownerPhone" />
          </Field>
          <Field label="Endereço">
            <Input name="ownerAddress" />
          </Field>
        </div>
      </fieldset>

      {/* Veículo do terceiro */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Veículo (de terceiro)</legend>
        <Field label="Placa" required>
          <div className="flex flex-wrap gap-2">
            <Input name="plate" required placeholder="ABC1D23" className="max-w-[180px] uppercase" />
            <Button type="button" variant="secondary" onClick={handlePlateLookup} disabled={looking}>
              {looking ? "Buscando..." : "🔍 Buscar dados pela placa"}
            </Button>
          </div>
          {lookupMsg ? <p className="mt-1 text-xs text-slate-500">{lookupMsg}</p> : null}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Marca" required>
            <Input name="brand" required />
          </Field>
          <Field label="Modelo" required>
            <Input name="model" required />
          </Field>
          <Field label="Versão">
            <Input name="version" />
          </Field>
          <Field label="Cor">
            <Input name="color" />
          </Field>
          <Field label="Ano fab." required>
            <Input name="manufactureYear" type="number" required defaultValue={new Date().getFullYear()} />
          </Field>
          <Field label="Ano modelo" required>
            <Input name="modelYear" type="number" required defaultValue={new Date().getFullYear()} />
          </Field>
          <Field label="KM">
            <Input name="km" type="number" min={0} defaultValue={0} />
          </Field>
          <Field label="Combustível">
            <Input name="fuel" />
          </Field>
          <Field label="Câmbio">
            <Input name="transmission" />
          </Field>
          <Field label="Chassi">
            <Input name="chassi" />
          </Field>
        </div>
      </fieldset>

      {/* Cliente e valores */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Operação</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cliente (comprador/financiado)" required>
            <Select name="customerId" required defaultValue="">
              <option value="" disabled>
                Selecione o cliente
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data" required>
            <Input name="saleDate" type="date" required defaultValue={toDateInputValue(new Date())} />
          </Field>
          <Field label="Valor do financiamento (F)" required>
            <Input
              name="financingAmount"
              type="number"
              step="0.01"
              min={0}
              required
              value={financing || ""}
              onChange={(e) => setFinancing(Number(e.target.value) || 0)}
              placeholder="Valor liberado pelo banco"
            />
          </Field>
          <Field label="Devolução de financiamento (ao cliente)">
            <Input
              name="refundAmount"
              type="number"
              step="0.01"
              min={0}
              value={refund || ""}
              onChange={(e) => setRefund(Number(e.target.value) || 0)}
              placeholder="Quanto será devolvido ao cliente"
            />
          </Field>
          <Field label="Financeira (banco)" required>
            <Select
              name="financerAccountId"
              required
              value={financerId}
              onChange={(e) => setFinancerId(e.target.value)}
            >
              <option value="" disabled>
                Selecione a financeira
              </option>
              {financers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Retorno da financeira">
            <Select
              name="returnLevel"
              value={String(returnLevel)}
              onChange={(e) => setReturnLevel(Number(e.target.value) || 0)}
            >
              <option value="0">Sem retorno</option>
              {[1, 2, 3, 4, 5].map((lvl) => (
                <option key={lvl} value={lvl}>
                  {retornoLabel(lvl)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {retorno && financer && financer.sellerReturnPercent > 0 ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="takeReturnCommission"
              value="true"
              checked={takeReturnCommission}
              onChange={(e) => setTakeReturnCommission(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Pagar comissão do retorno ao vendedor ({financer.sellerReturnPercent.toLocaleString("pt-BR")}% do
            líquido)
          </label>
        ) : null}
      </fieldset>

      {/* Vendedor / comissões */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Vendedor e despesas</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Vendedor">
            <Select name="sellerId" defaultValue="">
              <option value="">— Nenhum —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comissão do vendedor (R$)">
            <Input
              name="commissionAmount"
              type="number"
              step="0.01"
              min={0}
              value={commission || ""}
              onChange={(e) => setCommission(Number(e.target.value) || 0)}
              placeholder="0,00 — opcional"
            />
          </Field>
        </div>
        <Field label="Transferência (DETRAN)">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="transferCharged"
              value="true"
              checked={transferCharged}
              onChange={(e) => setTransferCharged(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Transferência cobrada
          </label>
          {transferCharged ? (
            <Input
              type="number"
              step="0.01"
              min={0}
              name="transferAmount"
              value={transferAmount || ""}
              onChange={(e) => setTransferAmount(Number(e.target.value) || 0)}
              placeholder="Valor da transferência (R$)"
              className="mt-2"
            />
          ) : null}
        </Field>
        {referrals.map((row, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label={`Indicação ${i + 1} — nome`}>
              <Input value={row.name} onChange={(e) => setReferral(i, "name", e.target.value)} />
            </Field>
            <Field label="Valor (R$)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={row.amount || ""}
                onChange={(e) => setReferral(i, "amount", e.target.value)}
              />
            </Field>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setReferrals((r) => [...r, { name: "", amount: 0 }])}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          + Adicionar indicação
        </button>
        <Field label="Observações">
          <Textarea name="notes" rows={2} />
        </Field>
      </fieldset>

      {/* Resumo do lucro */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-600">Lucro bruto (financiamento − devolução)</span>
          <span className="tabular-nums font-medium">{formatCurrency(grossProfit)}</span>
        </div>
        {retorno ? (
          <div className="mt-1 flex items-center justify-between text-emerald-700">
            <span>+ Retorno líquido da financeira</span>
            <span className="tabular-nums">{formatCurrency(retorno.net)}</span>
          </div>
        ) : null}
        {commission > 0 ? (
          <div className="mt-1 flex items-center justify-between text-rose-600">
            <span>− Comissão do vendedor</span>
            <span className="tabular-nums">{formatCurrency(commission)}</span>
          </div>
        ) : null}
        {transferCharged && transferAmount > 0 ? (
          <div className="mt-1 flex items-center justify-between text-rose-600">
            <span>− Transferência (DETRAN)</span>
            <span className="tabular-nums">{formatCurrency(transferAmount)}</span>
          </div>
        ) : null}
        {referralsTotal > 0 ? (
          <div className="mt-1 flex items-center justify-between text-rose-600">
            <span>− Indicações</span>
            <span className="tabular-nums">{formatCurrency(referralsTotal)}</span>
          </div>
        ) : null}
        {returnSellerCommission > 0 ? (
          <div className="mt-1 flex items-center justify-between text-rose-600">
            <span>− Comissão do retorno</span>
            <span className="tabular-nums">{formatCurrency(returnSellerCommission)}</span>
          </div>
        ) : null}
        <div className="mt-2 flex items-center justify-between border-t border-slate-300 pt-2 font-semibold">
          <span>Lucro sobre financiamento de terceiros</span>
          <span className={`tabular-nums ${netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
            {formatCurrency(netProfit)}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando..." : "Registrar financiamento de terceiros"}
        </Button>
      </div>
    </form>
  );
}
