"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { type SaleFormState } from "./sale-core";
import { createPreSaleAction } from "./pre-vendas/actions";
import { checkPreSaleConflictAction } from "./actions";
import { lookupPlateAction } from "@/app/estoque/actions";
import { toDateInputValue, formatCurrency } from "@/lib/format";
import type { VehicleDebtItem } from "@/lib/vehicle-debts";
import DebtItemsField from "@/components/DebtItemsField";
import {
  missingVehicleDocs,
  normalizeChassi,
  normalizeRenavam,
  isChassiComplete,
  isChassiPartial,
  renavamLooksOdd,
  CHASSI_LENGTH,
  RENAVAM_LENGTH,
} from "@/lib/vehicle-doc";
import { computeReturn, retornoLabel, RETORNO_RATE_PER_LEVEL } from "@/lib/retorno";
import BankInput from "@/components/BankInput";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import NewCustomerInline from "@/components/NewCustomerInline";

type Vehicle = {
  id: string;
  brand: string;
  model: string;
  plate: string;
  salePrice: number;
  // Documentos do veículo: se faltarem, o formulário os pede (obrigatórios).
  chassi?: string | null;
  renavam?: string | null;
  // Consignado: o carro é de terceiro; há um valor acertado com o proprietário
  // (supplier), do qual se descontam quitação/débitos, apurado no fechamento.
  consigned?: boolean;
  ownerRefundAmount?: number;
  payoffAmount?: number;
  debtsAmount?: number;
  supplier?: { name: string } | null;
  // Marca opcional exibida no seletor quando o veículo já tem pré-venda aberta.
  preSaleTag?: string;
  /** Renave: o que falta para escriturar a saída deste veículo (só aviso). */
  renavePendencias?: string[];
};
type Customer = { id: string; name: string };
type Financer = { id: string; name: string; returnTaxPercent: number; sellerReturnPercent: number };
type UserOption = { id: string; name: string };
type Beneficiary = { id: string; name: string };

export type SaleFormInitial = {
  vehicleId?: string;
  customerId?: string;
  saleDate?: string;
  totalAmount?: number;
  paymentMethod?: "A_VISTA" | "PARCELADO" | "FINANCIADO";
  /** Venda paga com o capital de um sócio (abatida no fechamento). */
  capitalPayerBeneficiaryId?: string;
  downPayment?: number;
  installmentsCount?: number;
  financerAccountId?: string;
  /** Financeira/banco indicado pelo cliente (não conveniada à loja). */
  financerNameManual?: string;
  financedAmount?: number;
  financedAlreadyReceived?: boolean;
  returnLevel?: number;
  sellerName?: string;
  sellerId?: string;
  commissionAmount?: number;
  referrals?: { name: string; amount: number }[];
  transferCharged?: boolean;
  transferAmount?: number;
  takeReturnCommission?: boolean;
  insuranceSold?: boolean;
  viaPaidTraffic?: boolean;
  installmentsInfoCount?: number;
  installmentsInfoAmount?: number;
  notes?: string;
  ownerRefundToCapital?: boolean;
  ownerRefundBeneficiaryId?: string;
  commissionToCapital?: boolean;
  buyerBankName?: string;
  buyerBankAgency?: string;
  buyerBankAccount?: string;
  buyerBankAccountType?: string;
  buyerPixKey?: string;
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
  tiSalePrice?: number;
  tiPayoff?: number;
  tiPayoffTo?: string;
  tiDebts?: number;
  tiDebtsItems?: VehicleDebtItem[];
  tiSupplierName?: string;
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
  users = [],
  beneficiaries = [],
  sellersWithCapital = [],
  advances = {},
  preselectedVehicleId,
  currentUserId,
  initial,
  preSaleId,
  renavePrazo,
}: {
  vehicles: Vehicle[];
  customers: Customer[];
  financers: Financer[];
  users?: UserOption[];
  beneficiaries?: Beneficiary[];
  sellersWithCapital?: string[];
  advances?: Record<string, number>;
  preselectedVehicleId?: string;
  currentUserId?: string;
  initial?: SaleFormInitial;
  preSaleId?: string;
  /** Data em que a obrigatoriedade do Renave entra em vigor (texto do aviso). */
  renavePrazo?: string;
}) {
  const [state, formAction, pending] = useActionState(createPreSaleAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [vehicleId, setVehicleId] = useState(initial?.vehicleId || preselectedVehicleId || "");
  const [customerId, setCustomerId] = useState(initial?.customerId || "");
  // Lista de clientes editável: permite cadastrar um novo cliente sem sair da tela.
  const [customerList, setCustomerList] = useState<Customer[]>(customers);
  const [newCustomer, setNewCustomer] = useState(false);
  const customerName = customerList.find((c) => c.id === customerId)?.name ?? "";

  // Aviso em tempo real: veículo já pré-vendido para OUTRO cliente. Checa assim
  // que veículo + cliente estão escolhidos, sem esperar o envio.
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  useEffect(() => {
    // A action já devolve { conflict: false } quando falta veículo ou cliente,
    // então a mensagem é limpa sozinha ao trocar a seleção.
    let cancelled = false;
    checkPreSaleConflictAction(vehicleId, customerId, preSaleId).then((r) => {
      if (!cancelled) setConflictMsg(r.conflict ? r.message ?? null : null);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, customerId, preSaleId]);
  // "CAPITAL_SOCIO" é opção só da tela: no envio vira PARCELADO 1x sem entrada
  // + capitalPayerBeneficiaryId (o servidor abate do capital no fechamento).
  const [paymentMethod, setPaymentMethod] = useState<
    "A_VISTA" | "PARCELADO" | "FINANCIADO" | "CAPITAL_SOCIO"
  >(initial?.capitalPayerBeneficiaryId ? "CAPITAL_SOCIO" : initial?.paymentMethod || "A_VISTA");
  const [capitalPayerId, setCapitalPayerId] = useState<string>(
    initial?.capitalPayerBeneficiaryId || "",
  );

  const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === vehicleId), [vehicles, vehicleId]);
  // Documentos que faltam no veículo escolhido. Sem RENAVAM ou chassi a venda
  // não pode ser registrada (o contrato de compra sai com uma linha em branco
  // para preencher à mão), então o formulário pede aqui — e o que for digitado
  // vai para a FICHA do veículo, não para a pré-venda.
  const [vehicleChassi, setVehicleChassi] = useState("");
  const [vehicleRenavam, setVehicleRenavam] = useState("");
  const missingDocs = selectedVehicle ? missingVehicleDocs(selectedVehicle) : [];
  // Chassi parcial conta como faltando: a consulta por placa devolve mascarado
  // (ex.: *****39578) e é assim que fica gravado.
  const needsChassi = Boolean(selectedVehicle) && !isChassiComplete(selectedVehicle?.chassi);
  const chassiParcial = isChassiPartial(selectedVehicle?.chassi)
    ? normalizeChassi(selectedVehicle?.chassi)
    : null;
  const needsRenavam = Boolean(selectedVehicle) && !normalizeRenavam(selectedVehicle?.renavam);
  // Consignado: destino do valor a devolver ao proprietário (pagar ao dono vs
  // aportar no capital de um beneficiário). O valor em si vem do veículo.
  const isConsigned = Boolean(selectedVehicle?.consigned);
  const ownerRefundAmount = selectedVehicle?.ownerRefundAmount ?? 0;
  const ownerPayoff = selectedVehicle?.payoffAmount ?? 0;
  const ownerDebts = selectedVehicle?.debtsAmount ?? 0;
  const ownerRefundLiquido = Math.max(0, Math.round((ownerRefundAmount - ownerPayoff - ownerDebts) * 100) / 100);
  const [ownerRefundToCapital, setOwnerRefundToCapital] = useState<boolean>(
    Boolean(initial?.ownerRefundToCapital),
  );
  const [ownerRefundBeneficiaryId, setOwnerRefundBeneficiaryId] = useState<string>(
    initial?.ownerRefundBeneficiaryId || "",
  );
  // Vendedor selecionado (controlado) para decidir se oferece aplicar a comissão
  // no capital dele (só quando o vendedor é beneficiário do capital).
  const [sellerId, setSellerId] = useState(initial?.sellerId ?? currentUserId ?? "");
  const [commissionToCapital, setCommissionToCapital] = useState<boolean>(
    Boolean(initial?.commissionToCapital),
  );
  const sellerHasCapital = !!sellerId && sellersWithCapital.includes(sellerId);
  const [totalAmount, setTotalAmount] = useState<string>(
    initial?.totalAmount != null ? String(initial.totalAmount) : selectedVehicle ? String(selectedVehicle.salePrice) : "",
  );

  // Indicações de venda: nome + valor; preencher a última linha abre a próxima
  // (sem limite). Cada indicação com valor vira conta a pagar (Comissão).
  type ReferralRow = { name: string; amount: string };
  const [referrals, setReferrals] = useState<ReferralRow[]>(
    (initial?.referrals ?? []).map((r) => ({ name: r.name, amount: r.amount ? String(r.amount) : "" })),
  );
  const referralRows: ReferralRow[] = [...referrals, { name: "", amount: "" }];
  function setReferralField(index: number, field: keyof ReferralRow, value: string) {
    setReferrals((prev) => {
      const rows = [...prev];
      if (index === rows.length) rows.push({ name: "", amount: "" });
      rows[index] = { ...rows[index], [field]: value };
      // Remove linhas vazias do fim (a linha "próxima" é renderizada à parte).
      while (rows.length > 0 && !rows[rows.length - 1].name.trim() && !rows[rows.length - 1].amount) {
        rows.pop();
      }
      return rows;
    });
  }
  function removeReferral(index: number) {
    setReferrals((prev) => prev.filter((_, i) => i !== index));
  }
  // Transferência (DETRAN) cobrada: quando marcada, vira conta a pagar (custo).
  const [transferCharged, setTransferCharged] = useState(Boolean(initial?.transferCharged));
  const referralsJson = JSON.stringify(
    referrals
      .filter((r) => r.name.trim() || Number(r.amount) > 0)
      .map((r) => ({ name: r.name.trim(), amount: Number(r.amount) || 0 })),
  );

  // Troca (veículo recebido do cliente, cadastrado aqui mesmo)
  const [tradeIn, setTradeIn] = useState(!!initial?.tradeIn);
  const [tiNegotiated, setTiNegotiated] = useState(initial?.tiNegotiated ?? 0);
  const [tiSalePrice, setTiSalePrice] = useState(initial?.tiSalePrice ?? 0);
  const [tiPayoff, setTiPayoff] = useState(initial?.tiPayoff ?? 0);
  const [tiDebts, setTiDebts] = useState(initial?.tiDebts ?? 0);
  // Fornecedor do veículo recebido em troca: por padrão é o próprio cliente que
  // está comprando (foi ele que "vendeu" o carro à loja). Editável.
  const [tiSupplier, setTiSupplier] = useState(initial?.tiSupplierName ?? "");
  const tiSupplierEdited = useRef(!!initial?.tiSupplierName);
  useEffect(() => {
    if (tradeIn && !tiSupplierEdited.current && customerName) setTiSupplier(customerName);
  }, [tradeIn, customerName]);
  const tiLiquido = Math.max(0, Math.round((tiNegotiated - tiPayoff - tiDebts) * 100) / 100);
  const total = Number(totalAmount) || 0;
  const sinal = advances[vehicleId] || 0;
  const restante = Math.max(0, Math.round((total - tiLiquido) * 100) / 100);

  // Financiamento: valor financiado pelo banco e a entrada (restante) paga agora.
  // O sinal já recebido também abate do que o cliente ainda tem a pagar.
  const [financedAmount, setFinancedAmount] = useState<string>(
    initial?.financedAmount != null ? String(initial.financedAmount) : "",
  );
  const [financedAlreadyReceived, setFinancedAlreadyReceived] = useState<boolean>(
    Boolean(initial?.financedAlreadyReceived),
  );
  const [financerAccountId, setFinancerAccountId] = useState(initial?.financerAccountId || "");
  // Financeira indicada pelo cliente (não conveniada): sem conta própria, só o
  // nome — o repasse vira conta a receber comum. Liga quando a pré-venda veio
  // com um nome manual e sem conta escolhida.
  const [externalFinancer, setExternalFinancer] = useState(
    Boolean(initial?.financerNameManual && !initial?.financerAccountId),
  );
  const [financerNameManual, setFinancerNameManual] = useState(initial?.financerNameManual || "");
  // Retorno da financeira (comissão sobre o financiado); 0 = sem retorno.
  const [returnLevel, setReturnLevel] = useState<string>(
    initial?.returnLevel ? String(initial.returnLevel) : "0",
  );
  const selectedFinancer = financers.find((f) => f.id === financerAccountId);
  const financerTaxPercent = selectedFinancer?.returnTaxPercent ?? 0;
  const sellerReturnPercent = selectedFinancer?.sellerReturnPercent ?? 0;
  // Comissão do vendedor sobre o retorno (facultativa): % do líquido.
  const [takeReturnCommission, setTakeReturnCommission] = useState(
    initial?.takeReturnCommission ?? true,
  );
  // Seguro vendido junto ao financiamento: só a marcação. Valor e data não são
  // conhecidos agora — entram quando a comissão cair (tela Financiamentos).
  const [insuranceSold, setInsuranceSold] = useState(initial?.insuranceSold ?? false);
  // Restante depois de troca e sinal — pode ficar negativo (troca + sinal já
  // passam do valor da venda), e aí o excedente já é devolução ao cliente.
  const rawRestante = Math.round((total - tiLiquido - sinal) * 100) / 100;
  const restanteFin = Math.max(0, rawRestante);
  const baseDevolucao = Math.max(0, Math.round(-rawRestante * 100) / 100);
  const financedTyped = Number(financedAmount) || 0;
  // Parte do financiamento que cobre o carro; o resto (se houver) é devolução.
  const financedParaCarro = Math.min(financedTyped, restanteFin);
  const entradaFinanciamento = Math.max(0, Math.round((restanteFin - financedParaCarro) * 100) / 100);
  // Financiamento já recebido (está no sinal): não gera devolução do excedente.
  const financedAlreadyIn = paymentMethod === "FINANCIADO" && financedAlreadyReceived;
  // Devolução = excedente de (troca + sinal) + excedente do financiamento.
  const devolucaoCliente =
    paymentMethod === "FINANCIADO" && !financedAlreadyIn
      ? Math.round((baseDevolucao + Math.max(0, financedTyped - restanteFin)) * 100) / 100
      : baseDevolucao;
  // Retorno da financeira: incide sobre o valor financiado (o typed; se vazio,
  // financia todo o restante). Só vale com financeira escolhida.
  const financedEffetivo = financedTyped > 0 ? financedTyped : restanteFin;
  const retornoNivel = Math.max(0, Math.floor(Number(returnLevel) || 0));
  const retorno = computeReturn(financedEffetivo, retornoNivel, financerTaxPercent);
  // Comissão do retorno para o vendedor = % do líquido (config. na financeira).
  const returnCommission = Math.round(retorno.net * (sellerReturnPercent / 100) * 100) / 100;
  const methodLabel =
    paymentMethod === "A_VISTA"
      ? "à vista"
      : paymentMethod === "PARCELADO"
        ? "parcelado"
        : paymentMethod === "CAPITAL_SOCIO"
          ? "no capital do sócio"
          : "financiado";
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
      // Preço de venda (anúncio) do carro recebido = valor FIPE (editável).
      if (dt.fipePrice && dt.fipePrice > 0) setTiSalePrice(dt.fipePrice);
      setTiMsg(
        `Dados encontrados: ${[dt.brand, dt.model].filter(Boolean).join(" ")}` +
          (dt.fipePrice ? ` · FIPE ${formatCurrency(dt.fipePrice)}` : "") +
          ".",
      );
    });
  }

  function handleVehicleChange(id: string) {
    setVehicleId(id);
    const v = vehicles.find((x) => x.id === id);
    if (v) setTotalAmount(String(v.salePrice));
    // Trocar de veículo descarta o que foi digitado para o anterior.
    setVehicleChassi("");
    setVehicleRenavam("");
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
      <ProcessingOverlay show={pending} label="Gerando a pré-venda… aguarde. Não feche esta página." />
      {conflictMsg ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {conflictMsg}
        </div>
      ) : null}
      {state.error && state.error !== conflictMsg ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      {preSaleId ? <input type="hidden" name="preSaleId" value={preSaleId} /> : null}
      <input type="hidden" name="referrals" value={referralsJson} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Veículo" required>
          <Select name="vehicleId" value={vehicleId} onChange={(e) => handleVehicleChange(e.target.value)} required>
            <option value="">Selecione um veículo</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.brand} {v.model} - {v.plate} ({formatCurrency(v.salePrice)})
                {v.preSaleTag ? ` — ${v.preSaleTag}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        {/* Renave: aviso, nunca trava. A venda continua sendo registrada como
            hoje — o que muda a partir do prazo é que a saída do estoque também
            precisa do registro eletrônico. */}
        {selectedVehicle?.renavePendencias?.length ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 sm:col-span-2">
            <p className="text-sm font-medium text-amber-900">
              ⚠️ Renave: faltam dados da escrituração deste veículo
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
              {selectedVehicle.renavePendencias.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-amber-800">
              A venda pode ser registrada normalmente. Quando a obrigatoriedade do Renave entrar em vigor
              {renavePrazo ? `, em ${renavePrazo},` : ""} esta rotina não poderá ser concluída desta forma —
              a saída do estoque também terá de ser registrada eletronicamente. Os dados ficam na{" "}
              <strong>ficha do veículo → Renave</strong>.
            </p>
          </div>
        ) : null}
        {missingDocs.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
            <p className="text-sm font-medium text-amber-900">
              Documentos do veículo — obrigatórios para vender
            </p>
            <p className="mt-0.5 text-xs text-amber-800">
              Falta {missingDocs.join(" e ")}. Preencha para continuar: o dado é gravado na ficha do
              veículo e sai nos contratos.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {needsRenavam ? (
                <Field label="RENAVAM" required>
                  <Input
                    name="vehicleRenavam"
                    value={vehicleRenavam}
                    onChange={(e) => setVehicleRenavam(normalizeRenavam(e.target.value))}
                    inputMode="numeric"
                    placeholder={`${RENAVAM_LENGTH} dígitos`}
                    required
                  />
                  {renavamLooksOdd(vehicleRenavam) ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      O RENAVAM costuma ter {RENAVAM_LENGTH} dígitos — confira. Dá para salvar assim
                      mesmo.
                    </p>
                  ) : null}
                </Field>
              ) : null}
              {needsChassi ? (
                <Field label={`Chassi completo (${CHASSI_LENGTH} caracteres)`} required>
                  <Input
                    name="vehicleChassi"
                    value={vehicleChassi}
                    // Sem `*`: aqui o chassi tem de ser digitado por inteiro.
                    onChange={(e) =>
                      setVehicleChassi(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CHASSI_LENGTH))
                    }
                    className="uppercase"
                    placeholder={"A".repeat(CHASSI_LENGTH)}
                    pattern={`[A-Za-z0-9]{${CHASSI_LENGTH}}`}
                    minLength={CHASSI_LENGTH}
                    maxLength={CHASSI_LENGTH}
                    title={`O chassi tem ${CHASSI_LENGTH} caracteres`}
                    required
                  />
                  {chassiParcial ? (
                    <p className="mt-1 text-[11px] text-amber-700">
                      A busca pela placa trouxe o chassi incompleto ({chassiParcial}). Copie os{" "}
                      {CHASSI_LENGTH} caracteres do documento do carro.
                    </p>
                  ) : null}
                  {vehicleChassi.length > 0 && vehicleChassi.length < CHASSI_LENGTH ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {vehicleChassi.length} de {CHASSI_LENGTH} caracteres
                    </p>
                  ) : null}
                </Field>
              ) : null}
            </div>
          </div>
        ) : null}
        <Field label="Cliente" required>
          <Select
            name="customerId"
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Selecione um cliente</option>
            {customerList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => setNewCustomer((v) => !v)}
            className="mt-1.5 text-sm font-medium text-blue-700 hover:underline"
          >
            {newCustomer ? "✕ Cancelar novo cliente" : "+ Cadastrar novo cliente"}
          </button>
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
          <Select name="sellerId" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
            <option value="">— selecione —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Comissão do vendedor (R$)">
          <Input
            type="number"
            step="0.01"
            min={0}
            name="commissionAmount"
            defaultValue={initial?.commissionAmount ? String(initial.commissionAmount) : ""}
            placeholder="0,00 — opcional"
          />
          {sellerHasCapital ? (
            <label className="mt-1.5 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="commissionToCapital"
                value="true"
                checked={commissionToCapital}
                onChange={(e) => setCommissionToCapital(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Aplicar a comissão no capital do vendedor (aporte, em vez de pagar)
            </label>
          ) : null}
        </Field>
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
            Transferência cobrada na venda
          </label>
          {transferCharged ? (
            <>
              <Input
                type="number"
                step="0.01"
                min={0}
                name="transferAmount"
                defaultValue={initial?.transferAmount ? String(initial.transferAmount) : ""}
                placeholder="Valor da transferência (R$)"
                className="mt-2"
              />
              <p className="mt-1 text-xs text-slate-400">
                Vira uma conta a pagar (custo da venda) ao registrar, como a comissão.
              </p>
            </>
          ) : null}
        </Field>
        <Field label="Tráfego pago">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="viaPaidTraffic"
              value="true"
              defaultChecked={Boolean(initial?.viaPaidTraffic)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Vendido através do tráfego pago
          </label>
          <p className="mt-1 text-xs text-slate-400">
            Só informativo: o lucro líquido desta venda abate o investimento no card
            &quot;Tráfego pago&quot; do dashboard.
          </p>
        </Field>
        {/* Indicações ocupam a largura inteira, fora do fluxo de 2 colunas:
            com `contents`, o nome caía numa linha e o valor dele na seguinte —
            ninguém sabia qual valor era de qual pessoa. Aqui cada indicação é
            uma linha só, com o valor ao lado do nome. */}
        <div className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
          <p className="text-sm font-semibold text-slate-800">Indicações de venda</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Cada indicação com valor vira uma conta a pagar (Comissão) ao registrar a venda.
          </p>
          <div className="mt-3 space-y-3">
            {referralRows.map((row, i) => {
              const preenchida = i < referrals.length;
              return (
                // Sem `name` nos inputs: as indicações vão juntas no hidden "referrals".
                <div
                  key={i}
                  className={`grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_11rem_auto] ${
                    preenchida ? "" : "border-t border-dashed border-slate-200 pt-3"
                  }`}
                >
                  <Field label={preenchida ? `Quem indicou — ${i + 1}` : "Adicionar outra indicação"}>
                    <Input
                      value={row.name}
                      onChange={(e) => setReferralField(i, "name", e.target.value)}
                      placeholder="Nome de quem indicou"
                    />
                  </Field>
                  <Field label={preenchida ? `Vai receber (R$) — ${i + 1}` : "Vai receber (R$)"}>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={row.amount}
                      onChange={(e) => setReferralField(i, "amount", e.target.value)}
                      placeholder="0,00"
                    />
                  </Field>
                  <div className="pb-2">
                    {preenchida ? (
                      <button
                        type="button"
                        onClick={() => removeReferral(i)}
                        className="text-xs font-medium text-rose-600 hover:underline"
                      >
                        Remover
                      </button>
                    ) : (
                      <span className="block text-xs text-slate-400 sm:w-20">opcional</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <Field label="Forma de pagamento" required>
          {/* "Capital de sócio" é opção da tela: envia PARCELADO 1x sem entrada
              e o sócio pagador — o servidor abate do capital no fechamento. */}
          <input
            type="hidden"
            name="paymentMethod"
            value={paymentMethod === "CAPITAL_SOCIO" ? "PARCELADO" : paymentMethod}
          />
          {paymentMethod === "CAPITAL_SOCIO" ? (
            <>
              <input type="hidden" name="downPayment" value="0" />
              <input type="hidden" name="installmentsCount" value="1" />
            </>
          ) : null}
          <Select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
          >
            <option value="A_VISTA">À vista</option>
            <option value="PARCELADO">Parcelado (carnê da loja)</option>
            <option value="FINANCIADO">Financiado (banco/financeira)</option>
            {beneficiaries.length > 0 ? (
              <option value="CAPITAL_SOCIO">Capital de sócio (abate do saldo)</option>
            ) : null}
          </Select>
        </Field>
      </div>

      {paymentMethod === "CAPITAL_SOCIO" ? (
        <div className="rounded-lg border border-violet-300 bg-violet-50 p-4">
          <p className="mb-1 text-sm font-medium text-violet-900">💼 Pago com o capital de um sócio</p>
          <p className="mb-3 text-xs text-violet-800">
            Nenhum dinheiro entra no caixa: no fechamento, o valor da venda é quitado como{" "}
            <strong>retirada do capital</strong> do sócio escolhido (o saldo dele diminui). O
            cliente do contrato pode ser qualquer pessoa — o sócio é só quem paga.
          </p>
          <Field label="Sócio que paga com o capital" required>
            <Select
              name="capitalPayerBeneficiaryId"
              value={capitalPayerId}
              onChange={(e) => setCapitalPayerId(e.target.value)}
              required
            >
              <option value="">— selecione o sócio —</option>
              {beneficiaries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      {paymentMethod === "PARCELADO" || paymentMethod === "FINANCIADO" ? (
        (() => {
          // Financiamento por banco NÃO conveniado: o comprador paga direto ao
          // banco, sob o contrato dele — o parcelamento informado pela loja não
          // se aplica, então deixa de ser obrigatório (segue opcional).
          const parcelamentoOpcional = paymentMethod === "FINANCIADO" && externalFinancer;
          return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="mb-1 text-sm font-medium text-amber-900">Parcelamento informado ao comprador</p>
              <p className="mb-3 text-xs text-amber-800">
                {parcelamentoOpcional
                  ? "Opcional: o financiamento é por banco/financeira não conveniado — o comprador paga sob o contrato do banco. Preencha só se quiser que conste no contrato da loja."
                  : "Consta no contrato para evitar contestação futura. Informe exatamente como o comprador vai pagar (na loja ou no banco)."}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nº de parcelas" required={!parcelamentoOpcional}>
                  <Input
                    type="number"
                    min={1}
                    name="installmentsInfoCount"
                    defaultValue={initial?.installmentsInfoCount || ""}
                    required={!parcelamentoOpcional}
                  />
                </Field>
                <Field label="Valor da parcela (R$)" required={!parcelamentoOpcional}>
                  <Input
                    type="number"
                    step="0.01"
                    min={0.01}
                    name="installmentsInfoAmount"
                    defaultValue={initial?.installmentsInfoAmount || ""}
                    required={!parcelamentoOpcional}
                  />
                </Field>
              </div>
            </div>
          );
        })()
      ) : null}

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

      {/* Dados bancários do comprador para a DEVOLUÇÃO — só aparecem quando as
          entradas superam o preço (troca/sinal ou financiamento). Constam no
          contrato para deixar claro onde a loja fará o pagamento. */}
      {devolucaoCliente > 0 ? (
        <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">
            Dados bancários do comprador (para a devolução)
          </legend>
          <p className="text-xs text-slate-500">
            Constam no contrato: como as entradas superam o preço, a loja devolverá{" "}
            <strong>{formatCurrency(devolucaoCliente)}</strong> ao comprador nesta conta.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Banco">
              <BankInput name="buyerBankName" defaultValue={initial?.buyerBankName ?? ""} placeholder="Banco do comprador" />
            </Field>
            <Field label="Tipo de conta">
              <Select name="buyerBankAccountType" defaultValue={initial?.buyerBankAccountType ?? ""}>
                <option value="">—</option>
                <option value="Conta corrente">Conta corrente</option>
                <option value="Conta poupança">Conta poupança</option>
              </Select>
            </Field>
            <Field label="Agência">
              <Input name="buyerBankAgency" defaultValue={initial?.buyerBankAgency ?? ""} />
            </Field>
            <Field label="Conta">
              <Input name="buyerBankAccount" defaultValue={initial?.buyerBankAccount ?? ""} />
            </Field>
            <Field label="Chave PIX">
              <Input name="buyerPixKey" defaultValue={initial?.buyerPixKey ?? ""} placeholder="CPF, e-mail, telefone ou chave aleatória" />
            </Field>
          </div>
        </fieldset>
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
              {externalFinancer ? (
                <>
                  {/* Não conveniada: sem conta própria — só o nome, para o
                      contrato. financerAccountId vai vazio (repasse a receber). */}
                  <input type="hidden" name="financerAccountId" value="" />
                  <Input
                    name="financerNameManual"
                    value={financerNameManual}
                    onChange={(e) => setFinancerNameManual(e.target.value)}
                    placeholder="Nome do banco/financeira indicado pelo cliente"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Instituição <strong>não conveniada</strong> à loja: o valor será recebido dela
                    como conta a receber. O nome consta no contrato.
                  </p>
                </>
              ) : (
                <>
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
                      Nenhuma financeira conveniada cadastrada.{" "}
                      <a href="/financeiro/contas" className="underline">Cadastrar em Contas financeiras</a> (tipo Financeira).
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      O valor financiado fica na conta da financeira até ela pagar.
                    </p>
                  )}
                </>
              )}
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={externalFinancer}
                  onChange={(e) => {
                    setExternalFinancer(e.target.checked);
                    if (e.target.checked) setFinancerAccountId("");
                    else setFinancerNameManual("");
                  }}
                />
                Financiamento por banco/financeira <strong>indicado pelo cliente</strong> (não
                conveniado à loja)
              </label>
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
          <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="financedAlreadyReceived"
              value="true"
              checked={financedAlreadyReceived}
              onChange={(e) => setFinancedAlreadyReceived(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
            />
            <span>
              O valor financiado <strong>já foi recebido</strong> (já está no sinal/entradas).
              <span className="block text-xs text-slate-500">
                Marque quando o banco já depositou o valor na loja (está dentro do sinal). Não gera
                conta a receber do banco nem devolução ao cliente — evita contar o mesmo dinheiro duas
                vezes.
              </span>
            </span>
          </label>

          <div className="mt-4 border-t border-slate-200 pt-3">
            <Field label="Retorno da financeira (R-xx)">
              <Input
                type="number"
                min={0}
                step={1}
                name="returnLevel"
                value={returnLevel}
                onChange={(e) => setReturnLevel(e.target.value)}
                className="max-w-[140px]"
              />
            </Field>
            <p className="mt-1 text-xs text-slate-500">
              Comissão que a financeira paga à loja: {(RETORNO_RATE_PER_LEVEL * 100).toLocaleString("pt-BR")}% do
              financiado por nível (R-01 = 1,2%, R-02 = 2,4%…). Deixe 0 para nenhuma comissão.
            </p>
            {retornoNivel > 0 ? (
              !financerAccountId ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
                  Escolha a financeira acima para calcular e receber o retorno.
                </p>
              ) : (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-white p-3 text-sm">
                  <div className="space-y-1">
                    <SummaryRow
                      label={`${retornoLabel(retornoNivel)} · ${(retornoNivel * RETORNO_RATE_PER_LEVEL * 100).toLocaleString("pt-BR")}% de ${formatCurrency(financedEffetivo)}`}
                      value={retorno.gross}
                    />
                    <SummaryRow label={`(−) Imposto retido (${financerTaxPercent.toLocaleString("pt-BR")}%)`} value={retorno.tax} tone="rose" />
                    <SummaryRow label="= Retorno líquido (entra como receita/lucro)" value={retorno.net} strong tone="green" top />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    O líquido entra na conta da financeira (que passa a dever à loja) e é recebido
                    separado do repasse, na tela Financiamentos.
                  </p>
                  {sellerReturnPercent > 0 && retorno.net > 0 ? (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          name="takeReturnCommission"
                          value="true"
                          checked={takeReturnCommission}
                          onChange={(e) => setTakeReturnCommission(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Pagar comissão do retorno ao vendedor
                        ({sellerReturnPercent.toLocaleString("pt-BR")}% do líquido)
                      </label>
                      {takeReturnCommission ? (
                        <p className="mt-1 text-xs text-slate-500">
                          Comissão do vendedor: <strong>{formatCurrency(returnCommission)}</strong> — vira
                          uma conta a pagar (custo da venda), como a comissão comum.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            ) : null}

            <div className="mt-4 border-t border-slate-200 pt-3">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="insuranceSold"
                  value="true"
                  checked={insuranceSold}
                  onChange={(e) => setInsuranceSold(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  Seguro vendido no financiamento (comissão a receber)
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Marque para não esquecer da comissão do seguro. Nada é lançado agora — o valor
                    e a data são informados quando o dinheiro cair, na tela Financiamentos.
                  </span>
                </span>
              </label>
            </div>
          </div>
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
                  {financerAccountId ? (
                    // Financeira conveniada: o financiado entra na conta dela; só
                    // a entrada do cliente fica a receber.
                    <>
                      <SummaryRow label="(−) Financiado pela financeira" value={financedTyped} />
                      <SummaryRow
                        label="= Entrada do cliente → Contas a Receber"
                        value={entradaFinanciamento}
                        strong
                        tone="green"
                        top
                      />
                    </>
                  ) : (
                    // Banco NÃO conveniado: duas contas a receber — a do banco
                    // (repasse) e, se houver, o saldo/entrada do cliente.
                    <>
                      <SummaryRow
                        label={`= Repasse do banco${financerNameManual ? ` (${financerNameManual})` : ""} → Contas a Receber`}
                        value={financedTyped}
                        strong
                        tone="green"
                        top
                      />
                      {entradaFinanciamento > 0 ? (
                        <SummaryRow
                          label="= Saldo/entrada do cliente → Contas a Receber"
                          value={entradaFinanciamento}
                          strong
                          tone="green"
                        />
                      ) : null}
                    </>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {financerAccountId
                    ? "A entrada do cliente vai para Contas a Receber (pendente): quando ele pagar — total ou parcial — você dá baixa na conta do depósito. O valor financiado entra na conta da financeira."
                    : entradaFinanciamento > 0
                      ? "Banco não conveniado: são geradas DUAS contas a receber — o repasse do banco e o saldo/entrada do cliente. Cada uma é baixada quando o dinheiro cair."
                      : "Banco não conveniado: o valor financiado fica como conta a receber do banco (repasse), baixada quando o dinheiro cair."}
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
              <Field label="Fornecedor (quem entregou o veículo)">
                <Input
                  name="tiSupplierName"
                  value={tiSupplier}
                  onChange={(e) => {
                    tiSupplierEdited.current = true;
                    setTiSupplier(e.target.value);
                  }}
                  placeholder="Nome de quem entregou o carro"
                />
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
              <Field label="Preço de venda (anúncio / FIPE)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  name="tiSalePrice"
                  value={tiSalePrice || ""}
                  onChange={(e) => setTiSalePrice(Number(e.target.value) || 0)}
                  placeholder="Vem da FIPE ao buscar a placa"
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
                <DebtItemsField
                  name="tiDebtsItems"
                  initialItems={initial?.tiDebtsItems ?? []}
                  agreed={tiDebts}
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

      {isConsigned ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4">
          <p className="text-sm font-medium text-slate-700">Devolução ao proprietário (consignado)</p>
          <p className="mt-1 text-sm text-slate-600">
            Este veículo é consignado{selectedVehicle?.supplier?.name ? ` de ${selectedVehicle.supplier.name}` : ""}.
            Valor acertado:{" "}
            <strong className="tabular-nums">{formatCurrency(ownerRefundAmount)}</strong>
            {ownerPayoff > 0 || ownerDebts > 0 ? (
              <>
                {" "}− quitação <strong className="tabular-nums">{formatCurrency(ownerPayoff)}</strong>
                {" "}− débitos <strong className="tabular-nums">{formatCurrency(ownerDebts)}</strong>
                {" = "}
              </>
            ) : (
              " → "
            )}
            líquido ao proprietário{" "}
            <strong className="tabular-nums text-emerald-700">{formatCurrency(ownerRefundLiquido)}</strong>.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="ownerRefundToCapital"
              value="true"
              checked={ownerRefundToCapital}
              onChange={(e) => setOwnerRefundToCapital(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Aplicar no capital de um beneficiário (em vez de pagar o proprietário)
          </label>
          {ownerRefundToCapital ? (
            <div className="mt-3">
              <Field label="Beneficiário do capital" required>
                <Select
                  name="ownerRefundBeneficiaryId"
                  value={ownerRefundBeneficiaryId}
                  onChange={(e) => setOwnerRefundBeneficiaryId(e.target.value)}
                >
                  <option value="">Selecione o beneficiário</option>
                  {beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="mt-1 text-xs text-slate-500">
                O <strong>líquido</strong> vira um <strong>aporte de capital</strong> do beneficiário
                (o dinheiro fica na empresa) — não é pago ao proprietário nem sai do caixa. A
                quitação e os débitos continuam sendo pagos aos credores.
              </p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Ao registrar a venda, o <strong>líquido</strong> vira uma <strong>conta a pagar</strong>{" "}
              ao proprietário (categoria Devolução ao proprietário); a quitação e os débitos viram
              contas a pagar aos credores.
            </p>
          )}
        </div>
      ) : null}

      <Field label="Observações (uso interno)">
        <Textarea name="notes" rows={3} defaultValue={initial?.notes || ""} />
        <p className="mt-1 text-xs text-slate-500">
          Não sai no contrato. Aparece na ficha da venda e no documento interno da revenda.
        </p>
      </Field>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <p className="text-xs text-slate-500 sm:mr-auto">
          Ao gerar, cria-se uma <strong>pré-venda</strong> (ficha de negócio) para revisar e imprimir.
          Nada é lançado no financeiro até você clicar em “Registrar venda” na ficha.
        </p>
        <Button type="submit" disabled={pending || !!conflictMsg}>
          {pending ? "Gerando..." : preSaleId ? "Salvar pré-venda →" : "Gerar pré-venda →"}
        </Button>
      </div>
    </form>
  );
}
