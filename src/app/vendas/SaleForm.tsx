"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { type SaleFormState } from "./sale-core";
import { createPreSaleAction } from "./pre-vendas/actions";
import { lookupPlateAction } from "@/app/estoque/actions";
import { toDateInputValue, formatCurrency } from "@/lib/format";
import BankInput from "@/components/BankInput";

type Vehicle = { id: string; brand: string; model: string; plate: string; salePrice: number };
type Customer = { id: string; name: string };
type Financer = { id: string; name: string };

export type SaleFormInitial = {
  vehicleId?: string;
  customerId?: string;
  saleDate?: string;
  totalAmount?: number;
  paymentMethod?: "A_VISTA" | "PARCELADO" | "FINANCIADO";
  downPayment?: number;
  installmentsCount?: number;
  financerAccountId?: string;
  financedAmount?: number;
  sellerName?: string;
  notes?: string;
  tradeIn?: boolean;
  tiPlate?: string;
  tiBrand?: string;
  tiModel?: string;
  tiVersion?: string;
  tiManufactureYear?: number;
  tiModelYear?: number;
  tiColor?: string;
  tiKm?: number;
  tiFuel?: string;
  tiTransmission?: string;
  tiChassi?: string;
  tiNegotiated?: number;
  tiPayoff?: number;
  tiPayoffTo?: string;
  tiDebts?: number;
};

const initialState: SaleFormState = {};

/** Linha de um resumo financeiro: rótulo à esquerda, valor à direita. */
function SummaryRow({
  label,
  value,
  strong,
  tone = "muted",
  top,
}: {
  label: string;
  value: number;
  strong?: boolean;
  tone?: "muted" | "green" | "rose";
  top?: boolean;
}) {
  const toneClass =
    tone === "green" ? "text-emerald-700" : tone === "rose" ? "text-rose-600 font-semibold" : "text-slate-600";
  return (
    <div
      className={`flex items-center justify-between gap-3 ${top ? "border-t border-slate-200 pt-1.5 mt-1.5" : ""} ${
        strong ? "font-semibold" : ""
      } ${toneClass}`}
    >
      <span>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{formatCurrency(value)}</span>
    </div>
  );
}

export default function SaleForm({
  vehicles,
  customers,
  financers,
  advances = {},
  preselectedVehicleId,
  currentUserName,
  initial,
  preSaleId,
}: {
  vehicles: Vehicle[];
  customers: Customer[];
  financers: Financer[];
  advances?: Record<string, number>;
  preselectedVehicleId?: string;
  currentUserName?: string;
  initial?: SaleFormInitial;
  preSaleId?: string;
}) {
  const [state, formAction, pending] = useActionState(createPreSaleAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId || preselectedVehicleId || "");
  const [paymentMethod, setPaymentMethod] = useState<"A_VISTA" | "PARCELADO" | "FINANCIADO">(
    initial?.paymentMethod || "A_VISTA",
  );

  const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);
  const [totalAmount, setTotalAmount] = useState<string>(
    initial?.totalAmount != null ? String(initial.totalAmount) : selectedVehicle ? String(selectedVehicle.salePrice) : "",
  );

  // Troca (veículo recebido do cliente, cadastrado aqui mesmo)
  const [tradeIn, setTradeIn] = useState(!!initial?.tradeIn);
  const [tiNegotiated, setTiNegotiated] = useState(initial?.tiNegotiated ?? 0);
  const [tiPayoff, setTiPayoff] = useState(initial?.tiPayoff ?? 0);
  const [tiDebts, setTiDebts] = useState(initial?.tiDebts ?? 0);
  const tiLiquido = Math.max(0, Math.round((tiNegotiated - tiPayoff - tiDebts) * 100) / 100);
  const total = Number(totalAmount) || 0;
  const sinal = advances[vehicleId] || 0;
  const restante = Math.max(0, Math.round((total - tiLiquido) * 100) / 100);

  // Financiamento: valor financiado pelo banco e a entrada (restante) paga agora.
  // O sinal já recebido também abate do que o cliente ainda tem a pagar.
  const [financedAmount, setFinancedAmount] = useState<string>(
    initial?.financedAmount != null ? String(initial.financedAmount) : "",
  );
  const [financerAccountId, setFinancerAccountId] = useState(initial?.financerAccountId || "");
  // Restante depois de troca e sinal — pode ficar negativo (troca + sinal já
  // passam do valor da venda), e aí o excedente já é devolução ao cliente.
  const rawRestante = Math.round((total - tiLiquido - sinal) * 100) / 100;
  const restanteFin = Math.max(0, rawRestante);
  const baseDevolucao = Math.max(0, Math.round(-rawRestante * 100) / 100);
  const financedTyped = Number(financedAmount) || 0;
  // Parte do financiamento que cobre o carro; o resto (se houver) é devolução.
  const financedParaCarro = Math.min(financedTyped, restanteFin);
  const entradaFinanciamento = Math.max(0, Math.round((restanteFin - financedParaCarro) * 100) / 100);
  // Devolução = excedente de (troca + sinal) + excedente do financiamento.
  const devolucaoCliente =
    paymentMethod === "FINANCIADO"
      ? Math.round((baseDevolucao + Math.max(0, financedTyped - restanteFin)) * 100) / 100
      : baseDevolucao;
  // O financiado só vira "conta a receber" quando NÃO há financeira cadastrada
  // (aí é repasse pendente). Com financeira, ele entra na conta dela.
  const aReceberFin = financerAccountId
    ? entradaFinanciamento
    : Math.round((entradaFinanciamento + financedTyped) * 100) / 100;
  const methodLabel =
    paymentMethod === "A_VISTA" ? "à vista" : paymentMethod === "PARCELADO" ? "parcelado" : "financiado";
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
      setTiField("tiVersion", dt.version);
      setTiField("tiManufactureYear", dt.manufactureYear ?? dt.modelYear);
      setTiField("tiModelYear", dt.modelYear ?? dt.manufactureYear);
      setTiField("tiColor", dt.color);
      setTiField("tiFuel", dt.fuel);
      setTiField("tiTransmission", dt.transmission);
      setTiField("tiChassi", dt.chassi);
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

      {preSaleId ? <input type="hidden" name="preSaleId" value={preSaleId} /> : null}

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
          <Select name="customerId" required defaultValue={initial?.customerId || ""}>
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
          <Input type="date" name="saleDate" defaultValue={initial?.saleDate || toDateInputValue(new Date())} required />
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
          <Input name="sellerName" defaultValue={initial?.sellerName ?? currentUserName ?? ""} />
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

      {sinal > 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          💰 Sinal / entrada antecipada já recebido deste veículo:{" "}
          <strong>{formatCurrency(sinal)}</strong>. Será <strong>abatido</strong> automaticamente do
          que o cliente tem a pagar ao fechar a venda.
        </div>
      ) : null}

      {paymentMethod !== "FINANCIADO" && devolucaoCliente > 0 ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          ⚠️ A troca e o sinal somam mais que o valor da venda. A diferença de{" "}
          <strong>{formatCurrency(devolucaoCliente)}</strong> será <strong>devolvida ao cliente</strong>{" "}
          (lançada em Contas a Pagar) e aparece no card de estoque do veículo.
        </div>
      ) : null}

      {paymentMethod === "PARCELADO" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Detalhes do parcelamento</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Valor de entrada">
              <Input type="number" step="0.01" min={0} name="downPayment" defaultValue={initial?.downPayment ?? 0} />
            </Field>
            <Field label="Número de parcelas" required>
              <Input type="number" min={1} name="installmentsCount" defaultValue={initial?.installmentsCount || 1} required />
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
            <Field label="Financeira">
              <Select
                name="financerAccountId"
                value={financerAccountId}
                onChange={(e) => setFinancerAccountId(e.target.value)}
              >
                <option value="">Selecione a financeira</option>
                {financers.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
              {financers.length === 0 ? (
                <p className="mt-1 text-xs text-amber-600">
                  Nenhuma financeira cadastrada.{" "}
                  <a href="/financeiro/contas" className="underline">Cadastrar em Contas financeiras</a> (tipo Financeira).
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">
                  O valor financiado fica na conta da financeira até ela pagar.
                </p>
              )}
            </Field>
            <Field label="Valor financiado (repasse do banco)">
              <Input
                type="number"
                step="0.01"
                min={0}
                name="financedAmount"
                value={financedAmount}
                onChange={(e) => setFinancedAmount(e.target.value)}
                placeholder={String(restanteFin)}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            O valor financiado vira uma conta a receber do banco/financeira (vencimento em 5 dias).
            {financedAmount === "" ? " Se ficar em branco, financia todo o restante a pagar." : ""}
          </p>
          {financedAmount !== "" ? (
            devolucaoCliente > 0 ? (
              // Entrou mais do que o valor da venda (troca + sinal + financiado)
              // → o excedente é devolvido ao cliente.
              <div className="mt-3 rounded-lg border border-rose-200 bg-white p-3 text-sm">
                <div className="space-y-1">
                  <SummaryRow label="Valor da venda" value={total} />
                  {tiLiquido > 0 ? <SummaryRow label="(−) Entrada da troca" value={tiLiquido} /> : null}
                  {sinal > 0 ? <SummaryRow label="(−) Sinal já recebido" value={sinal} /> : null}
                  <SummaryRow label="(−) Financiado pelo banco" value={financedTyped} />
                  <SummaryRow
                    label="= Devolução ao cliente → Contas a Pagar"
                    value={devolucaoCliente}
                    strong
                    tone="rose"
                    top
                  />
                </div>
                <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700">
                  ⚠️ A troca, o sinal e o financiamento somam mais que o valor da venda. A diferença de{" "}
                  <strong>{formatCurrency(devolucaoCliente)}</strong> será <strong>devolvida ao cliente</strong>{" "}
                  (lançada em Contas a Pagar) e aparece no card de estoque do veículo.
                </p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-sm">
                <div className="space-y-1">
                  <SummaryRow label="Restante a pagar (após troca e sinal)" value={restanteFin} />
                  <SummaryRow label="(−) Financiado pelo banco" value={financedTyped} />
                  <SummaryRow
                    label="= Entrada do cliente → Contas a Receber"
                    value={aReceberFin}
                    strong
                    tone="green"
                    top
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  A entrada do cliente vai para <strong>Contas a Receber</strong> (pendente): quando ele
                  pagar — total ou parcial — você dá baixa na conta do depósito; o que faltar continua
                  pendente.{" "}
                  {financerAccountId
                    ? "O valor financiado entra na conta da financeira."
                    : "Sem financeira escolhida, o valor financiado também fica a receber (repasse) e por isso soma acima."}
                </p>
              </div>
            )
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
                <Input name="tiPlate" defaultValue={initial?.tiPlate || ""} placeholder="ABC1D23" className="max-w-[160px] uppercase" />
              </Field>
              <Button type="button" variant="secondary" onClick={handleTiLookup} disabled={tiLooking}>
                {tiLooking ? "Buscando..." : "🔍 Buscar dados"}
              </Button>
            </div>
            {tiMsg ? <p className="text-sm font-medium text-emerald-700">{tiMsg}</p> : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Marca">
                <Input name="tiBrand" defaultValue={initial?.tiBrand || ""} placeholder="Ex.: Volkswagen" />
              </Field>
              <Field label="Modelo">
                <Input name="tiModel" defaultValue={initial?.tiModel || ""} placeholder="Ex.: Gol" />
              </Field>
              <Field label="Versão">
                <Input name="tiVersion" defaultValue={initial?.tiVersion || ""} placeholder="Ex.: 1.0 Comfort" />
              </Field>
              <Field label="Cor">
                <Input name="tiColor" defaultValue={initial?.tiColor || ""} />
              </Field>
              <Field label="Ano fabricação">
                <Input type="number" name="tiManufactureYear" defaultValue={initial?.tiManufactureYear ?? new Date().getFullYear()} />
              </Field>
              <Field label="Ano modelo">
                <Input type="number" name="tiModelYear" defaultValue={initial?.tiModelYear ?? new Date().getFullYear()} />
              </Field>
              <Field label="Quilometragem">
                <Input type="number" name="tiKm" min={0} defaultValue={initial?.tiKm ?? 0} />
              </Field>
              <Field label="Combustível">
                <Input name="tiFuel" defaultValue={initial?.tiFuel || ""} placeholder="Ex.: Flex" />
              </Field>
              <Field label="Câmbio">
                <Input name="tiTransmission" defaultValue={initial?.tiTransmission || ""} placeholder="Ex.: Manual" />
              </Field>
              <Field label="Chassi">
                <Input name="tiChassi" defaultValue={initial?.tiChassi || ""} />
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
                <BankInput name="tiPayoffTo" defaultValue={initial?.tiPayoffTo || ""} placeholder="Ex.: Banco XPTO" />
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
              <div className="space-y-1">
                <SummaryRow label="Avaliação do veículo" value={tiNegotiated} />
                <SummaryRow label="(−) Quitação / saldo devedor" value={tiPayoff} />
                <SummaryRow label="(−) Débitos (IPVA, multas)" value={tiDebts} />
                <SummaryRow label="= Entrada da troca" value={tiLiquido} strong tone="green" top />
              </div>
              <div className="mt-3 space-y-1">
                <SummaryRow label="Valor da venda" value={total} />
                <SummaryRow label="(−) Entrada da troca" value={tiLiquido} />
                {sinal > 0 ? <SummaryRow label="(−) Sinal já recebido" value={sinal} /> : null}
                {paymentMethod === "FINANCIADO" && financedTyped > 0 ? (
                  <SummaryRow label="(−) Financiado pelo banco" value={financedTyped} />
                ) : null}
                {devolucaoCliente > 0 ? (
                  <SummaryRow label="= Devolução ao cliente" value={devolucaoCliente} strong tone="rose" top />
                ) : paymentMethod === "FINANCIADO" && financedTyped > 0 ? (
                  <SummaryRow
                    label="= Entrada do cliente (a receber)"
                    value={entradaFinanciamento}
                    strong
                    tone="green"
                    top
                  />
                ) : (
                  <SummaryRow label={`= Restante a pagar (${methodLabel})`} value={restanteFin} strong top />
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                O veículo recebido entra no estoque; a quitação (ao banco) e os débitos (aos órgãos)
                viram contas a pagar. A entrada da troca não passa pelo caixa — é quitada pelo carro.
                {sinal > 0 ? " O sinal já recebido também abate do restante." : ""}
                {devolucaoCliente > 0
                  ? " Como a troca, o sinal e o financiamento passam do valor da venda, a diferença é devolvida ao cliente (Contas a Pagar)."
                  : ""}
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
        <Textarea name="notes" rows={3} defaultValue={initial?.notes || ""} />
      </Field>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-slate-500 sm:mr-auto">
          Ao gerar, cria-se uma <strong>pré-venda</strong> (ficha de negócio) para revisar e imprimir.
          Nada é lançado no financeiro até você clicar em “Registrar venda” na ficha.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Gerando..." : preSaleId ? "Salvar pré-venda →" : "Gerar pré-venda →"}
        </Button>
      </div>
    </form>
  );
}
