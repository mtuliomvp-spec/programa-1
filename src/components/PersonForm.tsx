"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { lookupCnpjAction } from "@/app/cnpj-actions";
import { findPersonByDocument } from "@/app/person-lookup";

export type PersonFormState = { error?: string };

type PersonData = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  bankName?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  bankAccountType?: string | null;
  pixKey?: string | null;
};

export default function PersonForm({
  action,
  person,
  documentLabel = "CPF / CNPJ",
  replicate,
  showBankData = false,
}: {
  action: (state: PersonFormState, formData: FormData) => Promise<PersonFormState>;
  person?: PersonData;
  documentLabel?: string;
  // Opção de replicar o mesmo cadastro no outro papel (cliente ⇄ fornecedor).
  replicate?: { name: string; label: string };
  // Mostra a seção "Dados para pagamento" (usada no cadastro de fornecedor).
  showBankData?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [looking, startLookup] = useTransition();
  const [lookupMsg, setLookupMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function setField(name: string, value: string | undefined) {
    if (!value) return;
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement) el.value = value;
  }

  // Ao sair do campo de documento, procura no cadastro local (cliente/fornecedor)
  // — se a mesma pessoa já existir, traz os dados.
  function handleDocBlur() {
    const docEl = formRef.current?.elements.namedItem("document");
    const document = docEl instanceof HTMLInputElement ? docEl.value.trim() : "";
    const nameEl = formRef.current?.elements.namedItem("name");
    const nameFilled = nameEl instanceof HTMLInputElement && nameEl.value.trim();
    if (!document || nameFilled) return;
    startLookup(async () => {
      const r = await findPersonByDocument(document);
      if (!r.found) return;
      setField("name", r.data.name);
      setField("phone", r.data.phone);
      setField("email", r.data.email);
      setField("address", r.data.address);
      setLookupMsg({ tone: "ok", text: `Já cadastrado como ${r.source}: dados trazidos. Confira e salve.` });
    });
  }

  function handleCnpjLookup() {
    const docEl = formRef.current?.elements.namedItem("document");
    const document = docEl instanceof HTMLInputElement ? docEl.value.trim() : "";
    if (!document) {
      setLookupMsg({ tone: "err", text: "Digite o CNPJ antes de buscar." });
      return;
    }
    setLookupMsg(null);
    startLookup(async () => {
      const result = await lookupCnpjAction(document);
      if (!result.ok) {
        setLookupMsg({ tone: "err", text: result.error });
        return;
      }
      const d = result.data;
      setField("name", d.name);
      setField("phone", d.phone);
      setField("email", d.email);
      setField("address", d.address);
      const extra = [
        d.fantasia && d.fantasia !== d.name ? `nome fantasia ${d.fantasia}` : null,
        d.situacao ? `situação ${d.situacao}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      setLookupMsg({
        tone: "ok",
        text: `Dados encontrados: ${d.name}${extra ? ` (${extra})` : ""}. Confira e complete o que faltar.`,
      });
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {person ? <input type="hidden" name="id" defaultValue={person.id} /> : null}

      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
        <Field label={documentLabel}>
          <div className="flex flex-wrap gap-2">
            <Input
              name="document"
              defaultValue={person?.document || ""}
              onBlur={person ? undefined : handleDocBlur}
              placeholder="00.000.000/0000-00"
              className="max-w-[220px]"
            />
            <Button type="button" variant="secondary" onClick={handleCnpjLookup} disabled={looking}>
              {looking ? "Buscando..." : "🔍 Buscar dados pelo CNPJ"}
            </Button>
          </div>
        </Field>
        <p className="mt-2 text-xs text-slate-500">
          Para empresas: digite o CNPJ e clique em buscar — razão social, telefone, e-mail e
          endereço são preenchidos automaticamente (Receita Federal).
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" required>
          <Input name="name" defaultValue={person?.name} required />
        </Field>
        <Field label="Telefone">
          <Input name="phone" defaultValue={person?.phone || ""} />
        </Field>
        <Field label="E-mail">
          <Input type="email" name="email" defaultValue={person?.email || ""} />
        </Field>
        <Field label="Endereço" >
          <Input name="address" defaultValue={person?.address || ""} />
        </Field>
      </div>
      {showBankData ? (
        <fieldset className="rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Dados para pagamento
          </legend>
          <p className="mb-3 text-xs text-slate-500">
            Aparecem na Ordem de Pagamento gerada a partir dos títulos deste fornecedor.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Banco">
              <Input name="bankName" defaultValue={person?.bankName || ""} placeholder="Ex: 001 - Banco do Brasil" />
            </Field>
            <Field label="Chave PIX">
              <Input name="pixKey" defaultValue={person?.pixKey || ""} placeholder="CPF/CNPJ, e-mail, telefone ou aleatória" />
            </Field>
            <Field label="Agência">
              <Input name="bankAgency" defaultValue={person?.bankAgency || ""} placeholder="0000" />
            </Field>
            <Field label="Conta">
              <Input name="bankAccount" defaultValue={person?.bankAccount || ""} placeholder="00000-0" />
            </Field>
            <Field label="Tipo de conta">
              <Select name="bankAccountType" defaultValue={person?.bankAccountType || ""}>
                <option value="">—</option>
                <option value="corrente">Corrente</option>
                <option value="poupanca">Poupança</option>
              </Select>
            </Field>
          </div>
        </fieldset>
      ) : null}

      <Field label="Observações">
        <Textarea name="notes" defaultValue={person?.notes || ""} rows={3} />
      </Field>

      {replicate && !person ? (
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <input type="checkbox" name={replicate.name} value="true" className="h-4 w-4 rounded border-slate-300" />
          Cadastrar também como <strong>{replicate.label}</strong> — a mesma pessoa pode comprar e vender.
        </label>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : person ? "Salvar alterações" : "Cadastrar"}
        </Button>
      </div>
    </form>
  );
}
