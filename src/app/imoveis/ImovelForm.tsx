"use client";

import { useActionState, useRef, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { TIPOS_IMOVEL } from "@/lib/imoveis";
import { lerRegistroImovelAction, salvarImovelAction, type DadosLidosImovel, type ImovelFormState } from "./actions";
import { enviarAnexoImovel } from "./enviarAnexo";

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
  // Leitura do registro (só no cadastro): os campos lidos entram no formulário
  // (remontado com eles) e o arquivo vai junto, ligado ao imóvel ao salvar.
  const [lidos, setLidos] = useState<DadosLidosImovel | null>(null);
  const [versao, setVersao] = useState(0);
  const [anexoRegistroId, setAnexoRegistroId] = useState<string | null>(null);
  const [lendo, setLendo] = useState<string | null>(null);
  const [leituraErro, setLeituraErro] = useState<string | null>(null);
  const [leituraAviso, setLeituraAviso] = useState<string | null>(null);
  const registroRef = useRef<HTMLInputElement>(null);

  async function lerRegistro() {
    const file = registroRef.current?.files?.[0];
    if (!file) return;
    setLeituraErro(null);
    setLeituraAviso(null);
    try {
      setLendo("Enviando o documento…");
      const id = await enviarAnexoImovel(file, { imovelId: null, categoria: "ESCRITURA" }, (pct) =>
        setLendo(`Enviando o documento… ${pct}%`),
      );
      setAnexoRegistroId(id);
      setLendo("Lendo o registro (pode levar até um minuto)…");
      const r = await lerRegistroImovelAction(id);
      if (!r.ok || !r.dados) {
        // O arquivo subiu: mesmo sem leitura, ele fica anexado ao salvar.
        setLeituraErro(`${r.error || "Não foi possível ler o documento."} O arquivo será anexado ao imóvel assim mesmo.`);
        return;
      }
      setLidos(r.dados);
      if (r.dados.tipo) setTipo(r.dados.tipo);
      setVersao((v) => v + 1);
      setLeituraAviso(r.aviso ?? null);
    } catch (e) {
      setLeituraErro(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setLendo(null);
    }
  }

  const v = (campo: keyof DadosLidosImovel, atual: string | null | undefined) => (lidos?.[campo] || atual) ?? "";

  return (
    <form action={formAction} className="space-y-4">
      {inicial ? <input type="hidden" name="id" value={inicial.id} /> : null}
      {anexoRegistroId ? <input type="hidden" name="anexoRegistroId" value={anexoRegistroId} /> : null}
      {!inicial ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
          <p className="text-sm font-semibold text-violet-900">📄 Preencher a partir do registro do imóvel</p>
          <p className="mt-0.5 text-xs text-violet-800">
            Anexe a certidão de matrícula / registro (PDF ou foto): a IA lê e preenche os campos abaixo — confira
            antes de salvar. O documento fica anexado ao imóvel.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={registroRef}
              type="file"
              accept=".pdf,image/*"
              disabled={!!lendo}
              className="block w-full max-w-sm text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
            />
            <Button type="button" onClick={lerRegistro} disabled={!!lendo}>
              {lendo ? "Lendo…" : "Ler registro"}
            </Button>
          </div>
          {lendo ? <p className="mt-2 text-sm text-slate-600">⏳ {lendo}</p> : null}
          {lidos ? (
            <p className="mt-2 text-sm text-emerald-700">
              ✓ Registro lido — {Object.values(lidos).filter(Boolean).length} campo(s) preenchido(s). Confira e salve.
            </p>
          ) : null}
          {leituraAviso ? <p className="mt-1 text-sm text-amber-800">⚠️ {leituraAviso}</p> : null}
          {leituraErro ? <p className="mt-2 text-sm text-rose-700">{leituraErro}</p> : null}
        </div>
      ) : null}
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.error}</div>
      ) : null}

      <div key={versao} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome do imóvel" required>
          <Input name="nome" required defaultValue={v("nome", inicial?.nome)} placeholder="Ex.: Sítio Rio São João (pedreira)" />
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
          <Input name="proprietario" defaultValue={v("proprietario", inicial?.proprietario)} placeholder="Nome do titular" />
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
            <Input name="cib" defaultValue={v("cib", inicial?.cib)} placeholder="Ex.: 7.223.419-9" />
            <p className="mt-1 text-xs text-slate-400">É o número do imóvel no ITR — sai no DARF e no recibo.</p>
          </Field>
        ) : (
          <Field label="Inscrição municipal (IPTU)">
            <Input name="inscricaoMunicipal" defaultValue={v("inscricaoMunicipal", inicial?.inscricaoMunicipal)} />
          </Field>
        )}
        <Field label="Área">
          <Input name="area" defaultValue={v("area", inicial?.area)} placeholder={rural ? "Ex.: 19,0 ha" : "Ex.: 360 m²"} />
        </Field>
        <Field label="Matrícula">
          <Input name="matricula" defaultValue={v("matricula", inicial?.matricula)} />
        </Field>
        <Field label="Cartório">
          <Input name="cartorio" defaultValue={v("cartorio", inicial?.cartorio)} placeholder="Ex.: 1º Ofício de São José de Ribamar" />
        </Field>
        <Field label="Endereço / localização">
          <Input name="endereco" defaultValue={v("endereco", inicial?.endereco)} placeholder="Ex.: Estrada Boa Viagem" />
        </Field>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <Field label="Município">
            <Input name="municipio" defaultValue={v("municipio", inicial?.municipio)} />
          </Field>
          <Field label="UF">
            <Input name="uf" maxLength={2} defaultValue={v("uf", inicial?.uf)} className="uppercase" />
          </Field>
        </div>
      </div>

      <Field label="Observações">
        <Textarea key={versao} name="notes" rows={2} defaultValue={v("notes", inicial?.notes)} />
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
