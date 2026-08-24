"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
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
  instagram: string | null;
  // Parecer IA: provedor/modelo aparecem; a chave NUNCA vem ao cliente (só o
  // indicador de que existe).
  aiProvider: string | null;
  aiModel: string | null;
  /** A instalação já tem chave de IA própria (variável de ambiente). */
  aiKeyFromEnv?: boolean;
  /** Token da consulta por placa salvo nestes Parâmetros. */
  hasPlateToken?: boolean;
  /** A instalação já tem token de placa próprio (variável de ambiente). */
  plateTokenFromEnv?: boolean;
  hasAiKey: boolean;
};

export default function CompanyForm({
  company,
  podeChaves,
}: {
  company: Company;
  /** Domínio público e chaves de API são do dono do sistema (Super Admin). */
  podeChaves: boolean;
}) {
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
        {podeChaves ? (
          <>
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
          </>
        ) : (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Domínio do site (endereço público)
            </p>
            <p className="mt-1 text-sm text-slate-700">
              {company.publicUrl || "usa o endereço pelo qual o sistema for aberto"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              🔒 O endereço público é configurado pelo fornecedor do sistema — ele depende do domínio
              contratado e do apontamento do servidor.
            </p>
          </div>
        )}
        <div className="mt-3">
          <Field label="Instagram da loja">
            <Input name="instagram" defaultValue={company.instagram || ""} placeholder="@mvpveiculos" />
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Aparece no rodapé da vitrine pública. Pode ser o @usuario ou o link completo do perfil.
        </p>
      </div>

      {podeChaves ? (
        <>
      <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-4">
        <p className="mb-1 text-sm font-semibold text-slate-800">🔍 Consulta por placa (e valor FIPE)</p>
        <p className="mb-3 text-xs text-slate-500">
          Preenche marca, modelo, ano, cor, chassi e o valor FIPE a partir da placa — um único token
          atende as duas coisas. Contrate em um provedor de consulta veicular (ex.: wdapi2.com.br);
          há custo por consulta, cobrado direto pelo provedor.
          {company.hasPlateToken ? (
            <span className="ml-1 font-medium text-emerald-700">Token configurado ✓</span>
          ) : company.plateTokenFromEnv ? (
            <span className="ml-1 font-medium text-emerald-700">
              Ativa pelo token da instalação ✓ — preencha abaixo só para usar um token próprio.
            </span>
          ) : (
            <span className="ml-1 font-medium text-amber-700">
              Sem token — a busca pela placa fica indisponível.
            </span>
          )}
        </p>
        <Field
          label={company.hasPlateToken ? "Token do provedor (deixe em branco para manter)" : "Token do provedor"}
        >
          <Input
            type="password"
            name="plateApiToken"
            autoComplete="off"
            placeholder={company.hasPlateToken ? "•••••••••• (token já salvo)" : "Cole aqui o token da consulta por placa"}
          />
        </Field>
        {company.hasPlateToken ? (
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="plateApiTokenClear" value="true" className="h-4 w-4 rounded border-slate-300" />
            Remover o token salvo
          </label>
        ) : null}
      </div>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-4">
        <p className="mb-1 text-sm font-semibold text-slate-800">🛡️ Parecer IA (Inteligência Artificial)</p>
        <p className="mb-3 text-xs text-slate-500">
          A IA gera um parecer técnico da loja (e de cada veículo) em PDF. Para funcionar, cadastre a
          chave de API do provedor escolhido. Há custo por geração, cobrado direto pelo provedor.
          {company.hasAiKey ? (
            <span className="ml-1 font-medium text-emerald-700">Chave configurada ✓</span>
          ) : company.aiKeyFromEnv ? (
            <span className="ml-1 font-medium text-emerald-700">
              Ativa pela chave da instalação ✓ — preencha abaixo só se quiser usar uma chave própria.
            </span>
          ) : (
            <span className="ml-1 font-medium text-amber-700">Sem chave — o parecer fica indisponível.</span>
          )}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Provedor de IA">
            <Select name="aiProvider" defaultValue={company.aiProvider || "ANTHROPIC"}>
              <option value="ANTHROPIC">Anthropic (Claude)</option>
              <option value="OPENAI">OpenAI (ChatGPT)</option>
            </Select>
          </Field>
          <Field label="Modelo (opcional)">
            <Input
              name="aiModel"
              defaultValue={company.aiModel || ""}
              placeholder="padrão do provedor"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={company.hasAiKey ? "Chave de API (deixe em branco para manter)" : "Chave de API"}>
              <Input
                type="password"
                name="aiApiKey"
                autoComplete="off"
                placeholder={company.hasAiKey ? "•••••••••• (chave já salva)" : "Cole aqui a chave da IA"}
              />
            </Field>
            {company.hasAiKey ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" name="aiApiKeyClear" value="true" className="h-4 w-4 rounded border-slate-300" />
                Remover a chave salva
              </label>
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          A chave é guardada com segurança e nunca é mostrada de volta nesta tela. Anthropic:
          console.anthropic.com · OpenAI: platform.openai.com.
        </p>
      </div>

        </>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="mb-1 text-sm font-semibold text-slate-800">🔑 Chaves de API</p>
          <p className="text-xs text-slate-500">
            Consulta por placa/FIPE:{" "}
            {company.hasPlateToken || company.plateTokenFromEnv ? (
              <span className="font-medium text-emerald-700">ativa ✓</span>
            ) : (
              <span className="font-medium text-amber-700">não configurada</span>
            )}{" "}
            · Parecer IA:{" "}
            {company.hasAiKey || company.aiKeyFromEnv ? (
              <span className="font-medium text-emerald-700">ativa ✓</span>
            ) : (
              <span className="font-medium text-amber-700">não configurada</span>
            )}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            🔒 As chaves são contratadas e mantidas pelo fornecedor do sistema — o custo por consulta
            e por parecer é dele. Precisa ativar ou trocar? Fale com o fornecedor.
          </p>
        </div>
      )}

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
