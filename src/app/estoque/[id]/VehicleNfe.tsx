"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarNfeAction, cancelarNfeAction, emitirNfeEntradaAction, emitirNfeSaidaAction } from "../nfe-actions";

export type NotaResumo = {
  id: string;
  tipo: string;
  ambiente: string;
  status: string;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  mensagem: string | null;
  createdAt: string;
  emitidaPor: string | null;
  valor: number;
  cfop: string;
  temXml: boolean;
  temDanfe: boolean;
  justificativaCancelamento: string | null;
};

export type EntradaPrevia = {
  faltas: string[];
  descricao: string;
  ncm: string;
  /** De onde veio o NCM sugerido (ex.: "motor 1.0 (até 1.000 cm³)"). */
  ncmMotivo?: string;
  cfop: string | null;
  valor: number;
  vendedor: string | null;
  /** Vendedor é empresa (CNPJ): em regra quem emite é ela — aviso antes de emitir. */
  vendedorEmpresa: boolean;
  vendedorIe: string | null;
};

/** NF-e de entrada emitida PELO VENDEDOR (empresa) — recebida, não emitida aqui. */
export type NfeRecebida = {
  chave: string | null;
  numero: string | null;
  serie: string | null;
  emitidaEm: string | null;
  emitente: string | null;
  /** DANFE anexado em Documentos do veículo. */
  anexoId: string | null;
};

const statusInfo: Record<string, { label: string; cls: string }> = {
  PROCESSANDO: { label: "Processando na SEFAZ…", cls: "bg-amber-100 text-amber-800" },
  AUTORIZADA: { label: "Autorizada", cls: "bg-emerald-100 text-emerald-800" },
  ERRO: { label: "Rejeitada", cls: "bg-rose-100 text-rose-800" },
  CANCELADA: { label: "Cancelada", cls: "bg-slate-200 text-slate-700" },
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default function VehicleNfe({
  vehicleId,
  ambiente,
  notas,
  entrada,
  recebida = null,
  saida,
  canEmitir,
  canCancelar,
}: {
  vehicleId: string;
  ambiente: string;
  notas: NotaResumo[];
  entrada: EntradaPrevia | null;
  /** Nota de entrada recebida do vendedor: com ela, não há entrada a emitir. */
  recebida?: NfeRecebida | null;
  /** Prévia da nota de venda — só quando o veículo tem venda registrada. */
  saida: EntradaPrevia | null;
  canEmitir: boolean;
  canCancelar: boolean;
}) {
  const router = useRouter();
  const homologacao = ambiente !== "PRODUCAO";
  const valida = (tipo: string) =>
    notas.some((n) => n.tipo === tipo && n.ambiente === ambiente && ["PROCESSANDO", "AUTORIZADA"].includes(n.status));

  // Enquanto houver nota em processamento, pergunta à Focus a cada 4 s (até ~1 min).
  const processando = notas.filter((n) => n.status === "PROCESSANDO").map((n) => n.id);
  const tentativas = useRef(0);
  const chaveProc = processando.join(",");
  useEffect(() => {
    if (!chaveProc || !canEmitir) return;
    tentativas.current = 0;
    const t = setInterval(async () => {
      tentativas.current += 1;
      let mudou = false;
      for (const id of chaveProc.split(",")) {
        const r = await atualizarNfeAction(id);
        if (r.ok && r.status !== "PROCESSANDO") mudou = true;
      }
      if (mudou) router.refresh();
      if (mudou || tentativas.current >= 15) clearInterval(t);
    }, 4000);
    return () => clearInterval(t);
  }, [chaveProc, canEmitir, router]);

  return (
    <div className="space-y-4 p-5">
      {homologacao ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Ambiente de <strong>homologação (teste)</strong>: as notas não têm valor fiscal e não entram na ficha
          nem no Renave. Para valer, troque para Produção em Parâmetros → Nota fiscal (NF-e).
        </p>
      ) : null}

      {recebida ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <p className="font-semibold text-emerald-900">
            📥 NF-e de entrada recebida{recebida.emitente ? ` de ${recebida.emitente}` : " do vendedor"}
            {recebida.numero ? ` · nº ${recebida.numero}` : ""}
            {recebida.serie ? ` · série ${recebida.serie}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-emerald-800">
            Emitida pelo vendedor{recebida.emitidaEm ? ` em ${recebida.emitidaEm}` : ""} — é a nota de entrada deste
            carro; não é preciso emitir outra.
          </p>
          {recebida.chave ? (
            <p className="mt-1 break-all font-mono text-[11px] text-emerald-900">Chave: {recebida.chave}</p>
          ) : (
            <p className="mt-1 text-xs text-amber-800">
              A chave ainda não está no Renave — leia a nota no card do Renave.
            </p>
          )}
          {recebida.anexoId ? (
            <a
              href={`/anexos/${recebida.anexoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            >
              📄 Abrir DANFE
            </a>
          ) : null}
        </div>
      ) : null}

      {notas.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {notas.map((n) => (
            <NotaLinha key={n.id} n={n} vehicleId={vehicleId} canCancelar={canCancelar} canEmitir={canEmitir} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma nota emitida pelo sistema para este veículo.</p>
      )}

      {entrada && canEmitir && !valida("ENTRADA") && !recebida?.chave ? (
        <EmitirNota tipo="ENTRADA" vehicleId={vehicleId} previa={entrada} homologacao={homologacao} />
      ) : null}
      {saida && canEmitir && !valida("SAIDA") ? (
        <EmitirNota tipo="SAIDA" vehicleId={vehicleId} previa={saida} homologacao={homologacao} />
      ) : null}
    </div>
  );
}

function NotaLinha({
  n,
  vehicleId,
  canCancelar,
  canEmitir,
}: {
  n: NotaResumo;
  vehicleId: string;
  canCancelar: boolean;
  canEmitir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cancelando, setCancelando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const info = statusInfo[n.status] ?? { label: n.status, cls: "bg-slate-100 text-slate-700" };
  const base = `/estoque/${vehicleId}/nfe/${n.id}`;

  function atualizar() {
    setErro(null);
    start(async () => {
      const r = await atualizarNfeAction(n.id);
      if (!r.ok) setErro(r.error || "Não foi possível consultar.");
      router.refresh();
    });
  }
  function cancelar() {
    setErro(null);
    start(async () => {
      const r = await cancelarNfeAction(n.id, justificativa);
      if (!r.ok) {
        setErro(r.error || "Não foi possível cancelar.");
        return;
      }
      setCancelando(false);
      router.refresh();
    });
  }

  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">
          NF-e de {n.tipo === "ENTRADA" ? "entrada" : "saída"}
          {n.numero ? ` nº ${n.numero}` : ""}
          {n.serie ? ` · série ${n.serie}` : ""}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${info.cls}`}>{info.label}</span>
        {n.ambiente !== "PRODUCAO" ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">teste</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {dataHora(n.createdAt)} · {brl(n.valor)} · CFOP {n.cfop}
        {n.emitidaPor ? ` · por ${n.emitidaPor}` : ""}
      </p>
      {n.chave ? <p className="mt-1 break-all font-mono text-[11px] text-slate-600">Chave: {n.chave}</p> : null}
      {n.status === "ERRO" && n.mensagem ? <p className="mt-1 text-xs text-rose-700">{n.mensagem}</p> : null}
      {n.status === "CANCELADA" && n.justificativaCancelamento ? (
        <p className="mt-1 text-xs text-slate-500">Cancelada: {n.justificativaCancelamento}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {n.temDanfe && n.status !== "ERRO" ? (
          <a href={`${base}/danfe`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            📄 DANFE
          </a>
        ) : null}
        {n.temXml && n.status !== "ERRO" ? (
          <a href={`${base}/xml`} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            ⬇ XML
          </a>
        ) : null}
        {n.status === "PROCESSANDO" && canEmitir ? (
          <button type="button" onClick={atualizar} disabled={pending} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {pending ? "Consultando…" : "↻ Atualizar situação"}
          </button>
        ) : null}
        {n.status === "AUTORIZADA" && canCancelar && !cancelando ? (
          <button type="button" onClick={() => setCancelando(true)} className="text-xs font-medium text-rose-700 hover:underline">
            Cancelar nota
          </button>
        ) : null}
      </div>

      {cancelando ? (
        <div className="mt-2 space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs text-rose-800">
            O cancelamento vai à SEFAZ na hora e não tem volta. Em geral só é aceito até 24 h depois da emissão.
          </p>
          <textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={2}
            placeholder="Justificativa (mínimo 15 caracteres) — ex.: nota emitida com valor errado"
            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={cancelar}
              disabled={pending || justificativa.trim().length < 15}
              className="h-8 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {pending ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
            <button type="button" onClick={() => setCancelando(false)} className="text-xs text-slate-500 hover:underline">
              Voltar
            </button>
          </div>
        </div>
      ) : null}
      {erro ? <p className="mt-1 text-xs text-rose-700">{erro}</p> : null}
    </li>
  );
}

function EmitirNota({
  tipo,
  vehicleId,
  previa,
  homologacao,
}: {
  tipo: "ENTRADA" | "SAIDA";
  vehicleId: string;
  previa: EntradaPrevia;
  homologacao: boolean;
}) {
  const entrada = tipo === "ENTRADA";
  const nome = entrada ? "entrada" : "saída";
  const [valor, setValor] = useState(previa.valor.toFixed(2).replace(".", ","));
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState(previa.descricao);
  const [ncm, setNcm] = useState(previa.ncm);
  const [informacoes, setInformacoes] = useState("");
  const [erro, setErro] = useState<{ msg: string; faltas?: string[] } | null>(null);

  function emitir() {
    setErro(null);
    start(async () => {
      const ajustes = { descricao, ncm, informacoes };
      const r = entrada
        ? await emitirNfeEntradaAction(vehicleId, ajustes)
        : await emitirNfeSaidaAction(vehicleId, {
            ...ajustes,
            valor: Number(valor.replace(/\./g, "").replace(",", ".")) || undefined,
          });
      if (!r.ok) {
        setErro({ msg: r.error || "Não foi possível emitir.", faltas: r.faltas });
        return;
      }
      setAberto(false);
      router.refresh();
    });
  }

  if (previa.faltas.length) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        <p className="font-semibold text-amber-900">Para emitir a NF-e de {nome}, falta:</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-amber-800">
          {previa.faltas.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    );
  }

  const avisoEmpresa = !entrada ? (
    previa.vendedorEmpresa ? (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Comprador empresa — IE: <strong>{previa.vendedorIe || "não informada"}</strong>
        {previa.vendedorIe
          ? ""
          : ". Se a empresa tem inscrição estadual, informe no cadastro do cliente (a SEFAZ exige)."}
      </p>
    ) : null
  ) : previa.vendedorEmpresa ? (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <p className="font-semibold">Compra de empresa (CNPJ)</p>
      <p className="mt-0.5">
        Em regra, quem emite a nota é a <strong>empresa vendedora</strong> (a NF-e de venda dela) — a loja usa a chave
        dessa nota na ficha (Renave → ler a NF-e) e não emite a própria. Emita a de entrada só se o contador orientar
        (ex.: empresa que não é contribuinte do ICMS).
      </p>
      <p className="mt-1">
        IE do vendedor:{" "}
        <strong>{previa.vendedorIe || "não informada"}</strong>
        {previa.vendedorIe ? "" : " — se a empresa tem inscrição estadual, informe no cadastro do fornecedor (a SEFAZ exige)."}
      </p>
    </div>
  ) : null;

  if (!aberto) {
    return (
      <div className="space-y-2">
        {avisoEmpresa}
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
        >
          🧾 Emitir NF-e de {nome}
          {homologacao ? " (teste)" : ""}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-slate-900">
        NF-e de {nome} — {entrada ? "compra" : "venda"} do veículo
      </p>
      <p className="text-xs text-slate-600">
        {entrada ? "Vendedor" : "Comprador"}: <strong>{previa.vendedor}</strong>
        {entrada ? (
          <>
            {" "}
            · Valor: <strong>{brl(previa.valor)}</strong>
          </>
        ) : null}{" "}
        · CFOP <strong>{previa.cfop}</strong>
      </p>
      {!entrada ? (
        <label className="block max-w-[220px]">
          <span className="text-xs text-slate-500">Valor da nota (R$)</span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <span className="mt-0.5 block text-[11px] text-slate-500">
            Só o veículo ({brl(previa.valor)}) — a transferência cobrada na venda não entra na nota.
          </span>
        </label>
      ) : null}
      <label className="block">
        <span className="text-xs text-slate-500">Descrição do item</span>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={120} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      </label>
      <label className="block max-w-[200px]">
        <span className="text-xs text-slate-500">NCM</span>
        <input value={ncm} onChange={(e) => setNcm(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        {previa.ncmMotivo ? <span className="mt-0.5 block text-[11px] text-slate-500">{previa.ncmMotivo}</span> : null}
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">Informações complementares desta nota (opcional)</span>
        <textarea value={informacoes} onChange={(e) => setInformacoes(e.target.value)} rows={2} className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={emitir} disabled={pending} className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {pending ? "Enviando à SEFAZ…" : homologacao ? "Emitir nota de teste" : "Emitir NF-e"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-slate-500 hover:underline">
          Voltar
        </button>
      </div>
      {erro ? (
        <div className="text-xs text-rose-700">
          <p>{erro.msg}</p>
          {erro.faltas?.length ? (
            <ul className="mt-1 list-inside list-disc">
              {erro.faltas.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
