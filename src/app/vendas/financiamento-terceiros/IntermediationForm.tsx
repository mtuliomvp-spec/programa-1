"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CHASSI_LENGTH, RENAVAM_LENGTH } from "@/lib/vehicle-doc";
import BankInput from "@/components/BankInput";
import MoneyInput from "@/components/MoneyInput";
import NewCustomerInline from "@/components/NewCustomerInline";
import NewSupplierInline from "@/components/NewSupplierInline";
import { lookupPlateAction } from "@/app/estoque/actions";
import { lookupCnpjAction } from "@/app/cnpj-actions";
import { lookupCepAction } from "@/app/cep-actions";
import { findPersonByDocument } from "@/app/person-lookup";
import { toDateInputValue, formatCurrency } from "@/lib/format";
import { computeReturn, retornoLabel } from "@/lib/retorno";
import { createIntermediationPreSaleAction, readIntermediationCrlvAction } from "./actions";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import type { IntermediationFormState } from "./core";

type Customer = {
  id: string;
  name: string;
  document?: string | null;
  phone?: string | null;
  address?: string | null;
};
type Financer = { id: string; name: string; returnTaxPercent: number; sellerReturnPercent: number };
type UserOption = { id: string; name: string };

export type IntermediationInitial = {
  customerId?: string;
  saleDate?: string;
  ownerName?: string;
  ownerDocument?: string;
  ownerPhone?: string;
  ownerAddress?: string;
  buyerBankName?: string;
  buyerBankAgency?: string;
  buyerBankAccount?: string;
  buyerBankAccountType?: string;
  buyerPixKey?: string;
  brand?: string;
  model?: string;
  version?: string;
  manufactureYear?: number;
  modelYear?: number;
  plate?: string;
  chassi?: string;
  renavam?: string;
  color?: string;
  km?: number;
  fuel?: string;
  transmission?: string;
  financingAmount?: number;
  refundAmount?: number;
  refinancing?: boolean;
  financerAccountId?: string;
  returnLevel?: number;
  takeReturnCommission?: boolean;
  sellerId?: string;
  commissionAmount?: number;
  transferCharged?: boolean;
  transferAmount?: number;
  referrals?: { name: string; amount: number }[];
  installmentsInfoCount?: number;
  installmentsInfoAmount?: number;
  notes?: string;
  payoffBank?: string;
  payoffAmount?: number;
  zeroKm?: boolean;
  manufacturerName?: string;
  payoffBarcode?: string;
  payoffDueDate?: string;
  /** Boletos já anexados (edição) — só para mostrar que existem. */
  payoffBoletos?: { id: string; filename: string }[];
  /** CRLVs já anexados (edição). */
  crlvs?: { id: string; filename: string; description: string }[];
};

const initialState: IntermediationFormState = {};

export default function IntermediationForm({
  customers,
  financers,
  users,
  initial,
  preSaleId,
}: {
  customers: Customer[];
  financers: Financer[];
  users: UserOption[];
  initial?: IntermediationInitial;
  preSaleId?: string;
}) {
  const [state, formAction, pending] = useActionState(createIntermediationPreSaleAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [looking, startLookup] = useTransition();
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [ownerLookup, startOwnerLookup] = useTransition();
  const [ownerMsg, setOwnerMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [cepLookup, startCepLookup] = useTransition();
  const [cepMsg, setCepMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [crlvReading, startCrlvRead] = useTransition();
  const [crlvMsg, setCrlvMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [crlvExercicio, setCrlvExercicio] = useState("");
  // Tipo do documento lido (CRLV ou NF) e o nº da nota: definem como o arquivo
  // é anexado ao veículo quando a ficha é salva.
  const [crlvDocumento, setCrlvDocumento] = useState("");
  const [crlvNumeroNota, setCrlvNumeroNota] = useState("");
  // 0 km: sem placa/RENAVAM até o emplacamento (marcado sozinho ao ler a NF).
  // A montadora fica em estado (não em `setField`): o campo só existe no DOM
  // depois que o 0 km é marcado, e a leitura preenche os dois de uma vez.
  const [zeroKm, setZeroKm] = useState(Boolean(initial?.zeroKm));
  const [manufacturerName, setManufacturerName] = useState(initial?.manufacturerName ?? "");

  const [refinancing, setRefinancing] = useState(Boolean(initial?.refinancing));
  const [customerList, setCustomerList] = useState<Customer[]>(customers);
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [newCustomer, setNewCustomer] = useState(false);
  const [customerPrefill, setCustomerPrefill] = useState<{
    name?: string;
    document?: string;
    phone?: string;
    address?: string;
  }>({});
  const [newSupplier, setNewSupplier] = useState(false);
  const [supplierPrefill, setSupplierPrefill] = useState<{
    name?: string;
    document?: string;
    phone?: string;
    address?: string;
  }>({});
  const [ownerPickId, setOwnerPickId] = useState("");
  // Nome do proprietário "ao vivo", para replicar no campo Cliente no refinanciamento.
  const [ownerNameLive, setOwnerNameLive] = useState(initial?.ownerName ?? "");
  const [financing, setFinancing] = useState(initial?.financingAmount ?? 0);
  const [refund, setRefund] = useState(initial?.refundAmount ?? 0);
  const [commission, setCommission] = useState(initial?.commissionAmount ?? 0);
  const [transferCharged, setTransferCharged] = useState(Boolean(initial?.transferCharged));
  const [transferAmount, setTransferAmount] = useState(initial?.transferAmount ?? 0);
  const [financerId, setFinancerId] = useState(initial?.financerAccountId ?? "");
  const [returnLevel, setReturnLevel] = useState(initial?.returnLevel ?? 0);
  const [takeReturnCommission, setTakeReturnCommission] = useState(Boolean(initial?.takeReturnCommission));
  const [referrals, setReferrals] = useState<{ name: string; amount: number }[]>(initial?.referrals ?? []);
  const [payoffEnabled, setPayoffEnabled] = useState(Boolean(initial?.payoffAmount && initial.payoffAmount > 0));
  const [payoffAmount, setPayoffAmount] = useState(initial?.payoffAmount ?? 0);

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
  // No refinanciamento a loja não fica com F − D (o valor vai direto ao financiado);
  // a receita é só o retorno.
  const grossProfit = refinancing ? 0 : Math.max(0, financing - refund); // lucro bruto (F − D)
  // Bloco do FINANCIAMENTO: lucro bruto menos as despesas da operação.
  const sobraFinanciamento =
    grossProfit - (commission || 0) - (transferCharged ? transferAmount || 0 : 0) - referralsTotal;
  // Bloco do RETORNO: retorno líquido menos a comissão do retorno.
  const retornoNet = retorno ? retorno.net : 0;
  const sobraRetorno = retornoNet - returnSellerCommission;
  const netProfit = sobraFinanciamento + sobraRetorno;

  function setField(name: string, value: string | undefined) {
    if (!value) return;
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement) el.value = value;
  }

  function readField(name: string): string {
    const el = formRef.current?.elements.namedItem(name);
    return el instanceof HTMLInputElement ? el.value.trim() : "";
  }

  // Preenche os dados do proprietário a partir de um cliente já cadastrado.
  function handlePickOwnerCustomer(id: string) {
    setOwnerPickId(id);
    const c = customerList.find((x) => x.id === id);
    if (!c) return;
    setField("ownerName", c.name);
    setOwnerNameLive(c.name);
    setField("ownerDocument", c.document ?? undefined);
    setField("ownerPhone", c.phone ?? undefined);
    setField("ownerAddress", c.address ?? undefined);
    setOwnerMsg({ tone: "ok", text: `Proprietário preenchido com o cliente ${c.name}.` });
  }

  // Ao sair do CPF/CNPJ, reaproveita um cadastro já existente (cliente OU
  // fornecedor): traz nome/telefone/endereço para os campos ainda vazios, para
  // que o proprietário fique completo na operação e no contrato.
  function handleOwnerDocBlur() {
    const doc = readField("ownerDocument");
    if (!doc) return;
    startOwnerLookup(async () => {
      const r = await findPersonByDocument(doc);
      if (!r.found) return;
      if (!readField("ownerName")) {
        setField("ownerName", r.data.name);
        setOwnerNameLive(r.data.name);
      }
      if (!readField("ownerPhone")) setField("ownerPhone", r.data.phone);
      if (!readField("ownerAddress")) setField("ownerAddress", r.data.address);
      setOwnerMsg({ tone: "ok", text: `Cadastro encontrado (${r.source}): dados trazidos.` });
    });
  }

  /**
   * Documento do veículo anexado — CRLV (usado) ou NOTA FISCAL (0 km): a IA lê
   * e preenche o PROPRIETÁRIO (no CRLV é o proprietário; na NF, o destinatário
   * da nota — nome, CPF/CNPJ, telefone e endereço) e o VEÍCULO (placa,
   * marca/modelo, versão, anos, cor, combustível, chassi, RENAVAM). O documento
   * é a verdade, então nome e CPF/CNPJ sobrescrevem; telefone, endereço, versão
   * e câmbio só entram quando o campo está vazio. NF de 0 km não tem placa nem
   * RENAVAM — o aviso diz isso, para o usuário completar quando emplacar.
   */
  function handleCrlvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCrlvMsg(null);
    startCrlvRead(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const r = await readIntermediationCrlvAction(fd);
      if (!r.ok) {
        setCrlvMsg({ tone: "err", text: r.error });
        return;
      }
      const d = r.data;
      const ehNota = d.documento === "NF";
      const nomeDoc = ehNota ? "Nota fiscal" : "CRLV";
      const lido = ehNota ? "Nota fiscal lida" : "CRLV lido";
      const preenchidos: string[] = [];
      const placaAtual = readField("plate").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (d.placa && placaAtual && placaAtual !== d.placa) {
        setCrlvMsg({
          tone: "err",
          text: `Este ${nomeDoc} é da placa ${d.placa}, mas o formulário está com ${placaAtual}. Nada foi preenchido — confira o arquivo.`,
        });
        return;
      }
      if (d.proprietario) {
        setField("ownerName", d.proprietario);
        setOwnerNameLive(d.proprietario);
        preenchidos.push("proprietário");
      }
      if (d.cpfCnpj) {
        setField("ownerDocument", d.cpfCnpj);
        preenchidos.push("CPF/CNPJ");
      }
      // Telefone e endereço: a NF traz os do destinatário; não sobrescreve o
      // que o usuário já digitou.
      if (d.telefone && !readField("ownerPhone")) {
        setField("ownerPhone", d.telefone);
        preenchidos.push("telefone");
      }
      if (d.endereco && !readField("ownerAddress")) {
        setField("ownerAddress", d.endereco);
        preenchidos.push("endereço");
      }
      if (d.placa) setField("plate", d.placa);
      if (d.marca) setField("brand", d.marca);
      if (d.modelo) setField("model", d.modelo);
      if (d.versao && !readField("version")) setField("version", d.versao);
      if (d.anoFabricacao) setField("manufactureYear", String(d.anoFabricacao));
      if (d.anoModelo) setField("modelYear", String(d.anoModelo));
      if (d.cor) setField("color", d.cor);
      if (d.combustivel) setField("fuel", d.combustivel);
      if (d.chassi) setField("chassi", d.chassi);
      if (d.renavam) setField("renavam", d.renavam);
      if (d.transmissao && !readField("transmission")) setField("transmission", d.transmissao);
      if (d.placa || d.marca || d.chassi) preenchidos.push("veículo");
      setCrlvExercicio(d.exercicio ?? "");
      setCrlvDocumento(d.documento ?? "");
      setCrlvNumeroNota(d.numeroNota ?? "");
      // NF: é 0 km — marca a opção e traz a montadora emitente da nota.
      if (ehNota) {
        setZeroKm(true);
        if (d.emitente) {
          setManufacturerName(d.emitente);
          preenchidos.push("montadora");
        }
      }
      setCrlvMsg({
        tone: "ok",
        text: !preenchidos.length
          ? `${lido}, mas não foi possível identificar os dados. Preencha à mão.`
          : `${lido}: ${preenchidos.join(", ")} preenchido(s).` +
            (ehNota
              ? " Marcado como veículo 0 km: a operação é registrada sem placa e sem RENAVAM (o carro é identificado pelo chassi)."
              : " Confira e complete telefone e endereço."),
      });
      // Cadastro já existente com esse CPF/CNPJ: completa o que ficou vazio.
      if (d.cpfCnpj) handleOwnerDocBlur();
    });
  }

  // Proprietário pessoa jurídica: busca nome/telefone/endereço pelo CNPJ.
  function handleOwnerCnpjLookup() {
    const doc = readField("ownerDocument");
    const digits = doc.replace(/\D/g, "");
    if (digits.length !== 14) {
      setOwnerMsg({ tone: "err", text: "Para buscar pelo CNPJ, digite os 14 números (pessoa jurídica)." });
      return;
    }
    setOwnerMsg(null);
    startOwnerLookup(async () => {
      const r = await lookupCnpjAction(doc);
      if (!r.ok) {
        setOwnerMsg({ tone: "err", text: r.error });
        return;
      }
      const nome = r.data.name || r.data.fantasia;
      setField("ownerName", nome);
      setField("ownerPhone", r.data.phone);
      setField("ownerAddress", r.data.address);
      if (nome) setOwnerNameLive(nome);
      setOwnerMsg({ tone: "ok", text: `Dados encontrados: ${r.data.name ?? ""}. Confira e complete.` });
    });
  }

  // Busca o endereço do proprietário pelo CEP (preenche o campo Endereço).
  function handleOwnerCepLookup() {
    const cep = readField("ownerCep");
    if (!cep.replace(/\D/g, "")) {
      setCepMsg({ tone: "err", text: "Digite o CEP antes de buscar." });
      return;
    }
    setCepMsg(null);
    startCepLookup(async () => {
      const r = await lookupCepAction(cep);
      if (!r.ok) {
        setCepMsg({ tone: "err", text: r.error });
        return;
      }
      setField("ownerAddress", r.data.address);
      setCepMsg({ tone: "ok", text: "Endereço preenchido. Complete o número." });
    });
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
      setField("version", d.version);
      setField("manufactureYear", d.manufactureYear ? String(d.manufactureYear) : undefined);
      setField("modelYear", d.modelYear ? String(d.modelYear) : undefined);
      setField("color", d.color);
      setField("chassi", d.chassi);
      setField("renavam", d.renavam);
      setField("fuel", d.fuel);
      setField("transmission", d.transmission);
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
      <ProcessingOverlay show={pending} label="Gerando a pré-venda… aguarde. Não feche esta página." />
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="referrals" value={JSON.stringify(referrals.filter((r) => r.name || r.amount > 0))} />
      {preSaleId ? <input type="hidden" name="preSaleId" value={preSaleId} /> : null}

      {/* Proprietário do documento (VENDEDOR) */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          Proprietário do documento (Vendedor)
        </legend>
        {/* CRLV: anexar → a IA lê e preenche proprietário e veículo. O arquivo
            segue no formulário e é anexado ao veículo de terceiro ao salvar. */}
        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
          <Field label="CRLV ou nota fiscal do veículo (PDF ou foto) — lê e preenche o proprietário e o veículo">
            <input
              type="file"
              name="crlvFile"
              accept="application/pdf,image/*"
              onChange={handleCrlvChange}
              disabled={crlvReading}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
            <input type="hidden" name="crlvExercicio" value={crlvExercicio} />
            <input type="hidden" name="crlvDocumento" value={crlvDocumento} />
            <input type="hidden" name="crlvNumeroNota" value={crlvNumeroNota} />
            {crlvReading ? (
              <p className="mt-1 text-xs text-slate-500">Lendo o documento… nome, CPF/CNPJ e dados do veículo vêm preenchidos.</p>
            ) : null}
            {crlvMsg ? (
              <p className={`mt-1 text-xs font-medium ${crlvMsg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
                {crlvMsg.text}
              </p>
            ) : null}
            {!crlvReading && !crlvMsg ? (
              <p className="mt-1 text-xs text-slate-500">
                Serve para o <strong>CRLV</strong> (usado) e para a <strong>nota fiscal de veículo 0 km</strong>:
                o sistema lê e preenche nome, CPF/CNPJ, telefone e endereço do proprietário (na nota, o
                destinatário) e os dados do carro — marca/modelo, versão, anos, cor, combustível, chassi e,
                quando existirem, placa e RENAVAM. O arquivo fica anexado ao veículo.
                {initial?.crlvs?.length ? ` Já anexado: ${initial.crlvs.map((c) => c.filename).join(", ")}.` : ""}
              </p>
            ) : null}
          </Field>
        </div>
        {customerList.length > 0 ? (
          <Field label="Usar um cliente já cadastrado (opcional)">
            <Select value={ownerPickId} onChange={(e) => handlePickOwnerCustomer(e.target.value)}>
              <option value="">— Selecionar cliente cadastrado —</option>
              {customerList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-400">
              Selecione para preencher automaticamente nome, CPF/CNPJ, telefone e endereço abaixo.
            </p>
          </Field>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Nome do proprietário" required>
            <Input
              name="ownerName"
              required
              defaultValue={initial?.ownerName ?? ""}
              onChange={(e) => setOwnerNameLive(e.target.value)}
              placeholder="Quem é o dono do veículo/documento"
            />
          </Field>
          <Field label="CPF/CNPJ">
            <div className="flex flex-wrap gap-2">
              <Input name="ownerDocument" defaultValue={initial?.ownerDocument ?? ""} onBlur={handleOwnerDocBlur} placeholder="CPF ou CNPJ" className="max-w-[200px]" />
              <Button
                type="button"
                variant="secondary"
                onClick={handleOwnerCnpjLookup}
                disabled={ownerLookup}
              >
                {ownerLookup ? "Buscando..." : "🔍 Buscar pelo CNPJ"}
              </Button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Pessoa jurídica: digite o CNPJ e busque nome, telefone e endereço.
            </p>
            {ownerMsg ? (
              <p className={`mt-1 text-xs font-medium ${ownerMsg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
                {ownerMsg.text}
              </p>
            ) : null}
          </Field>
          <Field label="Telefone">
            <Input name="ownerPhone" defaultValue={initial?.ownerPhone ?? ""} />
          </Field>
          <Field label="CEP">
            <div className="flex flex-wrap gap-2">
              <Input name="ownerCep" placeholder="00000-000" className="max-w-[160px]" />
              <Button type="button" variant="secondary" onClick={handleOwnerCepLookup} disabled={cepLookup}>
                {cepLookup ? "Buscando..." : "🔍 Buscar endereço"}
              </Button>
            </div>
            {cepMsg ? (
              <p className={`mt-1 text-xs font-medium ${cepMsg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
                {cepMsg.text}
              </p>
            ) : null}
          </Field>
          <Field label="Endereço">
            <Input name="ownerAddress" defaultValue={initial?.ownerAddress ?? ""} placeholder="Rua, número, bairro, cidade/UF" />
          </Field>
        </div>
        <div>
          <button
            type="button"
            onClick={() => {
              setSupplierPrefill({
                name: readField("ownerName"),
                document: readField("ownerDocument"),
                phone: readField("ownerPhone"),
                address: readField("ownerAddress"),
              });
              setNewSupplier((v) => !v);
            }}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            {newSupplier ? "Fechar cadastro" : "➕ Cadastrar fornecedor"}
          </button>
          <p className="mt-1 text-xs text-slate-500">
            Registra o proprietário como <strong>fornecedor</strong> (já vem preenchido com os dados
            acima). Marque &quot;também como cliente&quot; para, no refinanciamento, já selecioná-lo no
            campo Cliente.
          </p>
          {newSupplier ? (
            <NewSupplierInline
              initial={supplierPrefill}
              onCreated={(name, _id, customerId, details) => {
                setField("ownerName", name);
                setOwnerNameLive(name);
                // Traz de volta os dados completos do fornecedor para o proprietário,
                // para que sejam salvos na operação e saiam no contrato.
                setField("ownerDocument", details?.document);
                setField("ownerPhone", details?.phone);
                setField("ownerAddress", details?.address);
                if (refinancing && customerId) {
                  setCustomerList((prev) =>
                    prev.some((x) => x.id === customerId) ? prev : [...prev, { id: customerId, name }],
                  );
                  setCustomerId(customerId);
                }
                setNewSupplier(false);
              }}
            />
          ) : null}
        </div>
      </fieldset>

      {/* Veículo do terceiro */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Veículo (de terceiro)</legend>

        {/* 0 km: o carro sai da montadora sem placa e sem RENAVAM — quem o
            identifica no contrato é o chassi, e a origem é a nota fiscal. */}
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="zeroKm"
            value="true"
            checked={zeroKm}
            onChange={(e) => setZeroKm(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="font-medium">Veículo 0 km</span> — ainda não emplacado: a operação é
            registrada <strong>sem placa e sem RENAVAM</strong>, e o carro é identificado pelo{" "}
            <strong>chassi</strong> no contrato. Informe a montadora/concessionária da nota fiscal.
          </span>
        </label>

        {zeroKm ? (
          <Field label="Montadora / concessionária (nota fiscal do 0 km)" required>
            <Input
              name="manufacturerName"
              value={manufacturerName}
              onChange={(e) => setManufacturerName(e.target.value)}
              placeholder="Ex.: Volkswagen do Brasil Indústria de Veículos Automotores Ltda"
            />
            <p className="mt-1 text-xs text-slate-400">
              Quem emitiu a nota do veículo. Consta no contrato de intermediação, no lugar da placa.
            </p>
          </Field>
        ) : null}

        <Field label={zeroKm ? "Placa (só depois do emplacamento)" : "Placa"} required={!zeroKm}>
          <div className="flex flex-wrap gap-2">
            <Input
              name="plate"
              required={!zeroKm}
              defaultValue={initial?.plate ?? ""}
              placeholder={zeroKm ? "Ainda sem placa (0 km)" : "ABC1D23"}
              className="max-w-[180px] uppercase"
            />
            <Button type="button" variant="secondary" onClick={handlePlateLookup} disabled={looking}>
              {looking ? "Buscando..." : "🔍 Buscar dados pela placa"}
            </Button>
          </div>
          {lookupMsg ? <p className="mt-1 text-xs text-slate-500">{lookupMsg}</p> : null}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Marca" required>
            <Input name="brand" required defaultValue={initial?.brand ?? ""} />
          </Field>
          <Field label="Modelo" required>
            <Input name="model" required defaultValue={initial?.model ?? ""} />
          </Field>
          <Field label="Versão">
            <Input name="version" defaultValue={initial?.version ?? ""} />
          </Field>
          <Field label="Cor">
            <Input name="color" defaultValue={initial?.color ?? ""} />
          </Field>
          <Field label="Ano fab." required>
            <Input name="manufactureYear" type="number" required defaultValue={initial?.manufactureYear ?? new Date().getFullYear()} />
          </Field>
          <Field label="Ano modelo" required>
            <Input name="modelYear" type="number" required defaultValue={initial?.modelYear ?? new Date().getFullYear()} />
          </Field>
          <Field label="KM">
            <Input name="km" type="number" min={0} defaultValue={initial?.km ?? 0} />
          </Field>
          <Field label="Combustível">
            <Input name="fuel" defaultValue={initial?.fuel ?? ""} />
          </Field>
          <Field label="Câmbio">
            <Input name="transmission" defaultValue={initial?.transmission ?? ""} />
          </Field>
          <Field label="Chassi (VIN)" required>
            <Input
              name="chassi"
              defaultValue={initial?.chassi ?? ""}
              className="uppercase"
              placeholder={`${CHASSI_LENGTH} caracteres`}
              required
            />
          </Field>
          <Field label={zeroKm ? "RENAVAM (só depois do emplacamento)" : "RENAVAM"} required={!zeroKm}>
            <Input
              name="renavam"
              defaultValue={initial?.renavam ?? ""}
              inputMode="numeric"
              placeholder={zeroKm ? "Ainda sem RENAVAM (0 km)" : `${RENAVAM_LENGTH} dígitos`}
              required={!zeroKm}
            />
          </Field>
        </div>
      </fieldset>

      {/* Cliente e valores */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Operação</legend>
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="refinancing"
            value="true"
            checked={refinancing}
            onChange={(e) => setRefinancing(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <span>
            <span className="font-medium">Refinanciamento</span> — o proprietário refinancia o próprio
            veículo. A financeira paga o valor financiado <strong>direto na conta do financiado</strong>;
            a loja recebe <strong>só o retorno</strong> (sem repasse nem devolução).
          </span>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Cliente (comprador/financiado)" required>
            {refinancing ? (
              <>
                <Input
                  value={ownerNameLive}
                  readOnly
                  placeholder="Preencha o proprietário acima"
                  className="bg-slate-50 text-slate-700"
                />
                <p className="mt-1 text-xs text-slate-500">
                  No refinanciamento o cliente é o próprio proprietário. O nome acima replica o
                  proprietário e será cadastrado/reaproveitado como cliente ao gerar a pré-venda.
                </p>
              </>
            ) : (
              <>
                <Select
                  name="customerId"
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="" disabled>
                    Selecione o cliente
                  </option>
                  {customerList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  onClick={() => {
                    setCustomerPrefill({});
                    setNewCustomer((v) => !v);
                  }}
                  className="mt-1 text-sm font-medium text-blue-600 hover:underline"
                >
                  {newCustomer ? "Fechar cadastro" : "➕ Cadastrar cliente"}
                </button>
                {newCustomer ? (
                  <NewCustomerInline
                    initial={customerPrefill}
                    onCreated={(c) => {
                      setCustomerList((prev) =>
                        prev.some((x) => x.id === c.id) ? prev : [...prev, c],
                      );
                      setCustomerId(c.id);
                      setNewCustomer(false);
                    }}
                  />
                ) : null}
              </>
            )}
          </Field>
          <Field label="Data" required>
            <Input name="saleDate" type="date" required defaultValue={initial?.saleDate ?? toDateInputValue(new Date())} />
          </Field>
          <Field label="Valor do financiamento (F)" required>
            <MoneyInput
              name="financingAmount"
              required
              defaultValue={initial?.financingAmount ?? null}
              onValueChange={setFinancing}
              placeholder="Valor liberado pelo banco"
            />
          </Field>
          {!refinancing ? (
            <Field label="Devolução de financiamento (ao cliente)">
              <MoneyInput
                name="refundAmount"
                defaultValue={initial?.refundAmount ?? null}
                onValueChange={setRefund}
                placeholder="Quanto será devolvido ao cliente"
              />
            </Field>
          ) : null}
          <Field label="Nº de parcelas (informado ao comprador)" required>
            <Input name="installmentsInfoCount" type="number" min={1} required defaultValue={initial?.installmentsInfoCount ?? ""} placeholder="Ex.: 48" />
          </Field>
          <Field label="Valor da parcela (R$)" required>
            <MoneyInput
              name="installmentsInfoAmount"
              required
              defaultValue={initial?.installmentsInfoAmount ?? null}
              placeholder="Valor de cada parcela"
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

      {/* Dados bancários: no refinanciamento são do financiado (a financeira deposita
          o valor direto nessa conta); nos demais, do comprador (para a devolução).
          Em ambos os casos constam no contrato. */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          {refinancing ? "Dados bancários do financiado" : "Dados bancários do comprador (para a devolução)"}
        </legend>
        <p className="text-xs text-slate-500">
          {refinancing
            ? "Constam no contrato: a financeira deposita o valor financiado direto nesta conta do financiado."
            : "Constam no contrato: a loja fará a transferência da devolução ao comprador assim que a financeira pagar."}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Banco">
            <BankInput name="buyerBankName" defaultValue={initial?.buyerBankName ?? ""} placeholder={refinancing ? "Banco do financiado" : "Banco do comprador"} />
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

      {/* Quitação do financiamento anterior: parte do valor financiado paga o
          boleto do banco credor do veículo. Só informativo (consta no contrato e
          na ficha); o boleto fica anexado ao veículo de terceiro. */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">
          Quitação do financiamento anterior (opcional)
        </legend>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="payoffEnabled"
            value="true"
            checked={payoffEnabled}
            onChange={(e) => setPayoffEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Parte do valor financiado será usada para quitar o financiamento anterior do veículo
        </label>
        {payoffEnabled ? (
          <>
            <p className="text-xs text-slate-500">
              Consta no contrato de intermediação: banco credor, valor, código de barras e vencimento do
              boleto. {refinancing
                ? "No refinanciamento a quitação é feita pelo financiado com o valor liberado."
                : "A loja paga o boleto com essa parte da devolução (D), em vez de devolvê-la ao comprador."}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Banco credor (onde o veículo está financiado)" required>
                <BankInput name="payoffBank" defaultValue={initial?.payoffBank ?? ""} placeholder="Ex.: Banco C6" />
              </Field>
              <Field label="Valor da quitação (R$)" required>
                <MoneyInput
                  name="payoffAmount"
                  defaultValue={initial?.payoffAmount ?? null}
                  onValueChange={setPayoffAmount}
                  placeholder="Valor do boleto de quitação"
                />
              </Field>
              <Field label="Código de barras / linha digitável">
                <Input
                  name="payoffBarcode"
                  defaultValue={initial?.payoffBarcode ?? ""}
                  placeholder="33690.00009 00000.010330 35036.240535 7 15560005331584"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Vencimento do boleto">
                <Input type="date" name="payoffDueDate" defaultValue={initial?.payoffDueDate ?? ""} />
              </Field>
              <Field label="Arquivo do boleto (PDF ou imagem)">
                <input
                  type="file"
                  name="payoffBoleto"
                  accept="application/pdf,image/*"
                  className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
                {initial?.payoffBoletos?.length ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Já anexado: {initial.payoffBoletos.map((b) => b.filename).join(", ")}. Enviar outro
                    arquivo acrescenta, não substitui.
                  </p>
                ) : null}
              </Field>
            </div>
            {!refinancing && payoffAmount > refund && refund > 0 ? (
              <p className="text-xs text-amber-700">
                A quitação ({formatCurrency(payoffAmount)}) é maior que a devolução ao comprador (
                {formatCurrency(refund)}). Confira os valores.
              </p>
            ) : null}
          </>
        ) : null}
      </fieldset>

      {/* Vendedor / comissões */}
      <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">Vendedor e despesas</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Vendedor">
            <Select name="sellerId" defaultValue={initial?.sellerId ?? ""}>
              <option value="">— Nenhum —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comissão do vendedor (R$)">
            <MoneyInput
              name="commissionAmount"
              defaultValue={initial?.commissionAmount ?? null}
              onValueChange={setCommission}
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
            <div className="mt-2">
              <MoneyInput
                name="transferAmount"
                defaultValue={initial?.transferAmount ?? null}
                onValueChange={setTransferAmount}
                placeholder="Valor da transferência (R$)"
              />
            </div>
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
          <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
        </Field>
      </fieldset>

      {/* Resumo do lucro — financiamento e retorno separados */}
      <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        {/* Bloco 1: Financiamento */}
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Financiamento
          </p>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Lucro bruto (financiamento − devolução)</span>
            <span className="tabular-nums font-medium">{formatCurrency(grossProfit)}</span>
          </div>
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
          <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1 font-medium">
            <span>= Sobra do financiamento</span>
            <span className={`tabular-nums ${sobraFinanciamento >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
              {formatCurrency(sobraFinanciamento)}
            </span>
          </div>
        </div>

        {/* Bloco 2: Retorno (só quando há retorno da financeira) */}
        {retorno ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Retorno</p>
            <div className="flex items-center justify-between text-emerald-700">
              <span>Retorno líquido da financeira</span>
              <span className="tabular-nums">{formatCurrency(retornoNet)}</span>
            </div>
            {returnSellerCommission > 0 ? (
              <div className="mt-1 flex items-center justify-between text-rose-600">
                <span>− Comissão do retorno</span>
                <span className="tabular-nums">{formatCurrency(returnSellerCommission)}</span>
              </div>
            ) : null}
            <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-1 font-medium">
              <span>= Sobra do retorno</span>
              <span className={`tabular-nums ${sobraRetorno >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                {formatCurrency(sobraRetorno)}
              </span>
            </div>
          </div>
        ) : null}

        {/* Total */}
        <div className="flex items-center justify-between border-t border-slate-300 pt-2 font-semibold">
          <span>Lucro sobre financiamento de terceiros</span>
          <span className={`tabular-nums ${netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
            {formatCurrency(netProfit)}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Salvando..."
            : preSaleId
              ? "Salvar alterações"
              : "Gerar pré-venda (ficha)"}
        </Button>
      </div>
    </form>
  );
}
