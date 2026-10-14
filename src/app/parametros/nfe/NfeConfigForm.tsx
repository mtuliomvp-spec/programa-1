"use client";

import { useActionState, type ReactNode } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import {
  NFE_PROVEDORES,
  NFE_REGIMES,
  formatarCfop,
  formatarNcm,
  nfeProvedorLabel,
  nfeRegimeLabel,
  type NfeConfig,
} from "@/lib/nfe-config";
import { saveNfeConfigAction, type NfeConfigState } from "./actions";

const Dica = ({ children }: { children: ReactNode }) => (
  <span className="mt-1 block text-xs text-slate-500">{children}</span>
);

export default function NfeConfigForm({ config }: { config: NfeConfig }) {
  const [state, formAction, pending] = useActionState(saveNfeConfigAction, {} as NfeConfigState);

  return (
    <form action={formAction} className="space-y-5">
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Habilitação da loja</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Credenciada na SEFAZ para emitir NF-e">
            <Select name="credenciadaSefaz" defaultValue={String(config.credenciadaSefaz)}>
              <option value="false">Não / não conferido</option>
              <option value="true">Sim, credenciada</option>
            </Select>
          </Field>
          <Field label="Certificado e-CNPJ A1">
            <Select name="certificadoA1" defaultValue={String(config.certificadoA1)}>
              <option value="false">Ainda não enviado ao provedor</option>
              <option value="true">Enviado ao provedor</option>
            </Select>
            <Dica>O arquivo e a senha vão no painel do provedor — nunca por aqui nem por mensagem.</Dica>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Provedor de emissão</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Provedor">
            <Select name="provedor" defaultValue={config.provedor ?? ""}>
              <option value="">— a contratar —</option>
              {NFE_PROVEDORES.map((p) => (
                <option key={p} value={p}>
                  {nfeProvedorLabel[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nome (se “Outro”)">
            <Input name="provedorNome" defaultValue={config.provedorNome} />
          </Field>
          <Field label="Ambiente">
            <Select name="ambiente" defaultValue={config.ambiente}>
              <option value="HOMOLOGACAO">Homologação (teste, sem valor fiscal)</option>
              <option value="PRODUCAO">Produção (nota com valor fiscal)</option>
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Regra fiscal (definida pelo contador)</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Regime tributário (CRT)">
            <Select name="regime" defaultValue={config.regime ?? ""}>
              <option value="">— a definir —</option>
              {NFE_REGIMES.map((r) => (
                <option key={r} value={r}>
                  {r} — {nfeRegimeLabel[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Série da NF-e">
            <Input name="serie" defaultValue={config.serie} inputMode="numeric" />
          </Field>
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Entrada — compra do veículo</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Natureza da operação">
              <Input name="naturezaEntrada" defaultValue={config.naturezaEntrada} />
            </Field>
            <Field label="CFOP — vendedor do mesmo estado">
              <Input name="cfopEntradaUf" defaultValue={formatarCfop(config.cfopEntradaUf)} placeholder="1.102" />
            </Field>
            <Field label="CFOP — vendedor de outro estado">
              <Input name="cfopEntradaForaUf" defaultValue={formatarCfop(config.cfopEntradaForaUf)} placeholder="2.102" />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saída — venda do veículo</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Natureza da operação">
              <Input name="naturezaSaida" defaultValue={config.naturezaSaida} />
            </Field>
            <Field label="CFOP — comprador do mesmo estado">
              <Input name="cfopSaidaUf" defaultValue={formatarCfop(config.cfopSaidaUf)} placeholder="5.102" />
            </Field>
            <Field label="CFOP — comprador de outro estado">
              <Input name="cfopSaidaForaUf" defaultValue={formatarCfop(config.cfopSaidaForaUf)} placeholder="6.102" />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="NCM padrão dos veículos">
            <Input name="ncmPadrao" defaultValue={formatarNcm(config.ncmPadrao)} placeholder="8703.xx.xx" />
            <Dica>Automóvel 8703, utilitário/picape 8704 — o código exato vem do contador. Dá para trocar na hora de emitir.</Dica>
          </Field>
          <Field label="CST / CSOSN do ICMS">
            <Input name="icmsCst" defaultValue={config.icmsCst} placeholder="Ex.: 20 (normal) ou 102 (Simples)" />
            <Dica>CST no regime normal; CSOSN no Simples Nacional.</Dica>
          </Field>
          <Field label="CST / CSOSN na consignação (se diferente)">
            <Input name="icmsCstConsignacao" defaultValue={config.icmsCstConsignacao} placeholder="Ex.: 900" />
            <Dica>Vazio = usa o mesmo código acima.</Dica>
          </Field>
          <Field label="Redução da base do ICMS (%)">
            <Input name="icmsReducaoBase" defaultValue={config.icmsReducaoBase} inputMode="decimal" />
            <Dica>Só no regime normal (no Simples com CSOSN 102 não há destaque de ICMS).</Dica>
          </Field>
          <Field label="Alíquota do ICMS (%)">
            <Input name="icmsAliquota" defaultValue={config.icmsAliquota} inputMode="decimal" />
          </Field>
          <Field label="CST do PIS/COFINS">
            <Input name="pisCofinsCst" defaultValue={config.pisCofinsCst} />
          </Field>
        </div>
        <Field label="Informações complementares (saem em toda nota)">
          <Textarea name="informacoesComplementares" rows={3} defaultValue={config.informacoesComplementares} />
          <Dica>Ex.: base legal da redução do ICMS, se o contador pedir.</Dica>
        </Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-slate-900">Mudança de regime agendada</legend>
        <p className="text-xs text-slate-500">
          A partir da data, as notas saem sozinhas com a regra nova — não é preciso trocar nada no dia.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Novo regime">
            <Select name="regimeNovo" defaultValue={config.regimeNovo ?? ""}>
              <option value="">— sem mudança prevista —</option>
              {NFE_REGIMES.map((r) => (
                <option key={r} value={r}>
                  {r} — {nfeRegimeLabel[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="A partir de">
            <Input type="date" name="regimeNovoDesde" defaultValue={config.regimeNovoDesde} />
          </Field>
          <Field label="CST / CSOSN do ICMS no novo regime">
            <Input name="icmsCstNovo" defaultValue={config.icmsCstNovo} placeholder="Regime normal: 2 dígitos (ex.: 20)" />
          </Field>
          <Field label="CST / CSOSN na consignação (novo regime)">
            <Input name="icmsCstConsignacaoNovo" defaultValue={config.icmsCstConsignacaoNovo} />
            <Dica>Vazio = usa o mesmo código ao lado.</Dica>
          </Field>
          <Field label="Redução da base do ICMS (%)">
            <Input name="icmsReducaoBaseNovo" defaultValue={config.icmsReducaoBaseNovo} inputMode="decimal" />
          </Field>
          <Field label="Alíquota do ICMS (%)">
            <Input name="icmsAliquotaNovo" defaultValue={config.icmsAliquotaNovo} inputMode="decimal" />
          </Field>
          <Field label="CST do PIS/COFINS (novo regime)">
            <Input name="pisCofinsCstNovo" defaultValue={config.pisCofinsCstNovo} />
          </Field>
        </div>
      </fieldset>

      {state.error ? <p className="text-sm font-medium text-rose-600">{state.error}</p> : null}
      {state.success ? <p className="text-sm font-medium text-emerald-700">{state.success}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Salvar configuração da NF-e"}
      </Button>
    </form>
  );
}
