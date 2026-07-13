"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createSaleAction, type SaleFormState } from "./actions";
import { lookupPlateAction } from "@/app/estoque/actions";
import { toDateInputValue, formatCurrency } from "@/lib/format";
import BankInput from "@/components/BankInput";

type Vehicle = { id: string; brand: string; model: string; plate: string; salePrice: number };
type Customer = { id: string; name: string };

const initialState: SaleFormState = {};

export default function SaleForm({
  vehicles,
  customers,
  preselectedVehicleId,
  currentUserName,
}: {
  vehicles: Vehicle[];
  customers: Customer[];
  preselectedVehicleId?: string;
  currentUserName?: string;
}) {
  const [state, formAction, pending] = useActionState(createSaleAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || "");
  const [paymentMethod, setPaymentMethod] = useState<"A_VISTA" | "PARCELADO" | "FINANCIADO">("A_VISTA");

  const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);
  const [totalAmount, setTotalAmount] = useState<string>(
    selectedVehicle ? String(selectedVehicle.salePrice) : "",
  );

  // Troca (veículo recebido do cliente, cadastrado aqui mesmo)
  const [tradeIn, setTradeIn] = useState(false);
  const [tiNegotiated, setTiNegotiated] = useState(0);
  const [tiPayoff, setTiPayoff] = useState(0);
  const [tiDebts, setTiDebts] = useState(0);
  const tiLiquido = Math.max(0, Math.round((tiNegotiated - tiPayoff - tiDebts) * 100) / 100);
  const total = Number(totalAmount) || 0;
  const restante = Math.max(0, Math.round((total - tiLiquido) * 100) / 100);

  // Financiamento: valor financiado pelo banco e a entrada (restante) paga agora
  const [financedAmount, setFinancedAmount] = useState<string>("");
  const financed = Math.min(Number(financedAmount) || 0, restante);
  const entradaFinanciamento = Math.max(0, Math.round((restante - financed) * 100) / 100);
  const [tiLooking, startTiLookup] = useTransition();
  const [tiMsg, setTiMsg] = useState<string | null>(null);

  function setTiField(name: string, value: string | number | undefined) {
    if (value === undefined || value === "") return;
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement) el.value = String(value);
  }

  function handleTiLookup() {
    const el = formRef.current?.elements.namedItem("tiPlate");
    const plate = el instanceof HTMLInputElement ? el.value.trim() : "";
    if (!plate) {
      setTiMsg("Digite a placa do veículo da troca antes de buscar.");
      return;
    }
    setTiMsg(null);
    startTiLookup(async () => {
      const result = await lookupPlateAction(plate);
      if (!result.ok) {
        setTiMsg(result.error);
        return;
      }
      const dt = result.data;
      setTiField("tiBrand", dt.brand);
      setTiField("tiModel", dt.model);
      setTiField("tiManufactureYear", dt.manufactureYear);
      setTiField("tiModelYear", dt.modelYear ?? dt.manufactureYear);
      setTiField("tiColor", dt.color);
      setTiMsg(`Dados encontrados: ${[dt.brand, dt.model].filter(Boolean).join(" ")}.`);
    });
  }

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
    <form ref={formRef} action={formAction} className="space-y-6">
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
          <Input name="sellerName" defaultValue={currentUserName || ""} />
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
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Detalhes do financiamento</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Banco / financeira">
              <BankInput name="financerName" placeholder="Ex.: Banco Itaú, BV, Santander..." />
            </Field>
            <Field label="Valor financiado (repasse do banco)">
              <Input
                type="number"
                step="0.01"
                min={0}
                name="financedAmount"
                value={financedAmount}
                onChange={(e) => setFinancedAmount(e.target.value)}
                placeholder={String(restante)}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            O valor financiado vira uma conta a receber do banco/financeira (vencimento em 5 dias).
            {financedAmount === "" ? " Se ficar em branco, financia o valor total." : ""}
          </p>
          {financedAmount !== "" && entradaFinanciamento > 0 ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-sm">
              <p className="text-slate-600">
                Financiado <strong>{formatCurrency(financed)}</strong> · restante{" "}
                <strong className="text-emerald-700">
                  entrada paga agora {formatCurrency(entradaFinanciamento)}
                </strong>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                A entrada é lançada como recebida na data da venda; o restante é o repasse do banco.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {paymentMethod === "A_VISTA" ? (
        <p className="text-xs text-slate-500">O valor total será lançado como recebido na data da venda.</p>
      ) : null}

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="tradeIn"
            value="true"
            checked={tradeIn}
            onChange={(e) => setTradeIn(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Entrada por troca (o cliente está dando um veículo)
        </label>

        {tradeIn ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Placa do veículo recebido">
                <Input name="tiPlate" placeholder="ABC1D23" className="max-w-[160px] uppercase" />
              </Field>
              <Button type="button" variant="secondary" onClick={handleTiLookup} disabled={tiLooking}>
                {tiLooking ? "Buscando..." : "🔍 Buscar dados"}
              </Button>
            </div>
            {tiMsg ? <p className="text-sm font-medium text-emerald-700">{tiMsg}</p> : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Marca">
                <Input name="tiBrand" placeholder="Ex.: Volkswagen" />
              </Field>
              <Field label="Modelo">
                <Input name="tiModel" placeholder="Ex.: Gol" />
              </Field>
              <Field label="Cor">
                <Input name="tiColor" />
              </Field>
              <Field label="Ano fabricação">
                <Input type="number" name="tiManufactureYear" defaultValue={new Date().getFullYear()} />
              </Field>
              <Field label="Ano modelo">
                <Input type="number" name="tiModelYear" defaultValue={new Date().getFullYear()} />
              </Field>
              <Field label="Quilometragem">
                <Input type="number" name="tiKm" min={0} defaultValue={0} />
              </Field>
              <Field label="Valor negociado (avaliação)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="tiNegotiated"
                  value={tiNegotiated || ""}
                  onChange={(e) => setTiNegotiated(Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Saldo devedor / quitação">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="tiPayoff"
                  value={tiPayoff || ""}
                  onChange={(e) => setTiPayoff(Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="Banco / financeira da quitação">
                <BankInput name="tiPayoffTo" placeholder="Ex.: Banco XPTO" />
              </Field>
              <Field label="Débitos do veículo (IPVA, multas...)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="tiDebts"
                  value={tiDebts || ""}
                  onChange={(e) => setTiDebts(Number(e.target.value) || 0)}
                />
              </Field>
            </div>

            <div className="rounded-lg border border-amber-300 bg-white p-3 text-sm">
              <p className="text-slate-600">
                Avaliação <strong>{formatCurrency(tiNegotiated)}</strong> − quitação{" "}
                <strong>{formatCurrency(tiPayoff)}</strong> − débitos{" "}
                <strong>{formatCurrency(tiDebts)}</strong> ={" "}
                <strong className="text-emerald-700">
                  entrada da troca {formatCurrency(tiLiquido)}
                </strong>
              </p>
              <p className="mt-1 text-slate-600">
                Valor da venda {formatCurrency(total)} − entrada da troca{" "}
                {formatCurrency(tiLiquido)} ={" "}
                <strong>restante a pagar {formatCurrency(restante)}</strong> (
                {paymentMethod === "A_VISTA"
                  ? "à vista"
                  : paymentMethod === "PARCELADO"
                    ? "parcelado"
                    : "financiado"}
                )
              </p>
              <p className="mt-1 text-xs text-slate-500">
                O veículo recebido entra no estoque; a quitação (ao banco) e os débitos (aos órgãos)
                viram contas a pagar. A entrada da troca não passa pelo caixa — é quitada pelo carro.
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Marque quando o cliente entrega um carro como parte do pagamento. Você cadastra o
            veículo aqui mesmo e o líquido dele vira a entrada.
          </p>
        )}
      </div>

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
