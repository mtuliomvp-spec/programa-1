"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { lookupCnpjAction } from "@/app/cnpj-actions";
import { findPersonByDocument } from "@/app/person-lookup";
import { lookupCepAction } from "@/app/cep-actions";
import { UFS, type Endereco } from "@/lib/endereco";

export type PersonFormState = { error?: string };

type PersonData = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  endereco?: Endereco | null;
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
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = value;
  }

  // Endereço em campos (end_*): o que veio de uma busca preenche só o que trouxe.
  function setEndereco(e: Partial<Endereco> | undefined) {
    if (!e) return;
    for (const [k, v] of Object.entries(e)) setField(`end_${k}`, v || undefined);
    // O IBGE é do município: veio outro (ou nenhum), o anterior não vale mais.
    if ("cidade" in e) setIbge(e.ibge || "");
  }

  // Campo oculto controlado: no hidden, o React regrava o defaultValue a cada
  // render e apagaria o valor posto à mão.
  const [ibge, setIbge] = useState(person?.endereco?.ibge || "");
  const [buscandoCep, startCep] = useTransition();
  const [cepMsg, setCepMsg] = useState<string | null>(null);
  function buscarCep() {
    const el = formRef.current?.elements.namedItem("end_cep");
    const cep = el instanceof HTMLInputElement ? el.value : "";
    if (cep.replace(/\D/g, "").length !== 8) {
      setCepMsg("Digite os 8 números do CEP.");
      return;
    }
    setCepMsg(null);
    startCep(async () => {
      const r = await lookupCepAction(cep);
      if (!r.ok) {
        setCepMsg(r.error);
        return;
      }
      setEndereco({
        cep: r.data.cep,
        logradouro: r.data.logradouro,
        bairro: r.data.bairro,
        cidade: r.data.cidade,
        uf: r.data.uf,
        ibge: r.data.ibge,
      });
      setCepMsg("Endereço encontrado — complete o número.");
      const num = formRef.current?.elements.namedItem("end_numero");
      if (num instanceof HTMLInputElement) num.focus();
    });
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
      setEndereco(r.data.endereco ?? undefined);
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
      setEndereco(d.endereco);
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
      </div>

      {/* Endereço em campos — é o formato que a NF-e exige. O texto de
          `address` é montado a partir daqui ao salvar; cadastro antigo sem os
          campos mantém o texto até alguém preencher. */}
      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">Endereço</legend>
        <input type="hidden" name="address" defaultValue={person?.address || ""} />
        <input type="hidden" name="end_ibge" value={ibge} readOnly />
        {person?.address && !person.endereco ? (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Endereço cadastrado (texto): <strong>{person.address}</strong>. Preencha os campos abaixo — a nota
            fiscal precisa dele separado.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Field label="CEP">
              <div className="flex gap-2">
                <Input
                  name="end_cep"
                  defaultValue={person?.endereco?.cep || ""}
                  placeholder="00000-000"
                  inputMode="numeric"
                  onBlur={(e) => {
                    if (e.currentTarget.value.replace(/\D/g, "").length === 8) buscarCep();
                  }}
                />
                <Button type="button" variant="secondary" onClick={buscarCep} disabled={buscandoCep}>
                  {buscandoCep ? "…" : "🔍"}
                </Button>
              </div>
            </Field>
          </div>
          <div className="sm:col-span-4">
            <Field label="Logradouro (rua, avenida…)">
              <Input name="end_logradouro" defaultValue={person?.endereco?.logradouro || ""} />
            </Field>
          </div>
          <div className="sm:col-span-1">
            <Field label="Número">
              <Input name="end_numero" defaultValue={person?.endereco?.numero || ""} placeholder="S/N" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Complemento">
              <Input name="end_complemento" defaultValue={person?.endereco?.complemento || ""} />
            </Field>
          </div>
          <div className="sm:col-span-3">
            <Field label="Bairro">
              <Input name="end_bairro" defaultValue={person?.endereco?.bairro || ""} />
            </Field>
          </div>
          <div className="sm:col-span-4">
            <Field label="Cidade">
              <Input name="end_cidade" defaultValue={person?.endereco?.cidade || ""} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="UF">
              <Select name="end_uf" defaultValue={person?.endereco?.uf || ""}>
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        {cepMsg ? <p className="mt-2 text-xs text-slate-600">{cepMsg}</p> : null}
      </fieldset>
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
