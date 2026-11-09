"use client";

import { useMemo, useRef, useState } from "react";
import MoneyInput from "@/components/MoneyInput";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { estimativaFerias, fimDoGozo, pagamentoDasFerias } from "@/lib/ferias";
import { lerDocumentoTrabalhistaAction, registrarFeriasAction } from "../actions";
import { useEnvio } from "./useEnvio";

export type OpcaoPeriodo = { inicio: string; rotulo: string; saldo: number };

const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Lançar férias: período aquisitivo, gozo, abono e os valores do recibo da
 * contabilidade — que pode ser lido por IA para preencher tudo.
 */
export default function FeriasForm({
  employeeId,
  salario,
  periodos,
}: {
  employeeId: string;
  salario: number;
  periodos: OpcaoPeriodo[];
}) {
  const { erro, pendente, aoEnviar } = useEnvio(registrarFeriasAction);
  const [opcoes, setOpcoes] = useState(periodos);
  const [aquisitivo, setAquisitivo] = useState(periodos[0]?.inicio ?? "");
  const [gozo, setGozo] = useState("");
  const [dias, setDias] = useState(String(Math.min(30, periodos[0]?.saldo || 30)));
  const [abono, setAbono] = useState("0");
  const [valores, setValores] = useState<{ bruto?: number; descontos?: number; liquido?: number; v: number }>({ v: 0 });
  const [gerarConta, setGerarConta] = useState(true);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  // Férias já tiradas (lançamento retroativo) normalmente já foram pagas: a
  // conta a pagar sai desmarcada para não criar um título atrasado à toa.
  const passado = !!gozo && gozo < new Date().toISOString().slice(0, 10);
  function mudarGozo(v: string) {
    setGozo(v);
    setGerarConta(!(v && v < new Date().toISOString().slice(0, 10)));
  }
  const nDias = Number(dias) || 0;
  const nAbono = Number(abono) || 0;
  const estimativa = useMemo(() => estimativaFerias(salario, nDias || 30, nAbono), [salario, nDias, nAbono]);
  const totalEstimado = estimativa.reduce((s, i) => s + i.valor, 0);
  const calculo = gozo
    ? {
        fim: iso(fimDoGozo(new Date(`${gozo}T12:00:00Z`), nDias || 30)),
        pagar: iso(pagamentoDasFerias(new Date(`${gozo}T12:00:00Z`))),
      }
    : null;

  async function lerComIa() {
    const f = arquivoRef.current?.files?.[0];
    if (!f) {
      setAviso("Escolha primeiro o arquivo do recibo de férias.");
      return;
    }
    setLendo(true);
    setAviso(null);
    const fd = new FormData();
    fd.set("arquivo", f);
    const r = await lerDocumentoTrabalhistaAction(fd);
    setLendo(false);
    if (!r.ok) {
      setAviso(r.erro);
      return;
    }
    const d = r.dados;
    if (d.tipo !== "FERIAS") setAviso("O arquivo não parece um recibo de férias — confira os campos.");
    if (d.aquisitivoInicio) {
      if (!opcoes.some((o) => o.inicio === d.aquisitivoInicio)) {
        setOpcoes((prev) => [
          ...prev,
          { inicio: d.aquisitivoInicio!, rotulo: `${dataBR(d.aquisitivoInicio!)} (do recibo)`, saldo: 30 },
        ]);
      }
      setAquisitivo(d.aquisitivoInicio);
    }
    if (d.gozoInicio) mudarGozo(d.gozoInicio);
    if (d.diasGozo) setDias(String(d.diasGozo));
    setAbono(String(d.abonoDias ?? 0));
    setValores((v) => ({
      bruto: d.totalProventos ?? undefined,
      descontos: d.totalDescontos ?? undefined,
      liquido: d.liquido ?? undefined,
      v: v.v + 1,
    }));
    setAviso((a) => a ?? "Campos preenchidos pela leitura do recibo. Confira antes de salvar.");
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      {/* Primeiro a pergunta que muda o resto: estas férias já foram pagas? */}
      {gerarConta ? <input type="hidden" name="gerarConta" value="on" /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          {
            pagar: false,
            titulo: "Já paga fora do sistema",
            texto: "Só registra os dias e anexa o recibo. Não cria conta a pagar.",
          },
          {
            pagar: true,
            titulo: "Pagar pelo sistema",
            texto: "Lança o líquido em Contas a pagar, 2 dias antes do gozo.",
          },
        ].map((o) => (
          <label
            key={o.titulo}
            className={`cursor-pointer rounded-lg border p-3 text-sm ${
              gerarConta === o.pagar ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-2 font-medium text-slate-800">
              <input type="radio" name="modoPagamento" checked={gerarConta === o.pagar} onChange={() => setGerarConta(o.pagar)} />
              {o.titulo}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">{o.texto}</span>
          </label>
        ))}
      </div>
      {passado && gerarConta ? (
        <p className="text-xs text-amber-700">
          Estas férias já começaram ou passaram: se o funcionário já recebeu, escolha &quot;Já paga fora do sistema&quot;.
        </p>
      ) : null}
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
        <p className="text-sm font-medium text-violet-900">📄 Recibo de férias da contabilidade</p>
        <p className="mt-0.5 text-xs text-violet-800">
          Anexe o PDF ou a foto do recibo: a IA lê e preenche os campos abaixo. O recibo fica guardado na ficha
          {gerarConta ? " e anexado à conta a pagar" : ""}.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={arquivoRef} name="arquivo" type="file" accept=".pdf,image/*" className="text-xs" />
          <Button type="button" variant="secondary" onClick={lerComIa} disabled={lendo}>
            {lendo ? "Lendo…" : "Ler com IA"}
          </Button>
        </div>
        {aviso ? <p className="mt-2 text-xs text-violet-900">{aviso}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Período aquisitivo" required>
          <Select name="aquisitivoInicio" value={aquisitivo} onChange={(e) => setAquisitivo(e.target.value)} required>
            {opcoes.length === 0 ? <option value="">Nenhum período com saldo</option> : null}
            {opcoes.map((o) => (
              <option key={o.inicio} value={o.inicio}>
                {o.rotulo}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Início do gozo" required>
          <Input type="date" name="gozoInicio" value={gozo} onChange={(e) => mudarGozo(e.target.value)} required />
        </Field>
        <Field label="Dias de gozo (5 a 30)" required>
          <Input type="number" name="dias" min={5} max={30} value={dias} onChange={(e) => setDias(e.target.value)} required />
        </Field>
        <Field label="Dias vendidos (abono, até 10)">
          <Input type="number" name="abonoDias" min={0} max={10} value={abono} onChange={(e) => setAbono(e.target.value)} />
        </Field>
      </div>
      {calculo ? (
        <p className="text-xs text-slate-600">
          Gozo até <strong>{dataBR(calculo.fim)}</strong> · pagar até <strong>{dataBR(calculo.pagar)}</strong> (2 dias
          antes do início, art. 145 da CLT) · avisar o funcionário 30 dias antes do início (art. 135).
        </p>
      ) : null}

      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Estimativa (sem INSS/IRRF, sem médias)</p>
        {estimativa.map((i) => (
          <p key={i.rotulo} className="flex justify-between">
            <span>{i.rotulo}</span>
            <span className="tabular-nums">{formatCurrency(i.valor)}</span>
          </p>
        ))}
        <p className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-medium text-slate-700">
          <span>Bruto estimado</span>
          <span className="tabular-nums">{formatCurrency(totalEstimado)}</span>
        </p>
        <p className="mt-1">O valor oficial é o do recibo da contabilidade.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" key={valores.v}>
        <Field label="Bruto do recibo">
          <MoneyInput name="valorBruto" defaultValue={valores.bruto ?? null} />
        </Field>
        <Field label="Descontos (INSS/IRRF)">
          <MoneyInput name="descontos" defaultValue={valores.descontos ?? null} />
        </Field>
        <Field label={gerarConta ? "Líquido a pagar" : "Líquido pago"}>
          <MoneyInput name="valorLiquido" defaultValue={valores.liquido ?? null} />
        </Field>
      </div>
      {!gerarConta ? (
        <Field label="Comprovante bancário do pagamento (opcional)">
          <input name="comprovante" type="file" accept=".pdf,image/*" className="text-xs" />
          <p className="mt-1 text-xs text-slate-500">PIX, TED ou transferência que pagou estas férias.</p>
        </Field>
      ) : null}
      <Field label="Observações">
        <Textarea name="notes" rows={2} />
      </Field>
      {erro ? <p className="text-sm text-rose-600">{erro}</p> : null}
      <Button type="submit" disabled={pendente || opcoes.length === 0}>
        {pendente ? "Salvando…" : gerarConta ? "Lançar férias" : "Registrar férias pagas"}
      </Button>
    </form>
  );
}
