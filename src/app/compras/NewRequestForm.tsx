"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import SupplierSelect from "@/components/SupplierSelect";
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
  const formRef = useRef<HTMLFormElement>(null);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  // Se houver anexo e for imagem, redimensiona no navegador antes de enviar
  // (evita travar em fotos grandes). PDFs/documentos passam sem alteração.
  async function handleSend() {
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
      <Field label="Valor estimado (R$)">
        <Input name="estimatedAmount" type="number" step="0.01" min={0} />
      </Field>

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

      <SupplierSelect suppliers={suppliers} label="Fornecedor sugerido" emptyLabel="Sem sugestão" />

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
