"use client";

import { useMemo, useRef, useState } from "react";
import MoneyInput from "@/components/MoneyInput";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import {
  estimativaRescisao,
  pagamentoDaRescisao,
  ROTULO_AVISO,
  ROTULO_TIPO_RESCISAO,
  type AvisoPrevio,
  type TipoRescisao,
} from "@/lib/ferias";
import { lerDocumentoTrabalhistaAction, registrarRescisaoAction } from "../actions";
import { useEnvio } from "./useEnvio";

const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const d12 = (iso: string) => new Date(`${iso}T12:00:00Z`);

/**
 * Lançar a rescisão: tipo, aviso prévio e datas, com a estimativa das verbas
 * para conferir o TRCT da contabilidade. Ao salvar, o funcionário é desligado.
 */
export default function RescisaoForm({
  employeeId,
  salario,
  admissao,
  ferias,
}: {
  employeeId: string;
  salario: number;
  admissao: string;
  ferias: { aquisitivoInicio: string; gozoInicio: string; dias: number; abonoDias: number }[];
}) {
  const { erro, pendente, aoEnviar } = useEnvio(registrarRescisaoAction);
  const [tipo, setTipo] = useState<TipoRescisao>("SEM_JUSTA_CAUSA");
  const [aviso, setAviso] = useState<AvisoPrevio>("INDENIZADO");
  const [dataAviso, setDataAviso] = useState("");
  const [deslig, setDeslig] = useState("");
  const [valores, setValores] = useState<{ liquido?: number; multa?: number; v: number }>({ v: 0 });
  const [lendo, setLendo] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const est = useMemo(
    () =>
      deslig
        ? estimativaRescisao({
            salario,
            admissao: d12(admissao),
            desligamento: d12(deslig),
            tipo,
            aviso,
            ferias: ferias.map((f) => ({ ...f, aquisitivoInicio: d12(f.aquisitivoInicio), gozoInicio: d12(f.gozoInicio) })),
          })
        : null,
    [salario, admissao, deslig, tipo, aviso, ferias],
  );

  async function lerComIa() {
    const f = arquivoRef.current?.files?.[0];
    if (!f) {
      setMsg("Escolha primeiro o arquivo do TRCT.");
      return;
    }
    setLendo(true);
    setMsg(null);
    const fd = new FormData();
    fd.set("arquivo", f);
    const r = await lerDocumentoTrabalhistaAction(fd);
    setLendo(false);
    if (!r.ok) {
      setMsg(r.erro);
      return;
    }
    const d = r.dados;
    if (d.tipo !== "RESCISAO") setMsg("O arquivo não parece um termo de rescisão — confira os campos.");
    if (d.causaRescisao) setTipo(d.causaRescisao);
    if (d.avisoPrevio) setAviso(d.avisoPrevio);
    if (d.dataAviso) setDataAviso(d.dataAviso);
    if (d.dataDesligamento) setDeslig(d.dataDesligamento);
    setValores((v) => ({ liquido: d.liquido ?? undefined, multa: d.multaFgts ?? undefined, v: v.v + 1 }));
    setMsg((m) => m ?? "Campos preenchidos pela leitura do TRCT. Confira antes de salvar.");
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
        <p className="text-sm font-medium text-violet-900">📄 Termo de rescisão (TRCT) da contabilidade (opcional)</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={arquivoRef} name="arquivo" type="file" accept=".pdf,image/*" className="text-xs" />
          <Button type="button" variant="secondary" onClick={lerComIa} disabled={lendo}>
            {lendo ? "Lendo…" : "Ler com IA"}
          </Button>
        </div>
        {msg ? <p className="mt-2 text-xs text-violet-900">{msg}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo" required>
          <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoRescisao)}>
            {Object.entries(ROTULO_TIPO_RESCISAO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Aviso prévio">
          <Select name="avisoPrevio" value={aviso} onChange={(e) => setAviso(e.target.value as AvisoPrevio)}>
            {Object.entries(ROTULO_AVISO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data do aviso">
          <Input type="date" name="dataAviso" value={dataAviso} onChange={(e) => setDataAviso(e.target.value)} />
        </Field>
        <Field label="Data do desligamento" required>
          <Input type="date" name="dataDesligamento" value={deslig} onChange={(e) => setDeslig(e.target.value)} required />
        </Field>
      </div>

      {est ? (
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">
            Estimativa das verbas (sem INSS/IRRF e sem médias) · pagar até{" "}
            {dataBR(pagamentoDaRescisao(d12(deslig)).toISOString().slice(0, 10))}
          </p>
          {est.itens.map((i) => (
            <p key={i.rotulo} className="flex justify-between gap-2">
              <span>
                {i.rotulo}
                {i.nota ? <span className="text-slate-400"> — {i.nota}</span> : null}
              </span>
              <span className="tabular-nums">{formatCurrency(i.valor)}</span>
            </p>
          ))}
          <p className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-medium text-slate-700">
            <span>Total bruto estimado</span>
            <span className="tabular-nums">{formatCurrency(est.total)}</span>
          </p>
          {est.multaFgts > 0 ? (
            <p className="flex justify-between">
              <span>Multa do FGTS estimada ({tipo === "ACORDO" ? "20%" : "40%"} do saldo)</span>
              <span className="tabular-nums">{formatCurrency(est.multaFgts)}</span>
            </p>
          ) : null}
          <p className="mt-1">
            O valor oficial é o do TRCT da contabilidade; o saldo real do FGTS está no extrato da Caixa.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2" key={valores.v}>
        <Field label="Líquido da rescisão (TRCT)">
          <MoneyInput name="valorLiquido" defaultValue={valores.liquido ?? null} />
        </Field>
        <Field label="Multa do FGTS (guia)">
          <MoneyInput name="multaFgts" defaultValue={valores.multa ?? null} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="gerarContas" defaultChecked className="mt-1" />
        <span>Lançar o líquido e a multa do FGTS em Contas a pagar (prazo de 10 dias, art. 477 da CLT)</span>
      </label>
      <Field label="Observações">
        <Textarea name="notes" rows={2} />
      </Field>
      {erro ? <p className="text-sm text-rose-600">{erro}</p> : null}
      <Button type="submit" variant="danger" disabled={pendente}>
        {pendente ? "Salvando…" : "Lançar rescisão e desligar"}
      </Button>
    </form>
  );
}
