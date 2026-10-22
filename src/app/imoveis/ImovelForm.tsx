"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { TIPOS_IMOVEL } from "@/lib/imoveis";
import { salvarImovelAction, type ImovelFormState } from "./actions";

export type ImovelInicial = {
  id: string;
  nome: string;
  tipo: string;
  proprietario: string | null;
  capitalBeneficiaryId: string | null;
  area: string | null;
  cib: string | null;
  inscricaoMunicipal: string | null;
  matricula: string | null;
  cartorio: string | null;
  endereco: string | null;
  municipio: string | null;
  uf: string | null;
  notes: string | null;
  ativo: boolean;
};

export default function ImovelForm({
  inicial,
  beneficiarios,
}: {
  inicial?: ImovelInicial;
  /** Sócios do capital: o imóvel pode ser de um deles. */
  beneficiarios: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(salvarImovelAction, {} as ImovelFormState);
  const [tipo, setTipo] = useState(inicial?.tipo ?? "RURAL");
  const rural = tipo === "RURAL";

  return (
    <form action={formAction} className="space-y-4">
      {inicial ? <input type="hidden" name="id" value={inicial.id} /> : null}
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome do imóvel" required>
          <Input name="nome" required defaultValue={inicial?.nome} placeholder="Ex.: Sítio Rio São João (pedreira)" />
        </Field>
        <Field label="Tipo" required>
          <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_IMOVEL.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Proprietário (como está no documento)">
          <Input name="proprietario" defaultValue={inicial?.proprietario ?? ""} placeholder="Nome do titular" />
        </Field>
        <Field label="É de um sócio? (opcional)">
          <Select name="capitalBeneficiaryId" defaultValue={inicial?.capitalBeneficiaryId ?? ""}>
            <option value="">— não —</option>
            {beneficiarios.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            Só informativo: para a conta sair do capital do sócio, lance-a no fluxo Capital.
          </p>
        </Field>
        {rural ? (
          <Field label="CIB (antigo NIRF)">
            <Input name="cib" defaultValue={inicial?.cib ?? ""} placeholder="Ex.: 7.223.419-9" />
            <p className="mt-1 text-xs text-slate-400">É o número do imóvel no ITR — sai no DARF e no recibo.</p>
          </Field>
        ) : (
          <Field label="Inscrição municipal (IPTU)">
            <Input name="inscricaoMunicipal" defaultValue={inicial?.inscricaoMunicipal ?? ""} />
          </Field>
        )}
        <Field label="Área">
          <Input name="area" defaultValue={inicial?.area ?? ""} placeholder={rural ? "Ex.: 19,0 ha" : "Ex.: 360 m²"} />
        </Field>
        <Field label="Matrícula">
          <Input name="matricula" defaultValue={inicial?.matricula ?? ""} />
        </Field>
        <Field label="Cartório">
          <Input name="cartorio" defaultValue={inicial?.cartorio ?? ""} placeholder="Ex.: 1º Ofício de São José de Ribamar" />
        </Field>
        <Field label="Endereço / localização">
          <Input name="endereco" defaultValue={inicial?.endereco ?? ""} placeholder="Ex.: Estrada Boa Viagem" />
        </Field>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <Field label="Município">
            <Input name="municipio" defaultValue={inicial?.municipio ?? ""} />
          </Field>
          <Field label="UF">
            <Input name="uf" maxLength={2} defaultValue={inicial?.uf ?? ""} className="uppercase" />
          </Field>
        </div>
      </div>

      <Field label="Observações">
        <Textarea name="notes" rows={2} defaultValue={inicial?.notes ?? ""} />
      </Field>

      {inicial ? (
        <Field label="Situação">
          <Select name="ativo" defaultValue={inicial.ativo ? "true" : "false"}>
            <option value="true">Ativo</option>
            <option value="false">Inativo (vendido / não é mais acompanhado)</option>
          </Select>
        </Field>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : inicial ? "Salvar alterações" : "Cadastrar imóvel"}
        </Button>
      </div>
    </form>
  );
}
