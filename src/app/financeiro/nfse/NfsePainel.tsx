"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DESCRICOES_NFSE } from "@/lib/nfse";
import { TOMADORES_CONHECIDOS, tomadorPorNome } from "@/lib/tomadores-nfse";
import { atualizarNfseAction, cancelarNfseAction, emitirNfseAction, vincularFinanceiraAction } from "./actions";

export type FinanceiraOpcao = {
  id: string;
  name: string;
  /** Cadastro fiscal ligado (razão social / CNPJ); null = ainda pedir o CNPJ. */
  tomadorNome: string | null;
  tomadorDocumento: string | null;
};

export type NotaServicoResumo = {
  id: string;
  ambiente: string;
  status: string;
  tomadorNome: string;
  tomadorDocumento: string;
  descricao: string;
  valor: number;
  competencia: string;
  numero: string | null;
  codigoVerificacao: string | null;
  url: string | null;
  temDanfse: boolean;
  temXml: boolean;
  mensagem: string | null;
  createdAt: string;
  emitidaPor: string | null;
  justificativaCancelamento: string | null;
};

const statusInfo: Record<string, { label: string; cls: string }> = {
  PROCESSANDO: { label: "Processando…", cls: "bg-amber-100 text-amber-800" },
  AUTORIZADA: { label: "Autorizada", cls: "bg-emerald-100 text-emerald-800" },
  ERRO: { label: "Rejeitada", cls: "bg-rose-100 text-rose-800" },
  CANCELADA: { label: "Cancelada", cls: "bg-slate-200 text-slate-700" },
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const hojeSp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const fmtDoc = (d: string) => {
  const n = d.replace(/\D/g, "");
  return n.length === 14 ? `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}` : d;
};

export default function NfsePainel({
  notas,
  financeiras,
  canEmitir,
  canCancelar,
  homologacao,
}: {
  notas: NotaServicoResumo[];
  financeiras: FinanceiraOpcao[];
  canEmitir: boolean;
  canCancelar: boolean;
  homologacao: boolean;
}) {
  const router = useRouter();

  // Nota em processamento: consulta a Focus a cada 5 s por até 3 min — o
  // Ambiente Nacional da NFS-e às vezes passa de 1 min para responder.
  const chaveProc = notas
    .filter((n) => n.status === "PROCESSANDO")
    .map((n) => n.id)
    .join(",");
  const tentativas = useRef(0);
  useEffect(() => {
    if (!chaveProc || !canEmitir) return;
    tentativas.current = 0;
    const t = setInterval(async () => {
      tentativas.current += 1;
      let mudou = false;
      for (const id of chaveProc.split(",")) {
        const r = await atualizarNfseAction(id);
        if (r.ok && r.status !== "PROCESSANDO") mudou = true;
      }
      if (mudou) router.refresh();
      if (mudou || tentativas.current >= 36) clearInterval(t);
    }, 5000);
    return () => clearInterval(t);
  }, [chaveProc, canEmitir, router]);

  return (
    <div className="space-y-4 p-5">
      {canEmitir ? <Emitir financeiras={financeiras} homologacao={homologacao} /> : null}
      {notas.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {notas.map((n) => (
            <Linha key={n.id} n={n} canCancelar={canCancelar} canEmitir={canEmitir} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma NFS-e emitida pelo sistema ainda.</p>
      )}
    </div>
  );
}

function Emitir({ financeiras, homologacao }: { financeiras: FinanceiraOpcao[]; homologacao: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [financeiraId, setFinanceiraId] = useState("");
  const financeira = financeiras.find((f) => f.id === financeiraId) ?? null;
  const [descricao, setDescricao] = useState<string>(DESCRICOES_NFSE[0]);
  const [valor, setValor] = useState("");
  const [competencia, setCompetencia] = useState(hojeSp());
  const [informacoes, setInformacoes] = useState("");
  const [erro, setErro] = useState<{ msg: string; faltas?: string[] } | null>(null);

  function emitir() {
    setErro(null);
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    start(async () => {
      const r = await emitirNfseAction({ financeiraId, descricao, valor: v, competencia, informacoes });
      if (!r.ok) {
        setErro({ msg: r.error || "Não foi possível emitir.", faltas: r.faltas });
        return;
      }
      setAberto(false);
      setValor("");
      setInformacoes("");
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700"
      >
        🧾 Emitir NFS-e{homologacao ? " (teste)" : ""}
      </button>
    );
  }

  const campo = "mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-slate-900">Nova NFS-e de comissão</p>
      <label className="block">
        <span className="text-xs text-slate-500">Financeira (tomador)</span>
        <select value={financeiraId} onChange={(e) => setFinanceiraId(e.target.value)} className={campo}>
          <option value="">— escolha —</option>
          {financeiras.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.tomadorDocumento ? ` · ${fmtDoc(f.tomadorDocumento)}` : " · (falta o CNPJ)"}
            </option>
          ))}
        </select>
      </label>
      {financeira ? <Vinculo key={financeira.id} financeira={financeira} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="text-xs text-slate-500">Descrição do serviço</span>
          <input list="nfse-descricoes" value={descricao} onChange={(e) => setDescricao(e.target.value)} className={campo} />
          <datalist id="nfse-descricoes">
            {DESCRICOES_NFSE.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Valor informado pelo banco (R$)</span>
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} />
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Competência</span>
          <input type="date" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={campo} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-slate-500">Informações complementares (opcional)</span>
          <input value={informacoes} onChange={(e) => setInformacoes(e.target.value)} className={campo} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={emitir}
          disabled={pending || !financeira?.tomadorDocumento || !valor}
          className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Enviando…" : homologacao ? "Emitir nota de teste" : "Emitir NFS-e"}
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

/**
 * Cadastro fiscal da financeira: mostra a razão social/CNPJ ligados ou, na
 * primeira vez, pede o CNPJ (a razão social e o endereço vêm da Receita).
 */
function Vinculo({ financeira }: { financeira: FinanceiraOpcao }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editando, setEditando] = useState(!financeira.tomadorDocumento);
  const sugerido = tomadorPorNome(financeira.name);
  const [cnpj, setCnpj] = useState(sugerido?.cnpj ?? "");
  const [razao, setRazao] = useState("");
  const [pedeRazao, setPedeRazao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function vincular() {
    setErro(null);
    start(async () => {
      const r = await vincularFinanceiraAction(financeira.id, cnpj, razao || undefined);
      if (!r.ok) {
        setErro(r.error || "Não foi possível vincular.");
        if (/raz[aã]o social/i.test(r.error || "")) setPedeRazao(true);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  if (!editando && financeira.tomadorDocumento) {
    return (
      <p className="text-xs text-slate-600">
        Nota sai para <strong>{financeira.tomadorNome}</strong> · CNPJ {fmtDoc(financeira.tomadorDocumento)}{" "}
        <button type="button" onClick={() => setEditando(true)} className="ml-1 text-blue-700 hover:underline">
          trocar
        </button>
      </p>
    );
  }
  const campo = "mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <p>
        Informe o <strong>CNPJ de {financeira.name}</strong> (o que vai na nota). É só da primeira vez.
      </p>
      {sugerido ? (
        <p className="mt-1">
          Pelas notas que a loja já emitiu: <strong>{sugerido.nome}</strong> · CNPJ {sugerido.cnpj} — confira e clique
          em vincular.
        </p>
      ) : null}
      <label className="mt-2 block">
        <span className="text-[11px] text-amber-800">Bancos das notas já emitidas</span>
        <select
          value={TOMADORES_CONHECIDOS.some((t) => t.cnpj === cnpj) ? cnpj : ""}
          onChange={(e) => e.target.value && setCnpj(e.target.value)}
          className={campo}
        >
          <option value="">— outro (digite o CNPJ) —</option>
          {TOMADORES_CONHECIDOS.map((t) => (
            <option key={t.cnpj} value={t.cnpj}>
              {t.nome} · {t.cnpj}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-[11px] text-amber-800">CNPJ</span>
          <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" className={campo} />
        </label>
        {pedeRazao ? (
          <label className="block min-w-[260px] flex-1">
            <span className="text-[11px] text-amber-800">Razão social</span>
            <input value={razao} onChange={(e) => setRazao(e.target.value)} className={campo} />
          </label>
        ) : null}
        <button
          type="button"
          onClick={vincular}
          disabled={pending || cnpj.replace(/\D/g, "").length !== 14}
          className="h-9 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {pending ? "Buscando…" : "Buscar e vincular"}
        </button>
      </div>
      {erro ? <p className="mt-1 text-rose-700">{erro}</p> : null}
    </div>
  );
}

function Linha({ n, canCancelar, canEmitir }: { n: NotaServicoResumo; canCancelar: boolean; canEmitir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cancelando, setCancelando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const info = statusInfo[n.status] ?? { label: n.status, cls: "bg-slate-100 text-slate-700" };
  const base = `/financeiro/nfse/${n.id}`;

  function atualizar() {
    setErro(null);
    start(async () => {
      const r = await atualizarNfseAction(n.id);
      if (!r.ok) setErro(r.error || "Não foi possível consultar.");
      router.refresh();
    });
  }
  function cancelar() {
    setErro(null);
    start(async () => {
      const r = await cancelarNfseAction(n.id, justificativa);
      if (!r.ok) {
        setErro(r.error || "Não foi possível cancelar.");
        return;
      }
      setCancelando(false);
      router.refresh();
    });
  }

  const botao = "rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50";
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">
          NFS-e{n.numero ? ` nº ${n.numero}` : ""} · {n.tomadorNome}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${info.cls}`}>{info.label}</span>
        {n.ambiente !== "PRODUCAO" ? (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">teste</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {n.descricao} · <strong>{brl(n.valor)}</strong> · competência {dataBr(n.competencia)} · CNPJ{" "}
        {fmtDoc(n.tomadorDocumento)}
        {n.emitidaPor ? ` · por ${n.emitidaPor}` : ""}
      </p>
      {n.codigoVerificacao ? (
        <p className="mt-1 break-all font-mono text-[11px] text-slate-600">Verificação: {n.codigoVerificacao}</p>
      ) : null}
      {n.status === "ERRO" && n.mensagem ? <p className="mt-1 text-xs text-rose-700">{n.mensagem}</p> : null}
      {n.status === "CANCELADA" && n.justificativaCancelamento ? (
        <p className="mt-1 text-xs text-slate-500">Cancelada: {n.justificativaCancelamento}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {n.temDanfse && n.status !== "ERRO" ? (
          <a href={`${base}/danfse`} target="_blank" rel="noopener noreferrer" className={botao}>
            📄 DANFSe
          </a>
        ) : null}
        {n.temXml && n.status !== "ERRO" ? (
          <a href={`${base}/xml`} className={botao}>
            ⬇ XML
          </a>
        ) : null}
        {n.url ? (
          <a href={n.url} target="_blank" rel="noopener noreferrer" className={botao}>
            🔗 Portal nacional
          </a>
        ) : null}
        {n.status === "PROCESSANDO" && canEmitir ? (
          <button type="button" onClick={atualizar} disabled={pending} className={`${botao} disabled:opacity-50`}>
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
          <textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={2}
            placeholder="Justificativa (mínimo 15 caracteres) — ex.: valor informado errado pelo banco"
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
