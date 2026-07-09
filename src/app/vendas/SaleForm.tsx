"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createSaleAction, type SaleFormState } from "./actions";
import { toDateInputValue, formatCurrency } from "@/lib/format";

type Vehicle = { id: string; brand: string; model: string; plate: string; salePrice: number };
type Customer = { id: string; name: string };

const initialState: SaleFormState = {};

export default function SaleForm({
  vehicles,
  customers,
  preselectedVehicleId,
}: {
  vehicles: Vehicle[];
  customers: Customer[];
  preselectedVehicleId?: string;
}) {
  const [state, formAction, pending] = useActionState(createSaleAction, initialState);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || "");
  const [paymentMethod, setPaymentMethod] = useState<"A_VISTA" | "PARCELADO" | "FINANCIADO">("A_VISTA");

  const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);
  const [totalAmount, setTotalAmount] = useState<string>(
    selectedVehicle ? String(selectedVehicle.salePrice) : "",
  );

  function handleVehicleChange(id: string) {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) setTotalAmount(String(v.salePrice));
  }

  if (vehicles.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Não há veículos disponíveis para venda no estoque. Cadastre ou libere um veículo primeiro.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Veículo" required>
          <Select name="vehicleId" value={vehicleId} onChange={(e) => handleVehicleChange(e.target.value)} required>
            <option value="">Selecione um veículo</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.brand} {v.model} - {v.plate} ({formatCurrency(v.salePrice)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cliente" required>
          <Select name="customerId" required defaultValue="">
            <option value="">Selecione um cliente</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {customers.length === 0 ? (
            <p className="mt-1 text-xs text-amber-600">
              Nenhum cliente cadastrado. <a href="/clientes/novo" className="underline">Cadastrar cliente</a>
            </p>
          ) : null}
        </Field>
        <Field label="Data da venda" required>
          <Input type="date" name="saleDate" defaultValue={toDateInputValue(new Date())} required />
        </Field>
        <Field label="Valor total da venda" required>
          <Input
            type="number"
            step="0.01"
            min={0.01}
            name="totalAmount"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="Vendedor">
          <Input name="sellerName" />
        </Field>
        <Field label="Forma de pagamento" required>
          <Select
            name="paymentMethod"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
          >
            <option value="A_VISTA">À vista</option>
            <option value="PARCELADO">Parcelado (carnê da loja)</option>
            <option value="FINANCIADO">Financiado (banco/financeira)</option>
          </Select>
        </Field>
      </div>

      {paymentMethod === "PARCELADO" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Detalhes do parcelamento</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Valor de entrada">
              <Input type="number" step="0.01" min={0} name="downPayment" defaultValue={0} />
            </Field>
            <Field label="Número de parcelas" required>
              <Input type="number" min={1} name="installmentsCount" defaultValue={1} required />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            A entrada é lançada como recebida imediatamente; as demais parcelas são lançadas em Contas a Receber com vencimento mensal.
          </p>
        </div>
      ) : null}

      {paymentMethod === "FINANCIADO" ? (
        <p className="text-xs text-slate-500">
          Será gerada uma conta a receber referente ao repasse do banco/financeira, com vencimento em 5 dias.
        </p>
      ) : null}

      {paymentMethod === "A_VISTA" ? (
        <p className="text-xs text-slate-500">O valor total será lançado como recebido na data da venda.</p>
      ) : null}

      <Field label="Observações">
        <Textarea name="notes" rows={3} />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando..." : "Registrar venda"}
        </Button>
      </div>
    </form>
  );
}
