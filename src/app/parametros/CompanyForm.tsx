"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { lookupCnpjAction } from "@/app/cnpj-actions";
import { saveCompanyAction, type CompanyFormState } from "./actions";

type Company = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string | null;
  inscricaoEstadual: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  uf: string | null;
  logoDataUrl: string | null;
  publicUrl: string | null;
};

export default function CompanyForm({ company }: { company: Company }) {
  const [state, formAction, pending] = useActionState<CompanyFormState, FormData>(
    saveCompanyAction,
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [looking, startLookup] = useTransition();
  const [lookupMsg, setLookupMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [logo, setLogo] = useState<string>(""); // "" = manter, "remover" = apagar, data: = nova
  const [logoPreview, setLogoPreview] = useState<string | null>(company.logoDataUrl);

  function setField(name: string, value: string | undefined) {
    if (!value) return;
    const el = formRef.current?.elements.namedItem(name);
    if (el instanceof HTMLInputElement) el.value = value;
  }

  function handleCnpjLookup() {
    const el = formRef.current?.elements.namedItem("cnpj");
    const cnpj = el instanceof HTMLInputElement ? el.value.trim() : "";
    if (!cnpj) {
      setLookupMsg({ tone: "err", text: "Digite o CNPJ antes de buscar." });
      return;
    }
    setLookupMsg(null);
    startLookup(async () => {
      const result = await lookupCnpjAction(cnpj);
      if (!result.ok) {
        setLookupMsg({ tone: "err", text: result.error });
        return;
      }
      const d = result.data;
      setField("razaoSocial", d.name);
      setField("nomeFantasia", d.fantasia);
      setField("phone", d.phone);
      setField("email", d.email);
      setField("address", d.address);
      setLookupMsg({
        tone: "ok",
        text: `Dados encontrados: ${d.name}. Confira e complete o que faltar.`,
      });
    });
  }

  function handleLogoChange(file: File | undefined) {
    if (!file) return;
    if (file.size > 300 * 1024) {
      setLookupMsg({ tone: "err", text: "A logo deve ter no máximo 300KB." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setLogo(dataUrl);
      setLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}
      {state.success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Parâmetros salvos! Os documentos impressos já usam os novos dados.
        </div>
      ) : null}

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
        <Field label="CNPJ">
          <div className="flex flex-wrap gap-2">
            <Input
              name="cnpj"
              defaultValue={company.cnpj || ""}
              placeholder="00.000.000/0000-00"
              className="max-w-[220px]"
            />
            <Button type="button" variant="secondary" onClick={handleCnpjLookup} disabled={looking}>
              {looking ? "Buscando..." : "🔍 Buscar dados pelo CNPJ"}
            </Button>
          </div>
        </Field>
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
        <Field label="Razão social" required>
          <Input name="razaoSocial" defaultValue={company.razaoSocial} required />
        </Field>
        <Field label="Nome fantasia (exibido no sistema)" required>
          <Input name="nomeFantasia" defaultValue={company.nomeFantasia} required />
        </Field>
        <Field label="Inscrição estadual">
          <Input name="inscricaoEstadual" defaultValue={company.inscricaoEstadual || ""} />
        </Field>
        <Field label="Telefone">
          <Input name="phone" defaultValue={company.phone || ""} />
        </Field>
        <Field label="E-mail">
          <Input type="email" name="email" defaultValue={company.email || ""} />
        </Field>
        <Field label="Endereço sede">
          <Input name="address" defaultValue={company.address || ""} placeholder="Rua, número, bairro..." />
        </Field>
        <Field label="Cidade sede (usada como comarca do foro)">
          <Input name="city" defaultValue={company.city || ""} />
        </Field>
        <Field label="UF">
          <Input name="uf" defaultValue={company.uf || ""} maxLength={2} className="max-w-[100px] uppercase" />
        </Field>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <Field label="Domínio do site (endereço público)">
          <Input
            name="publicUrl"
            defaultValue={company.publicUrl || ""}
            placeholder="mvpveiculos.com.br"
          />
        </Field>
        <p className="mt-2 text-xs text-slate-500">
          Usado para montar os links públicos: os QR Codes da Ficha de Negócio e da Ordem de
          Pagamento, a vitrine e o endereço que aparece no Google. Pode digitar só o domínio
          (ex.: <strong>mvpveiculos.com.br</strong>) — o <em>https://</em> é adicionado
          automaticamente. Deixe em branco para usar o endereço pelo qual o sistema for aberto.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="mb-2 text-sm font-medium text-slate-700">Logo da empresa (até 300KB)</p>
        <input type="hidden" name="logoDataUrl" value={logo} />
        {logoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoPreview}
            alt="Logo da empresa"
            className="mb-3 h-16 w-auto rounded border border-slate-200 bg-white p-1"
          />
        ) : (
          <p className="mb-3 text-xs text-slate-400">Nenhuma logo enviada.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => handleLogoChange(e.target.files?.[0])}
            className="text-xs"
          />
          {logoPreview ? (
            <button
              type="button"
              onClick={() => {
                setLogo("remover");
                setLogoPreview(null);
              }}
              className="text-xs font-medium text-rose-600 hover:underline"
            >
              Remover logo
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Aparece no topo dos documentos impressos (ordem de compra, contrato e ordem de venda).
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar parâmetros"}
        </Button>
      </div>
    </form>
  );
}
