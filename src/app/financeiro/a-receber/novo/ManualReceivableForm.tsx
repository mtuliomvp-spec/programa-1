"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { createManualReceivableAction, type ManualReceivableState } from "../actions";
import { formatCurrency, toDateInputValue } from "@/lib/format";

type Customer = { id: string; name: string };
type CostCenter = { id: string; name: string };
type Beneficiary = { id: string; name: string };
type VehicleOption = { id: string; label: string };
type AccountOption = { id: string; name: string };
type SellerOption = { id: string; name: string };

export default function ManualReceivableForm({
  customers,
  costCenters,
  beneficiaries,
  vehicles = [],
  accounts = [],
  sellers = [],
}: {
  customers: Customer[];
  costCenters: CostCenter[];
  beneficiaries: Beneficiary[];
  /** Carros em estoque (fluxo Veículos = entrada/sinal do carro). */
  vehicles?: VehicleOption[];
  accounts?: AccountOption[];
  /** Usuários ativos: a "parte do vendedor" vira comissão a pagar a um deles. */
  sellers?: SellerOption[];
}) {
  const [state, formAction, pending] = useActionState(createManualReceivableAction, {} as ManualReceivableState);
  const [alreadyReceived, setAlreadyReceived] = useState(false);
  // Fluxo controlado: no CAPITAL o título vira aporte de um sócio na baixa, e
  // é preciso dizer de quem — sem isso o dinheiro entrava no caixa sem entrar
  // no capital de ninguém.
  const [flow, setFlow] = useState("ADMINISTRATIVO");
  const isCapital = flow === "CAPITAL";
  const isVeiculo = flow === "VEICULOS";
  // Parte do vendedor: só para receita da loja (não para aporte nem sinal).
  const [valor, setValor] = useState(0);
  const [vendedorId, setVendedorId] = useState("");
  const [parteVendedor, setParteVendedor] = useState(0);
  const comParte = !isCapital && !isVeiculo;
  const vendedorNome = sellers.find((v) => v.id === vendedorId)?.name;

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div>
      ) : null}
      <Field label="Descrição" required>
        <Input name="description" required placeholder="Ex: Devolução / reembolso de fornecedor" />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <Field label="Valor" required>
          <MoneyInput name="amount" required onValueChange={setValor} />
        </Field>
        <Field label="Vencimento" required>
          <Input type="date" name="dueDate" defaultValue={toDateInputValue(new Date())} required />
        </Field>
        <Field label="Fluxo (obra estrutural)">
          {/* Veículos: entrada (sinal) de um carro em estoque — pede o carro. */}
          <Select name="structuralKey" value={flow} onChange={(e) => setFlow(e.target.value)}>
            {STRUCTURAL_FLOWS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        {isCapital ? (
          <Field label="Sócio (beneficiário do capital)" required>
            <Select name="capitalBeneficiaryId" defaultValue="" required>
              <option value="">Selecione o sócio</option>
              {beneficiaries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-400">
              Ao receber, o valor entra como <strong>aporte</strong> deste sócio no Capital.
            </p>
          </Field>
        ) : null}
        {isVeiculo ? (
          <>
            <Field label="Veículo" required>
              <Select name="vehicleId" defaultValue="" required>
                <option value="">Selecione o veículo</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Conta em que vai cair" required>
              <Select name="accountId" defaultValue={accounts[0]?.id ?? ""} required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Vira a <strong>entrada (sinal) do veículo</strong>: aparece na ficha do carro como
              &quot;Aguardando crédito&quot;, o caixa pede o crédito no dia do vencimento e, ao fechar a
              venda, o valor é abatido do que o cliente tem a pagar. Não conta como receita.
            </p>
          </>
        ) : null}
        <Field label="Centro de custo (obra, imóvel...)">
          <Select name="costCenterId" defaultValue="" disabled={isVeiculo}>
            <option value="">Nenhum (usa o fluxo acima)</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {comParte ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3" data-guia="areceber.partevendedor">
          <div>
            <p className="text-sm font-medium text-slate-700">Parte do vendedor (opcional)</p>
            <p className="text-xs text-slate-500">
              Quando uma parte deste valor é do vendedor. O valor inteiro entra como receita da loja e a parte
              dele vira um título de <strong>Comissão</strong>{" "}no Contas a pagar, em nome dele (aparece em
              &quot;Minhas comissões&quot;).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Vendedor">
              <Select name="sellerId" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
                <option value="">Sem parte de vendedor</option>
                {sellers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </Field>
            {vendedorId ? (
              <>
                <Field label="Valor da parte dele" required>
                  <MoneyInput name="sellerAmount" required onValueChange={setParteVendedor} />
                </Field>
                <Field label="Pagar ao vendedor em">
                  <Input type="date" name="sellerDueDate" defaultValue={toDateInputValue(new Date())} />
                </Field>
              </>
            ) : null}
          </div>
          {vendedorId && parteVendedor > 0 && valor > 0 ? (
            parteVendedor < valor ? (
              <p className="text-xs text-slate-600">
                Entra <strong>{formatCurrency(valor)}</strong> · {formatCurrency(parteVendedor)} de comissão a pagar a{" "}
                {vendedorNome} · a loja fica com <strong>{formatCurrency(valor - parteVendedor)}</strong>.
              </p>
            ) : (
              <p className="text-xs text-rose-600">A parte do vendedor tem de ser menor que o valor recebido.</p>
            )
          ) : null}
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          name="alreadyReceived"
          value="true"
          checked={alreadyReceived}
          onChange={(e) => setAlreadyReceived(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Já foi recebido
      </label>
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
