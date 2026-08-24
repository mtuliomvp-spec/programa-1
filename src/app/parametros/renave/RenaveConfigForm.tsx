"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { saveRenaveConfigAction, type RenaveConfigState } from "./actions";

export type RenaveConfig = {
  renaveAderido: boolean;
  renaveAderidoEm: string | null;
  renaveIntegradora: string | null;
  renaveCnae: string | null;
  eCnpjValidUntil: string | null;
  renaveImplantacao: boolean;
  renaveObrigatorioEm: string | null;
};

const dia = (v: string | null) => (v ? v.slice(0, 10) : "");

export default function RenaveConfigForm({ config }: { config: RenaveConfig }) {
  const [state, formAction, pending] = useActionState(saveRenaveConfigAction, {} as RenaveConfigState);
  const [aderido, setAderido] = useState(config.renaveAderido);
  const [implantacao, setImplantacao] = useState(config.renaveImplantacao);

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Adesão da loja</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Situação da adesão">
            <Select
              name="renaveAderido"
              value={String(aderido)}
              onChange={(e) => setAderido(e.target.value === "true")}
            >
              <option value="false">Ainda não aderiu</option>
              <option value="true">Adesão concluída</option>
            </Select>
            <span className="mt-1 block text-xs text-slate-500">
              A adesão é solicitada no sistema Credencia, com e-CNPJ (art. 7º).
            </span>
          </Field>
          <Field label="Data da adesão">
            <Input type="date" name="renaveAderidoEm" defaultValue={dia(config.renaveAderidoEm)} />
          </Field>
          <Field label="Integradora contratada">
            <Input
              name="renaveIntegradora"
              defaultValue={config.renaveIntegradora || ""}
              placeholder="Nome da integradora autorizada"
            />
            <span className="mt-1 block text-xs text-slate-500">
              É por ela que os registros entram no Renave (art. 5º, III).
            </span>
          </Field>
          <Field label="CNAE principal">
            <Input name="renaveCnae" defaultValue={config.renaveCnae || ""} placeholder="Ex.: 45.11-1-04" />
            <span className="mt-1 block text-xs text-slate-500">
              Precisa ser compatível com compra e venda de veículos (art. 7º, I).
            </span>
          </Field>
          <Field label="Validade do certificado e-CNPJ">
            <Input type="date" name="eCnpjValidUntil" defaultValue={dia(config.eCnpjValidUntil)} />
            <span className="mt-1 block text-xs text-slate-500">
              Certificado vencido bloqueia o acesso ao Renave (art. 30).
            </span>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Modo de implantação</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Avisos do Renave">
            <Select
              name="renaveImplantacao"
              value={String(implantacao)}
              onChange={(e) => setImplantacao(e.target.value === "true")}
            >
              <option value="true">Em implantação — só avisa, não bloqueia</option>
              <option value="false">Implantação concluída — avisos discretos</option>
            </Select>
          </Field>
          <Field label="Data em que a obrigatoriedade entra em vigor">
            <Input type="date" name="renaveObrigatorioEm" defaultValue={dia(config.renaveObrigatorioEm)} />
            <span className="mt-1 block text-xs text-slate-500">
              Prazo do art. 33: 90 dias da publicação (30/06/2026) — 28/09/2026. É a data citada nos avisos.
            </span>
          </Field>
        </div>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Em qualquer das opções o sistema <strong>não bloqueia</strong> nenhuma rotina. Vender, comprar,
          consignar e intermediar seguem funcionando como hoje — a diferença é o destaque dos avisos que
          apontam o que a escrituração eletrônica vai exigir.
        </p>
      </fieldset>

      {state.error ? <p className="text-sm font-medium text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm font-medium text-emerald-700">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Salvar configuração do Renave"}
      </Button>
    </form>
  );
}
