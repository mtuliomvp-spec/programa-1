"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import SupplierSelect from "@/components/SupplierSelect";
import MoneyInput from "@/components/MoneyInput";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { createRequestAction, type ComprasFormState } from "./actions";

type Option = { id: string; name: string };
type Vehicle = { id: string; label: string };

export default function NewRequestForm({
  suppliers,
  vehicles,
  beneficiaries,
}: {
  suppliers: Option[];
  vehicles: Vehicle[];
  beneficiaries: Option[];
}) {
  const [state, formAction, pending] = useActionState(createRequestAction, {} as ComprasFormState);
  const [flow, setFlow] = useState("ADMINISTRATIVO");
  const [parcelado, setParcelado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  // Se houver anexo e for imagem, redimensiona no navegador antes de enviar
  // (evita travar em fotos grandes). PDFs/documentos passam sem alteração.
  async function handleSend() {
    if (pending || preparing) return; // evita envio duplicado (duplo clique)
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      setPreparing(true);
      try {
        fd.set("file", await resizeImageToJpeg(file));
      } finally {
        setPreparing(false);
      }
    }
    formAction(fd);
  }

  return (
    <form ref={formRef} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <Field label="O que comprar" required>
        <Input name="description" required placeholder="Ex: 4 pneus aro 15" />
      </Field>
      <Field label="Detalhes / justificativa">
        <Textarea name="details" rows={3} placeholder="Marca, especificação, para qual veículo..." />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor (R$)">
          <MoneyInput name="estimatedAmount" />
        </Field>
        <Field label="Categoria">
          <Select name="category" defaultValue="OUTROS">
            <option value="OUTROS">Outros</option>
            <option value="COMPRA_PECA">Compra de peças</option>
            <option value="DESPESA_OPERACIONAL">Despesa operacional</option>
            <option value="COMBUSTIVEL">Combustível</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Vencimento (1º, opcional)">
          <Input name="dueDate" type="date" />
        </Field>
        <Field label="Nº da NF / documento (opcional)">
          <Input name="documentNumber" placeholder="Ex: NF 12345" />
        </Field>
      </div>

      {/* Parcelamento: à vista ou N parcelas (vira 1 ou N títulos no a-pagar ao aprovar). */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="paymentMode"
            value="PARCELADO"
            checked={parcelado}
            onChange={(e) => setParcelado(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Pagamento parcelado
        </label>
        {parcelado ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Nº de parcelas">
              <Input name="installmentsCount" type="number" min={2} defaultValue={2} />
            </Field>
            <Field label="Período">
              <Select name="installmentPeriod" defaultValue="MENSAL">
                <option value="MENSAL">Mensal</option>
                <option value="DIAS">A cada X dias</option>
              </Select>
            </Field>
            <Field label="Dias (se por dias)">
              <Input name="installmentDays" type="number" min={1} defaultValue={30} />
            </Field>
          </div>
        ) : null}
      </div>

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
        <Field label="Veículo (opcional)">
          <Select name="vehicleId" defaultValue="">
            <option value="">Nenhum (custo geral de veículos)</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {flow === "CAPITAL" ? (
        <Field label="Beneficiário do capital">
          <Select name="capitalBeneficiaryId" defaultValue="">
            <option value="">Selecione o beneficiário</option>
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <SupplierSelect suppliers={suppliers} label="Fornecedor" emptyLabel="Sem fornecedor" />

      <Field label="Anexo (opcional — foto, PDF…)">
        <input
          type="file"
          name="file"
          accept="image/*,.pdf,.doc,.docx"
          capture="environment"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
      </Field>

      <Button type="button" onClick={handleSend} disabled={pending || preparing} className="w-full">
        {preparing ? "Preparando…" : pending ? "Enviando..." : "Solicitar compra"}
      </Button>
    </form>
  );
}
