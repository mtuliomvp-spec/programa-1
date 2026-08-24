"use client";

import { useActionState, useMemo, useState } from "react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import {
  TITULOS_ENTRADA,
  TITULOS_SAIDA,
  assinaturaLabel,
  avisoConsignacaoSemContrato,
  chaveNfeValida,
  dadosDaChaveNfe,
  digitos,
  formatChaveNfe,
  previaLabel,
  situacaoLabel,
  situacaoTone,
  tituloLabel,
  type Pendencia,
} from "@/lib/renave";
import { saveVehicleRenaveAction, type RenaveFormState } from "../actions";

export type RenaveDados = {
  vehicleId: string;
  consigned: boolean;
  vendido: boolean;
  situacao: keyof typeof situacaoLabel;
  renaveEntradaTitulo: string | null;
  renaveEntradaProtocolo: string | null;
  renaveEntradaEm: string | null;
  entryNfeKey: string | null;
  entryNfeNumber: string | null;
  entryNfeSerie: string | null;
  entryNfeIssuedAt: string | null;
  renavePreviaTipo: string | null;
  renavePreviaNumero: string | null;
  renavePreviaEm: string | null;
  renaveAssinaturaTipo: string | null;
  renaveAssinaturaEm: string | null;
  consignContractId: string | null;
  consignContractAt: string | null;
  renaveSaidaTitulo: string | null;
  renaveSaidaProtocolo: string | null;
  renaveSaidaEm: string | null;
  exitNfeKey: string | null;
  exitNfeNumber: string | null;
  exitNfeSerie: string | null;
  exitNfeIssuedAt: string | null;
  crvNumber: string | null;
  crvSecurityCode: string | null;
  renaveVinculoMotivo: string | null;
  renaveNotes: string | null;
};

/** Campo de chave da NF-e: mostra série/número tirados da própria chave. */
function ChaveNfe({ name, label, defaultValue }: { name: string; label: string; defaultValue: string | null }) {
  const [valor, setValor] = useState(defaultValue ? formatChaveNfe(defaultValue) : "");
  const d = digitos(valor);
  const dados = useMemo(() => dadosDaChaveNfe(d), [d]);

  return (
    <Field label={label}>
      <Input
        name={name}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        inputMode="numeric"
        placeholder="44 dígitos da chave de acesso"
      />
      <span className="mt-1 block text-xs text-slate-500">
        {d.length === 0 ? (
          "Copie a chave do DANFE — o número e a série saem dela."
        ) : dados ? (
          <span className="text-emerald-700">
            ✓ Nota {dados.numero}, série {dados.serie}
          </span>
        ) : (
          <span className="text-amber-700">{d.length} de 44 dígitos</span>
        )}
      </span>
    </Field>
  );
}

/**
 * Bloco do Renave na ficha do veículo: o que a escrituração eletrônica exige,
 * o que já foi registrado e o que falta. Em modo de implantação nada é
 * bloqueado — a lista de pendências é um aviso do que a obrigatoriedade vai
 * cobrar.
 */
export default function VehicleRenave({
  dados,
  pendencias,
  prazo,
  diasAtpv,
  canEdit,
}: {
  dados: RenaveDados;
  pendencias: Pendencia[];
  prazo: string;
  diasAtpv: number | null;
  canEdit: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: RenaveFormState, formData: FormData) => {
      const r = await saveVehicleRenaveAction(prev, formData);
      if (r.success) setAberto(false);
      return r;
    },
    {} as RenaveFormState,
  );

  const doDia = (v: string | null) => (v ? v.slice(0, 10) : "");
  const entrada = pendencias.filter((p) => p.momento === "entrada");
  const saida = pendencias.filter((p) => p.momento === "saida");

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={situacaoTone[dados.situacao]}>{situacaoLabel[dados.situacao]}</Badge>
        {dados.renaveEntradaProtocolo ? (
          <span className="text-xs text-slate-500">
            Entrada: {dados.renaveEntradaProtocolo}
            {dados.renaveEntradaEm ? ` · ${doDia(dados.renaveEntradaEm).split("-").reverse().join("/")}` : ""}
          </span>
        ) : null}
        {dados.renaveSaidaProtocolo ? (
          <span className="text-xs text-slate-500">
            Saída: {dados.renaveSaidaProtocolo}
            {dados.renaveSaidaEm ? ` · ${doDia(dados.renaveSaidaEm).split("-").reverse().join("/")}` : ""}
          </span>
        ) : null}
      </div>

      {dados.consigned && !dados.consignContractId ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {avisoConsignacaoSemContrato(new Date(prazo))}
        </p>
      ) : null}

      {diasAtpv !== null ? (
        <p
          className={`rounded-lg border px-4 py-3 text-sm ${
            diasAtpv < 0
              ? "border-rose-300 bg-rose-50 text-rose-900"
              : diasAtpv <= 7
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          {diasAtpv < 0
            ? `Prazo de 30 dias do contrato de consignação vencido há ${Math.abs(diasAtpv)} dia(s). Sem a ATPV-e assinada pelo consignante, a venda é cancelada e o veículo volta ao dono (art. 20, § 7º).`
            : `Faltam ${diasAtpv} dia(s) para o consignante assinar a ATPV-e (prazo de 30 dias do contrato de consignação — art. 20, § 7º).`}
        </p>
      ) : null}

      {pendencias.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ A ficha tem todos os dados que o registro no Renave exige.
        </p>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            Faltam {pendencias.length} dado(s) para escriturar este veículo no Renave
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-amber-900">
            {entrada.map((p) => (
              <li key={p.key}>
                • {p.texto} <span className="text-xs text-amber-700">({p.base})</span>
              </li>
            ))}
            {saida.map((p) => (
              <li key={p.key}>
                • {p.texto} <span className="text-xs text-amber-700">({p.base} — exigido na saída)</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            Enquanto durar a implantação nada é bloqueado. A partir de{" "}
            {new Date(prazo).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} a movimentação
            deste veículo não poderá ser feita sem esses dados.
          </p>
        </div>
      )}

      {!aberto ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <p className="text-slate-600">
            Título da entrada:{" "}
            <strong className="text-slate-900">
              {dados.renaveEntradaTitulo
                ? tituloLabel[dados.renaveEntradaTitulo as keyof typeof tituloLabel]
                : "—"}
            </strong>
          </p>
          <p className="text-slate-600">
            NF-e de entrada:{" "}
            <strong className="text-slate-900">
              {chaveNfeValida(dados.entryNfeKey)
                ? `nº ${dados.entryNfeNumber}, série ${dados.entryNfeSerie}`
                : "—"}
            </strong>
          </p>
          <p className="text-slate-600">
            Identificação prévia:{" "}
            <strong className="text-slate-900">
              {dados.renavePreviaTipo
                ? previaLabel[dados.renavePreviaTipo as keyof typeof previaLabel]
                : "—"}
            </strong>
          </p>
          <p className="text-slate-600">
            Assinatura do vendedor:{" "}
            <strong className="text-slate-900">
              {dados.renaveAssinaturaTipo
                ? assinaturaLabel[dados.renaveAssinaturaTipo as keyof typeof assinaturaLabel]
                : "—"}
            </strong>
          </p>
          <p className="text-slate-600">
            CRV: <strong className="text-slate-900">{dados.crvNumber || "—"}</strong>
          </p>
          <p className="text-slate-600">
            NF-e de saída:{" "}
            <strong className="text-slate-900">
              {chaveNfeValida(dados.exitNfeKey)
                ? `nº ${dados.exitNfeNumber}, série ${dados.exitNfeSerie}`
                : "—"}
            </strong>
          </p>
        </div>
      ) : null}

      {canEdit ? (
        <Button type="button" variant="secondary" onClick={() => setAberto((v) => !v)}>
          {aberto ? "Fechar" : "Preencher dados do Renave"}
        </Button>
      ) : null}

      {aberto ? (
        <form action={formAction} className="space-y-5 border-t border-slate-200 pt-4">
          <input type="hidden" name="vehicleId" value={dados.vehicleId} />

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-900">Entrada no estoque</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Título do negócio jurídico">
                <Select name="renaveEntradaTitulo" defaultValue={dados.renaveEntradaTitulo || ""}>
                  <option value="">— escolha —</option>
                  {TITULOS_ENTRADA.map((t) => (
                    <option key={t} value={t}>
                      {tituloLabel[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data da entrada no Renave">
                <Input type="date" name="renaveEntradaEm" defaultValue={doDia(dados.renaveEntradaEm)} />
              </Field>
              <Field label="Protocolo do registro de entrada">
                <Input
                  name="renaveEntradaProtocolo"
                  defaultValue={dados.renaveEntradaProtocolo || ""}
                  placeholder="Número devolvido pela integradora"
                />
              </Field>
              <Field label="Emissão da NF-e de entrada">
                <Input type="date" name="entryNfeIssuedAt" defaultValue={doDia(dados.entryNfeIssuedAt)} />
              </Field>
              <div className="sm:col-span-2">
                <ChaveNfe name="entryNfeKey" label="Chave da NF-e de entrada" defaultValue={dados.entryNfeKey} />
              </div>
              <Field label="Identificação prévia de entrada">
                <Select name="renavePreviaTipo" defaultValue={dados.renavePreviaTipo || ""}>
                  <option value="">— não informada —</option>
                  <option value="IDENTIFICACAO_PREVIA">{previaLabel.IDENTIFICACAO_PREVIA}</option>
                  <option value="VISTORIA">{previaLabel.VISTORIA}</option>
                </Select>
              </Field>
              <Field label="Número / data da identificação prévia">
                <div className="flex gap-2">
                  <Input name="renavePreviaNumero" defaultValue={dados.renavePreviaNumero || ""} placeholder="Número" />
                  <Input type="date" name="renavePreviaEm" defaultValue={doDia(dados.renavePreviaEm)} />
                </div>
              </Field>
              <Field label="Assinatura do vendedor (compra de usado)">
                <Select name="renaveAssinaturaTipo" defaultValue={dados.renaveAssinaturaTipo || ""}>
                  <option value="">— não informada —</option>
                  <option value="RECONHECIMENTO_FIRMA">{assinaturaLabel.RECONHECIMENTO_FIRMA}</option>
                  <option value="ELETRONICA_AVANCADA">{assinaturaLabel.ELETRONICA_AVANCADA}</option>
                  <option value="ELETRONICA_QUALIFICADA">{assinaturaLabel.ELETRONICA_QUALIFICADA}</option>
                </Select>
              </Field>
              <Field label="Data/hora da assinatura">
                <Input type="date" name="renaveAssinaturaEm" defaultValue={doDia(dados.renaveAssinaturaEm)} />
              </Field>
            </div>
          </fieldset>

          {dados.consigned ? (
            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-slate-900">Contrato eletrônico de consignação</legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Número do contrato no Renave">
                  <Input name="consignContractId" defaultValue={dados.consignContractId || ""} />
                </Field>
                <Field label="Data do contrato">
                  <Input type="date" name="consignContractAt" defaultValue={doDia(dados.consignContractAt)} />
                  <span className="mt-1 block text-xs text-slate-500">
                    O prazo de 30 dias para a ATPV-e conta desta data.
                  </span>
                </Field>
              </div>
            </fieldset>
          ) : null}

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-900">Documento e saída</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Número do CRV">
                <Input name="crvNumber" defaultValue={dados.crvNumber || ""} />
              </Field>
              <Field label="Código de segurança do CRV">
                <Input name="crvSecurityCode" defaultValue={dados.crvSecurityCode || ""} />
              </Field>
              <Field label="Título do negócio jurídico da saída">
                <Select name="renaveSaidaTitulo" defaultValue={dados.renaveSaidaTitulo || ""}>
                  <option value="">— escolha —</option>
                  {TITULOS_SAIDA.map((t) => (
                    <option key={t} value={t}>
                      {tituloLabel[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data da saída no Renave">
                <Input type="date" name="renaveSaidaEm" defaultValue={doDia(dados.renaveSaidaEm)} />
              </Field>
              <Field label="Protocolo do registro de saída">
                <Input name="renaveSaidaProtocolo" defaultValue={dados.renaveSaidaProtocolo || ""} />
              </Field>
              <Field label="Emissão da NF-e de saída">
                <Input type="date" name="exitNfeIssuedAt" defaultValue={doDia(dados.exitNfeIssuedAt)} />
              </Field>
              <div className="sm:col-span-2">
                <ChaveNfe name="exitNfeKey" label="Chave da NF-e de saída" defaultValue={dados.exitNfeKey} />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-slate-900">Pendências e observações</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Motivo do vínculo (estoque vinculado)">
                <Input
                  name="renaveVinculoMotivo"
                  defaultValue={dados.renaveVinculoMotivo || ""}
                  placeholder="Ex.: multa inserida após a entrada"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Preenchido, o veículo passa a constar como &quot;em estoque vinculado&quot;.
                </span>
              </Field>
              <Field label="Observações">
                <Input name="renaveNotes" defaultValue={dados.renaveNotes || ""} />
              </Field>
            </div>
          </fieldset>

          {state.error ? <p className="text-sm font-medium text-rose-600">{state.error}</p> : null}
          {state.success ? <p className="text-sm font-medium text-emerald-700">{state.success}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar dados do Renave"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
