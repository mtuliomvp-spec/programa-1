"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { isChassiPartial, CHASSI_LENGTH } from "@/lib/vehicle-doc";
import DebtItemsField from "@/components/DebtItemsField";
import type { VehicleDebtItem } from "@/lib/vehicle-debts";
import {
  createVehicleAction,
  updateVehicleAction,
  lookupPlateAction,
  importContractAction,
  type VehicleFormState,
} from "./actions";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import { toDateInputValue, formatCurrency } from "@/lib/format";
import BankInput from "@/components/BankInput";
import NewSupplierInline from "@/components/NewSupplierInline";

type Supplier = { id: string; name: string };

type VehicleData = {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  manufactureYear: number;
  modelYear: number;
  plate: string;
  chassi: string | null;
  renavam: string | null;
  color: string | null;
  km: number;
  fuel: string | null;
  transmission: string | null;
  purchasePrice: number;
  salePrice: number;
  consigned?: boolean;
  ownerRefundAmount?: number;
  entryDate: Date;
  notes: string | null;
  supplierId: string | null;
  acquisitionType?: "A_VISTA" | "PARCELADO" | "FINANCIADO" | "CONSORCIO";
  downPayment?: number;
  installmentsCount?: number;
  financerName?: string | null;
  payoffAmount?: number;
  payoffTo?: string | null;
  debtsAmount?: number;
  debtsItems?: VehicleDebtItem[];
};

const initialState: VehicleFormState = {};

export default function VehicleForm({
  suppliers,
  vehicle,
  renavePrazo,
}: {
  suppliers: Supplier[];
  vehicle?: VehicleData;
  /** Data em que a obrigatoriedade do Renave entra em vigor (texto do aviso). */
  renavePrazo?: string;
}) {
  const isEdit = Boolean(vehicle);
  const action = isEdit ? updateVehicleAction : createVehicleAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [acquisition, setAcquisition] = useState<
    "A_VISTA" | "PARCELADO" | "FINANCIADO" | "CONSORCIO"
  >(vehicle?.acquisitionType ?? "A_VISTA");
  const [repasse, setRepasse] = useState<boolean>(
    Boolean((vehicle?.payoffAmount ?? 0) > 0 || (vehicle?.debtsAmount ?? 0) > 0),
  );
  const [negociado, setNegociado] = useState<number>(vehicle?.purchasePrice ?? 0);
  const [consigned, setConsigned] = useState<boolean>(Boolean(vehicle?.consigned));
  const [ownerRefund, setOwnerRefund] = useState<number>(vehicle?.ownerRefundAmount ?? 0);
  const [payoff, setPayoff] = useState<number>(vehicle?.payoffAmount ?? 0);
  const [debts, setDebts] = useState<number>(vehicle?.debtsAmount ?? 0);
  const liquido = Math.max(0, Math.round((negociado - payoff - debts) * 100) / 100);
  // Consignado: líquido a devolver ao proprietário = acertado − quitação − débitos.
  const consignedLiquido = Math.max(0, Math.round((ownerRefund - payoff - debts) * 100) / 100);
  const formRef = useRef<HTMLFormElement>(null);
  const contractRef = useRef<HTMLInputElement>(null);
  const [looking, startLookup] = useTransition();
  const [lookupMsg, setLookupMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [reading, startReading] = useTransition();
  const [contractMsg, setContractMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [fipeOptions, setFipeOptions] = useState<{ modelo: string; price: number; ano?: string }[]>([]);
  const [fipeChoice, setFipeChoice] = useState(0);
  const [showAllFipe, setShowAllFipe] = useState(false);
  const [supplierList, setSupplierList] = useState(suppliers);
  const [supplierId, setSupplierId] = useState(vehicle?.supplierId || "");
  const [showNewSupplier, setShowNewSupplier] = useState(false);

  function setField(name: string, value: string | number | undefined) {
    if (value === undefined || value === "") return;
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      if (el instanceof HTMLSelectElement) {
        const match = Array.from(el.options).find((o) => o.value === String(value));
        if (!match) return;
      }
      el.value = String(value);
    }
  }

  function handlePlateLookup() {
    const plateEl = formRef.current?.elements.namedItem("plate");
    const plate = plateEl instanceof HTMLInputElement ? plateEl.value.trim() : "";
    if (!plate) {
      setLookupMsg({ tone: "err", text: "Digite a placa antes de buscar." });
      return;
    }
    setLookupMsg(null);
    setFipeOptions([]);
    startLookup(async () => {
      const result = await lookupPlateAction(plate);
      if (!result.ok) {
        setLookupMsg({ tone: "err", text: result.error });
        return;
      }
      const d = result.data;
      setField("brand", d.brand);
      setField("model", d.model);
      setField("version", d.version);
      setField("manufactureYear", d.manufactureYear);
      setField("modelYear", d.modelYear ?? d.manufactureYear);
      // O chassi da consulta vem MASCARADO (parcial, ex.: *****63440). Nunca
      // sobrescreve um chassi já preenchido (ex.: completo, vindo do contrato) —
      // só preenche quando o campo está vazio.
      const chassiEl = formRef.current?.elements.namedItem("chassi");
      const chassiAtual = chassiEl instanceof HTMLInputElement ? chassiEl.value.trim() : "";
      if (!chassiAtual) setField("chassi", d.chassi);
      setField("renavam", d.renavam);
      setField("color", d.color);
      setField("fuel", d.fuel);
      setField("transmission", d.transmission);
      // preenche sempre o preço de venda com o valor FIPE (continua editável)
      const saleEl = formRef.current?.elements.namedItem("salePrice");
      if (d.fipePrice && saleEl instanceof HTMLInputElement) {
        saleEl.value = String(d.fipePrice);
      }
      setFipeOptions(d.fipeOptions ?? []);
      setFipeChoice(0);
      setShowAllFipe(false);
      const found = [d.brand, d.model, d.modelYear].filter(Boolean).join(" ");
      setLookupMsg({
        tone: "ok",
        text: `Dados encontrados: ${found || "veículo"}${
          d.fipePrice ? ` · FIPE ${formatCurrency(d.fipePrice)}` : ""
        }. Confira e complete o que faltar.`,
      });
    });
  }

  function chooseFipe(index: number) {
    setFipeChoice(index);
    const option = fipeOptions[index];
    const saleEl = formRef.current?.elements.namedItem("salePrice");
    if (option && saleEl instanceof HTMLInputElement) {
      saleEl.value = String(option.price);
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = () => reject(new Error("Falha ao ler o arquivo."));
      r.readAsDataURL(file);
    });
  }

  function handleContract() {
    const file = contractRef.current?.files?.[0];
    if (!file) {
      setContractMsg({ tone: "err", text: "Selecione o contrato (PDF ou foto) primeiro." });
      return;
    }
    setContractMsg({ tone: "ok", text: "Lendo o contrato com a IA… aguarde." });
    startReading(async () => {
      let base64: string;
      try {
        base64 = await fileToBase64(file);
      } catch {
        setContractMsg({ tone: "err", text: "Não foi possível abrir o arquivo." });
        return;
      }
      const res = await importContractAction(base64, file.type || "application/pdf");
      if (!res.ok) {
        setContractMsg({ tone: "err", text: res.error });
        return;
      }
      const d = res.data;
      setField("brand", d.marca ?? undefined);
      setField("model", d.modelo ?? undefined);
      setField("version", d.versao ?? undefined);
      setField("manufactureYear", d.anoFabricacao ?? undefined);
      setField("modelYear", (d.anoModelo ?? d.anoFabricacao) ?? undefined);
      setField("plate", d.placa ?? undefined);
      setField("chassi", d.chassi ?? undefined);
      setField("renavam", d.renavam ?? undefined);
      setField("color", d.cor ?? undefined);
      setField("fuel", d.combustivel ?? undefined);
      setField("transmission", d.transmissao ?? undefined);
      if (d.km != null) setField("km", d.km);
      if (d.valorCompra != null) {
        setField("purchasePrice", d.valorCompra);
        setNegociado(d.valorCompra);
      }
      // Fornecedor (vendedor) resolvido/cadastrado no servidor: adiciona à lista
      // e já deixa selecionado.
      if (res.supplier) {
        const sup = res.supplier;
        setSupplierList((prev) => (prev.some((s) => s.id === sup.id) ? prev : [...prev, sup]));
        setSupplierId(sup.id);
      }
      const nome = [d.marca, d.modelo, d.anoModelo ?? d.anoFabricacao].filter(Boolean).join(" ");
      const extras = [
        d.valorCompra != null ? `compra ${formatCurrency(d.valorCompra)}` : null,
        res.supplier ? `fornecedor: ${res.supplier.name} (selecionado)` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      setContractMsg({
        tone: "ok",
        text: `Contrato lido: ${nome || "veículo"}${extras ? ` · ${extras}` : ""}. Confira os campos e finalize — o contrato será anexado ao veículo.`,
      });
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <ProcessingOverlay
        show={pending}
        label={isEdit ? "Salvando as alterações… aguarde. Não feche esta página." : "Cadastrando o veículo… aguarde. Não feche esta página."}
      />
      {isEdit ? <input type="hidden" name="id" defaultValue={vehicle!.id} /> : null}

      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      {!isEdit ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-4">
          <p className="text-sm font-semibold text-violet-900">
            📄 Importar contrato de compra (opcional)
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Anexe o contrato (PDF ou foto): a IA lê e preenche os dados do veículo e o valor de
            compra automaticamente — você só confere e finaliza. O contrato fica anexado ao veículo.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={contractRef}
              type="file"
              name="contract"
              accept="application/pdf,image/*"
              className="block max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-violet-500"
            />
            <Button type="button" variant="secondary" onClick={handleContract} disabled={reading}>
              {reading ? "Lendo o contrato…" : "✨ Ler contrato e preencher"}
            </Button>
          </div>
          {contractMsg ? (
            <p
              className={`mt-2 text-sm font-medium ${
                contractMsg.tone === "ok" ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              {contractMsg.text}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
        <Field label="Placa" required>
          <div className="flex flex-wrap gap-2">
            <Input
              name="plate"
              defaultValue={vehicle?.plate}
              required
              placeholder="ABC1D23"
              className="max-w-[180px] uppercase"
            />
            <Button type="button" variant="secondary" onClick={handlePlateLookup} disabled={looking}>
              {looking ? "Buscando..." : "🔍 Buscar dados pela placa"}
            </Button>
          </div>
        </Field>
        <p className="mt-2 text-xs text-slate-500">
          Digite a placa e clique em buscar: marca, modelo, ano, cor, chassi e o valor FIPE são
          preenchidos automaticamente. O chassi vem <strong>mascarado</strong> — complete-o com o
          documento do carro, senão a venda dele fica travada.
        </p>
        {lookupMsg ? (
          <p
            className={`mt-2 text-sm font-medium ${
              lookupMsg.tone === "ok" ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {lookupMsg.text}
          </p>
        ) : null}
        {fipeOptions.length > 0 ? (
          <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
            <p className="text-sm font-medium text-slate-700">
              {showAllFipe
                ? "Toque na versão correta para ajustar o valor:"
                : "Versão FIPE identificada:"}
            </p>
            <div className="mt-2 space-y-1.5">
              {fipeOptions.map((option, i) =>
                showAllFipe || fipeChoice === i ? (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                      fipeChoice === i
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={fipeChoice === i}
                      onChange={() => chooseFipe(i)}
                      className="mt-0.5 h-4 w-4 shrink-0 border-slate-300"
                    />
                    <span className="min-w-0">
                      <span className="block text-slate-700">
                        {option.modelo}
                        {option.ano ? ` (${option.ano})` : ""}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(option.price)}
                      </span>
                    </span>
                  </label>
                ) : null,
              )}
            </div>
            {!showAllFipe && fipeOptions.length > 1 ? (
              <button
                type="button"
                onClick={() => setShowAllFipe(true)}
                className="mt-2 text-sm font-medium text-blue-700 hover:underline"
              >
                Não é essa versão? Ver as outras {fipeOptions.length - 1} →
              </button>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                O valor da versão escolhida vai para o campo &quot;Preço de venda (anúncio)&quot;.
                Você pode ajustá-lo depois.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <Field label="RENAVAM">
        <Input
          name="renavam"
          defaultValue={vehicle?.renavam || ""}
          inputMode="numeric"
          placeholder="Nº do RENAVAM (11 dígitos)"
          className="max-w-xs"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Marca" required>
          <Input name="brand" defaultValue={vehicle?.brand} required placeholder="Ex: Volkswagen" />
        </Field>
        <Field label="Modelo" required>
          <Input name="model" defaultValue={vehicle?.model} required placeholder="Ex: Gol" />
        </Field>
        <Field label="Versão">
          <Input name="version" defaultValue={vehicle?.version || ""} placeholder="Ex: 1.6 MSI" />
        </Field>
        <Field label="Ano fabricação" required>
          <Input type="number" name="manufactureYear" defaultValue={vehicle?.manufactureYear ?? new Date().getFullYear()} required />
        </Field>
        <Field label="Ano modelo" required>
          <Input type="number" name="modelYear" defaultValue={vehicle?.modelYear ?? new Date().getFullYear()} required />
        </Field>
        <Field label="Chassi (VIN)">
          {/* Não-controlado de propósito: o botão "Buscar dados pela placa"
              escreve direto no elemento (setField), sem passar pelo React. */}
          <Input
            name="chassi"
            defaultValue={vehicle?.chassi || ""}
            className="uppercase"
            placeholder={`${CHASSI_LENGTH} caracteres`}
          />
          {isChassiPartial(vehicle?.chassi) ? (
            <p className="mt-1 text-[11px] text-amber-700">
              Chassi incompleto no cadastro — a busca pela placa devolve mascarado. Copie os{" "}
              {CHASSI_LENGTH} caracteres do documento: sem eles a venda deste carro fica travada.
            </p>
          ) : null}
        </Field>
        <Field label="Cor">
          <Input name="color" defaultValue={vehicle?.color || ""} />
        </Field>
        <Field label="Quilometragem">
          <Input type="number" name="km" defaultValue={vehicle?.km ?? 0} min={0} />
        </Field>
        <Field label="Combustível">
          <Select name="fuel" defaultValue={vehicle?.fuel || ""}>
            <option value="">Selecione</option>
            <option value="Flex">Flex</option>
            <option value="Gasolina">Gasolina</option>
            <option value="Diesel">Diesel</option>
            <option value="Híbrido">Híbrido</option>
            <option value="Elétrico">Elétrico</option>
          </Select>
        </Field>
        <Field label="Câmbio">
          <Select name="transmission" defaultValue={vehicle?.transmission || ""}>
            <option value="">Selecione</option>
            <option value="Manual">Manual</option>
            <option value="Automático">Automático</option>
            <option value="CVT">CVT</option>
          </Select>
        </Field>
        <Field label="Data de entrada" required>
          <Input
            type="date"
            name="entryDate"
            defaultValue={vehicle ? toDateInputValue(vehicle.entryDate) : toDateInputValue(new Date())}
            required
          />
        </Field>
      </div>

      <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="consigned"
            checked={consigned}
            onChange={(e) => setConsigned(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Veículo consignado (de terceiro)
        </label>
        {consigned ? (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Valor acertado com o proprietário (R$)" required>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="ownerRefundAmount"
                  value={ownerRefund || ""}
                  onChange={(e) => setOwnerRefund(Number(e.target.value) || 0)}
                  placeholder="0,00"
                  required
                />
              </Field>
              <Field label="Quitação de financiamento (R$)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="payoffAmount"
                  value={payoff || ""}
                  onChange={(e) => setPayoff(Number(e.target.value) || 0)}
                  placeholder="0,00 (se houver)"
                />
              </Field>
              <Field label="Banco / financeira da quitação">
                <BankInput name="payoffTo" defaultValue={vehicle?.payoffTo || ""} placeholder="Ex.: Banco XPTO" />
              </Field>
              <Field label="Débitos do veículo (R$)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="debtsAmount"
                  value={debts || ""}
                  onChange={(e) => setDebts(Number(e.target.value) || 0)}
                  placeholder="IPVA, multas, licenciamento"
                />
                <DebtItemsField
                  name="debtsItems"
                  initialItems={vehicle?.debtsItems ?? []}
                  agreed={debts}
                  mode="devolucao"
                />
              </Field>
            </div>
            <div className="rounded-lg border border-violet-300 bg-white p-3 text-sm">
              <p className="text-slate-600">
                Valor acertado <strong>{formatCurrency(ownerRefund)}</strong> − quitação{" "}
                <strong>{formatCurrency(payoff)}</strong> − débitos{" "}
                <strong>{formatCurrency(debts)}</strong> ={" "}
                <strong className="text-emerald-700">líquido ao proprietário {formatCurrency(consignedLiquido)}</strong>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                O carro não é patrimônio da loja (custo de compra 0). Selecione o{" "}
                <strong>proprietário</strong> abaixo como fornecedor. Ao vender, a loja paga a
                quitação (ao banco) e os débitos (aos órgãos) e o <strong>líquido</strong> vira
                conta a pagar ao dono (ou aporte de capital).
              </p>
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                ⚠️ <strong>Renave:</strong> a consignação passa a exigir contrato eletrônico registrado no
                Renave, assinado digitalmente pela loja e pelo consignante. Quando a obrigatoriedade entrar
                em vigor{renavePrazo ? `, em ${renavePrazo},` : ""} esta rotina não poderá ser concluída
                desta forma — vender ou intermediar sem esse registro prévio fica vedado (art. 20, §§ 1º a
                3º). Por enquanto nada é bloqueado: o contrato impresso do sistema segue valendo como
                registro interno, e o número do contrato eletrônico é anotado na ficha do veículo.
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Marque quando o veículo pertence a um terceiro e a loja só o vende por consignação —
            gera dois contratos de compra e venda e o valor a devolver ao dono no fechamento.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {consigned ? (
          <input type="hidden" name="purchasePrice" value="0" />
        ) : (
          <Field label="Preço de compra (valor negociado)" required>
            <Input
              type="number"
              step="0.01"
              min={0}
              name="purchasePrice"
              defaultValue={vehicle?.purchasePrice}
              onChange={(e) => setNegociado(Number(e.target.value) || 0)}
              required
            />
          </Field>
        )}
        <Field label="Preço de venda (anúncio)" required>
          <Input type="number" step="0.01" min={0} name="salePrice" defaultValue={vehicle?.salePrice} required />
        </Field>
        <div>
          <Field label={consigned ? "Proprietário (consignante)" : "Fornecedor de origem"} required={consigned}>
            <Select
              name="supplierId"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">{consigned ? "Selecione o proprietário" : "Sem fornecedor / particular"}</option>
              {supplierList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <button
            type="button"
            onClick={() => setShowNewSupplier((v) => !v)}
            className="mt-1.5 text-sm font-medium text-blue-700 hover:underline"
          >
            {showNewSupplier ? "✕ Cancelar novo fornecedor" : "+ Cadastrar novo fornecedor"}
          </button>
          {showNewSupplier ? (
            <NewSupplierInline
              onCreated={(name, id) => {
                setSupplierList((prev) =>
                  prev.some((s) => s.id === id) ? prev : [...prev, { id, name }],
                );
                setSupplierId(id);
                setShowNewSupplier(false);
              }}
            />
          ) : null}
        </div>
      </div>

      {!consigned ? (
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={repasse}
            onChange={(e) => setRepasse(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Compra com repasse / troca (o veículo tem financiamento a quitar ou débitos)
        </label>
        {repasse ? (
          <>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Saldo devedor / quitação (R$)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="payoffAmount"
                  value={payoff || ""}
                  onChange={(e) => setPayoff(Number(e.target.value) || 0)}
                  placeholder="0,00"
                />
              </Field>
              <Field label="Banco / financeira da quitação">
                <BankInput name="payoffTo" defaultValue={vehicle?.payoffTo || ""} placeholder="Ex.: Banco XPTO" />
              </Field>
              <Field label="Débitos do veículo (R$)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="debtsAmount"
                  value={debts || ""}
                  onChange={(e) => setDebts(Number(e.target.value) || 0)}
                  placeholder="IPVA, multas, licenciamento"
                />
                <DebtItemsField
                  name="debtsItems"
                  initialItems={vehicle?.debtsItems ?? []}
                  agreed={debts}
                />
              </Field>
            </div>
            <div className="mt-3 rounded-lg border border-amber-300 bg-white p-3 text-sm">
              <p className="text-slate-600">
                Valor negociado <strong>{formatCurrency(negociado)}</strong> − quitação{" "}
                <strong>{formatCurrency(payoff)}</strong> − débitos{" "}
                <strong>{formatCurrency(debts)}</strong> ={" "}
                <strong className="text-emerald-700">líquido ao vendedor {formatCurrency(liquido)}</strong>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                O sistema gera contas a pagar <strong>separadas</strong>: a quitação (ao banco), os
                débitos (aos órgãos) e o líquido ao vendedor — cada um pago por uma conta financeira.
                O líquido é o que segue a forma de aquisição abaixo (à vista ou parcelado, servindo
                de entrada numa troca).
              </p>
            </div>
          </>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Marque quando o carro comprado tiver financiamento a quitar ou débitos que serão
            descontados do valor pago ao vendedor.
          </p>
        )}
      </div>
      ) : null}

      {!consigned ? (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-sm font-medium text-slate-700">
          Forma de aquisição {repasse ? "(do líquido ao vendedor)" : "(como o veículo será pago)"}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Forma de aquisição">
            <Select
              name="acquisitionType"
              value={acquisition}
              onChange={(e) => setAcquisition(e.target.value as typeof acquisition)}
            >
              <option value="A_VISTA">À vista</option>
              <option value="PARCELADO">Parcelado (direto com o fornecedor)</option>
              <option value="FINANCIADO">Financiado (banco/financeira)</option>
              <option value="CONSORCIO">Consórcio (carta de crédito)</option>
            </Select>
          </Field>
          <Field label={acquisition === "A_VISTA" ? "Vencimento do pagamento" : "Vencimento da entrada / 1ª parcela"}>
            <Input type="date" name="dueDate" defaultValue={toDateInputValue(vehicle ? vehicle.entryDate : new Date())} />
          </Field>
          {acquisition !== "A_VISTA" ? (
            <>
              <Field label="Entrada (R$)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="downPayment"
                  defaultValue={vehicle?.downPayment ?? 0}
                  placeholder="0,00"
                />
              </Field>
              <Field label="Número de parcelas">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  name="installmentsCount"
                  defaultValue={vehicle?.installmentsCount ?? 12}
                />
              </Field>
              {acquisition === "FINANCIADO" || acquisition === "CONSORCIO" ? (
                <Field label={acquisition === "CONSORCIO" ? "Administradora do consórcio" : "Banco / financeira"}>
                  <BankInput name="financerName" defaultValue={vehicle?.financerName || ""} placeholder="Ex.: Banco XPTO" />
                </Field>
              ) : null}
            </>
          ) : null}
        </div>

        {acquisition === "A_VISTA" ? (
          <p className="mt-3 text-xs text-slate-500">
            A compra entra como conta a pagar. O pagamento é dado depois em Contas a pagar, por uma
            conta financeira.
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Serão geradas automaticamente as contas a pagar: a <strong>entrada</strong> (se houver) e{" "}
            <strong>{acquisition === "FINANCIADO" || acquisition === "CONSORCIO" ? "as parcelas do financiamento" : "as parcelas"}</strong>{" "}
            mês a mês. Cada uma é paga depois em Contas a pagar, por uma conta financeira.
          </p>
        )}
        {isEdit ? (
          <p className="mt-2 text-xs text-amber-700">
            Ao salvar, as contas a pagar da compra são recriadas conforme esta forma — desde que
            nenhuma parcela da compra já tenha sido paga.
          </p>
        ) : null}
      </div>
      ) : null}

      <Field label="Observações">
        <Textarea name="notes" defaultValue={vehicle?.notes || ""} rows={3} />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar veículo"}
        </Button>
      </div>
    </form>
  );
}
