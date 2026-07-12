"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import {
  createVehicleAction,
  updateVehicleAction,
  lookupPlateAction,
  type VehicleFormState,
} from "./actions";
import { quickCreateSupplierAction } from "@/app/fornecedores/actions";
import { lookupCnpjAction } from "@/app/cnpj-actions";
import { toDateInputValue, formatCurrency } from "@/lib/format";
import BankInput from "@/components/BankInput";

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
  color: string | null;
  km: number;
  fuel: string | null;
  transmission: string | null;
  purchasePrice: number;
  salePrice: number;
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
};

const initialState: VehicleFormState = {};

export default function VehicleForm({
  suppliers,
  vehicle,
}: {
  suppliers: Supplier[];
  vehicle?: VehicleData;
}) {
  const isEdit = Boolean(vehicle);
  const action = isEdit ? updateVehicleAction : createVehicleAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [acquisition, setAcquisition] = useState<
    "A_VISTA" | "PARCELADO" | "FINANCIADO" | "CONSORCIO"
  >(vehicle?.acquisitionType ?? "A_VISTA");
  const [repasse, setRepasse] = useState<boolean>(
    Boolean((vehicle?.payoffAmount ?? 0) > 0 || (vehicle?.debtsAmount ?? 0) > 0),
  );
  const [negociado, setNegociado] = useState<number>(vehicle?.purchasePrice ?? 0);
  const [payoff, setPayoff] = useState<number>(vehicle?.payoffAmount ?? 0);
  const [debts, setDebts] = useState<number>(vehicle?.debtsAmount ?? 0);
  const liquido = Math.max(0, Math.round((negociado - payoff - debts) * 100) / 100);
  const formRef = useRef<HTMLFormElement>(null);
  const [looking, startLookup] = useTransition();
  const [lookupMsg, setLookupMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [fipeOptions, setFipeOptions] = useState<{ modelo: string; price: number; ano?: string }[]>([]);
  const [fipeChoice, setFipeChoice] = useState(0);
  const [showAllFipe, setShowAllFipe] = useState(false);
  const [supplierList, setSupplierList] = useState(suppliers);
  const [supplierId, setSupplierId] = useState(vehicle?.supplierId || "");
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [savingSupplier, startSupplier] = useTransition();
  const [supplierMsg, setSupplierMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [newSupplier, setNewSupplier] = useState({
    name: "",
    document: "",
    phone: "",
    email: "",
    address: "",
  });

  function handleSupplierCnpj() {
    if (!newSupplier.document.trim()) {
      setSupplierMsg({ tone: "err", text: "Digite o CNPJ antes de buscar." });
      return;
    }
    setSupplierMsg(null);
    startSupplier(async () => {
      const result = await lookupCnpjAction(newSupplier.document);
      if (!result.ok) {
        setSupplierMsg({ tone: "err", text: result.error });
        return;
      }
      setNewSupplier((prev) => ({
        ...prev,
        name: result.data.name || prev.name,
        phone: result.data.phone || prev.phone,
        email: result.data.email || prev.email,
        address: result.data.address || prev.address,
      }));
      setSupplierMsg({ tone: "ok", text: `Dados encontrados: ${result.data.name}.` });
    });
  }

  function handleCreateSupplier() {
    setSupplierMsg(null);
    startSupplier(async () => {
      const result = await quickCreateSupplierAction(newSupplier);
      if (!result.ok) {
        setSupplierMsg({ tone: "err", text: result.error });
        return;
      }
      setSupplierList((prev) =>
        prev.some((s) => s.id === result.id) ? prev : [...prev, { id: result.id, name: result.name }],
      );
      setSupplierId(result.id);
      setShowNewSupplier(false);
      setNewSupplier({ name: "", document: "", phone: "", email: "", address: "" });
      setSupplierMsg({
        tone: "ok",
        text: result.existed
          ? `Esse CPF/CNPJ já estava cadastrado — fornecedor "${result.name}" selecionado.`
          : `Fornecedor "${result.name}" cadastrado e selecionado.`,
      });
    });
  }

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
      setField("chassi", d.chassi);
      setField("color", d.color);
      setField("fuel", d.fuel);
      setField("transmission", d.transmission);
      // sugere o preço FIPE como preço de venda se ainda não preenchido
      const saleEl = formRef.current?.elements.namedItem("salePrice");
      if (d.fipePrice && saleEl instanceof HTMLInputElement && !saleEl.value) {
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

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      {isEdit ? <input type="hidden" name="id" defaultValue={vehicle!.id} /> : null}

      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
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
          preenchidos automaticamente.
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
          <Input name="chassi" defaultValue={vehicle?.chassi || ""} />
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <Field label="Preço de venda (anúncio)" required>
          <Input type="number" step="0.01" min={0} name="salePrice" defaultValue={vehicle?.salePrice} required />
        </Field>
        <div>
          <Field label="Fornecedor de origem">
            <Select
              name="supplierId"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Sem fornecedor / particular</option>
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
          {supplierMsg ? (
            <p
              className={`mt-1 text-sm font-medium ${
                supplierMsg.tone === "ok" ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              {supplierMsg.text}
            </p>
          ) : null}
        </div>
      </div>

      {showNewSupplier ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
          <p className="mb-3 text-sm font-medium text-slate-700">Novo fornecedor</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="CPF / CNPJ">
              <div className="flex flex-wrap gap-2">
                <Input
                  value={newSupplier.document}
                  onChange={(e) => setNewSupplier((p) => ({ ...p, document: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                  className="max-w-[200px]"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSupplierCnpj}
                  disabled={savingSupplier}
                >
                  🔍 Buscar CNPJ
                </Button>
              </div>
            </Field>
            <Field label="Nome" required>
              <Input
                value={newSupplier.name}
                onChange={(e) => setNewSupplier((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nome ou razão social"
              />
            </Field>
            <Field label="Telefone">
              <Input
                value={newSupplier.phone}
                onChange={(e) => setNewSupplier((p) => ({ ...p, phone: e.target.value }))}
              />
            </Field>
          </div>
          <Button
            type="button"
            onClick={handleCreateSupplier}
            disabled={savingSupplier}
            className="mt-3"
          >
            {savingSupplier ? "Salvando..." : "Salvar fornecedor"}
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            O fornecedor é salvo no cadastro geral e já fica selecionado neste veículo. Endereço e
            outros dados podem ser completados depois em Cadastros → Fornecedores.
          </p>
        </div>
      ) : null}

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
          <>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                name="alreadyPaid"
                value="true"
                checked={alreadyPaid}
                onChange={(e) => setAlreadyPaid(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Já paguei no ato (dar a baixa agora pela conta padrão)
            </label>
            <p className="mt-2 text-xs text-slate-500">
              {alreadyPaid
                ? "Atenção: registra o pagamento na hora, saindo da conta financeira padrão."
                : "A compra entra como conta a pagar. O pagamento é dado depois em Contas a pagar, por uma conta financeira."}
            </p>
          </>
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
