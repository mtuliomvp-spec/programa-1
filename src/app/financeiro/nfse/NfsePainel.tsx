"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DESCRICOES_NFSE } from "@/lib/nfse";
import { TOMADORES_CONHECIDOS, tomadorPorNome, tomadorSeguroDe } from "@/lib/tomadores-nfse";
import {
  atualizarNfseAction,
  cadastrarFinanceiraAction,
  cancelarNfseAction,
  emitirNfseAction,
  registrarNotaExternaAction,
  removerNotaExternaAction,
  vincularFinanceiraAction,
  vincularRetornosAction,
} from "./actions";

export type FinanceiraOpcao = {
  id: string;
  name: string;
  /** Cadastro fiscal ligado (razão social / CNPJ); null = ainda pedir o CNPJ. */
  tomadorNome: string | null;
  tomadorDocumento: string | null;
  /** Tomador da nota do seguro, quando é outra empresa (corretora do grupo). */
  seguroNome: string | null;
  seguroDocumento: string | null;
};

/** Banco das notas já emitidas que ainda não está em Contas e caixas. */
export type BancoSemConta = { cnpj: string; nome: string; conta: string };

type Tipo = "RETORNO" | "SEGURO";

/** Retorno de uma venda financiada que uma nota de comissão pode cobrir. */
export type RetornoOpcao = {
  /** Id da venda. */
  id: string;
  /** Comissão sobre o retorno ou sobre o seguro. */
  tipo: Tipo;
  financeiraId: string;
  data: string;
  cliente: string;
  veiculo: string;
  /** Pago pela financeira (recebido) ou o programado. */
  valor: number;
  recebidoEm: string | null;
  /** Nota que já cobre este retorno. */
  notaId: string | null;
};

export type NotaServicoResumo = {
  id: string;
  tipo: Tipo;
  financeiraId: string | null;
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
  retornos,
  bancosSemConta,
  canEmitir,
  canCancelar,
  homologacao,
}: {
  notas: NotaServicoResumo[];
  financeiras: FinanceiraOpcao[];
  retornos: RetornoOpcao[];
  bancosSemConta: BancoSemConta[];
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
      {canEmitir && bancosSemConta.length ? <BancosSemConta bancos={bancosSemConta} /> : null}
      {canEmitir ? <Emitir financeiras={financeiras} retornos={retornos} homologacao={homologacao} /> : null}
      {notas.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {notas.map((n) => (
            <Linha key={n.id} n={n} retornos={retornos} canCancelar={canCancelar} canEmitir={canEmitir} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nenhuma NFS-e emitida pelo sistema ainda.</p>
      )}
    </div>
  );
}

/** Cadastra em Contas e caixas, com um clique, o banco que só existia nas notas antigas. */
function BancosSemConta({ bancos }: { bancos: BancoSemConta[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  function cadastrar(cnpj: string) {
    setErro(null);
    start(async () => {
      const r = await cadastrarFinanceiraAction(cnpj);
      if (!r.ok) setErro(r.error || "Não foi possível cadastrar.");
      router.refresh();
    });
  }
  return (
    <details className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900">
      <summary className="cursor-pointer font-semibold">
        {bancos.length} banco(s) das notas anteriores ainda não estão em Contas e caixas
      </summary>
      <ul className="mt-2 space-y-1">
        {bancos.map((b) => (
          <li key={b.cnpj} className="flex flex-wrap items-center gap-2">
            <span>
              {b.nome} · CNPJ {b.cnpj}
            </span>
            <button
              type="button"
              onClick={() => cadastrar(b.cnpj)}
              disabled={pending}
              className="rounded-lg border border-blue-300 bg-white px-2 py-0.5 font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
            >
              ＋ Cadastrar como “{b.conta}”
            </button>
          </li>
        ))}
      </ul>
      {erro ? <p className="mt-1 text-rose-700">{erro}</p> : null}
    </details>
  );
}

/**
 * Nota × o que entrou dos retornos marcados. O banco costuma reter imposto
 * (IR 1,5%) sobre a comissão: paga o líquido e a nota sai pelo bruto — então
 * a nota maior que o recebido é normal. Só explica; não bloqueia nada.
 */
function DiferencaNota({ nota, recebido }: { nota: number; recebido: number }) {
  const dif = Math.round((nota - recebido) * 100) / 100;
  if (!(nota > 0) || !(recebido > 0) || Math.abs(dif) < 0.01) return null;
  const pct = (dif / nota) * 100;
  const retencao = dif > 0 && pct < 20;
  return (
    <span className={retencao ? "text-slate-500" : "text-amber-700"}>
      {retencao
        ? `nota ${brl(dif)} acima do recebido (${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% — imposto retido pelo banco; a nota sai pelo bruto)`
        : `nota ${brl(Math.abs(dif))} ${dif > 0 ? "acima" : "abaixo"} do recebido (${brl(recebido)}) — confira o valor informado pelo banco`}
    </span>
  );
}

const valorBr = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Lista de retornos da financeira para marcar os que a nota cobre — os já
 * recebidos primeiro. A soma aparece embaixo (e vira o valor da nota ao emitir).
 */
function EscolherRetornos({
  opcoes,
  marcados,
  onChange,
}: {
  opcoes: RetornoOpcao[];
  marcados: string[];
  onChange: (ids: string[]) => void;
}) {
  const [todos, setTodos] = useState(false);
  if (!opcoes.length) {
    return <p className="text-xs text-slate-500">Nada sem NF desta financeira.</p>;
  }
  const ordenados = [...opcoes].sort(
    (a, b) => Number(!a.recebidoEm) - Number(!b.recebidoEm) || b.data.localeCompare(a.data),
  );
  const visiveis = todos ? ordenados : ordenados.slice(0, 12);
  const soma = opcoes.filter((o) => marcados.includes(o.id)).reduce((s, o) => s + o.valor, 0);
  const alternar = (id: string) => onChange(marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id]);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
        {visiveis.map((o) => (
          <li key={o.id}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50">
              <input type="checkbox" checked={marcados.includes(o.id)} onChange={() => alternar(o.id)} />
              <span className="w-12 shrink-0 tabular-nums text-slate-500">{dataBr(o.data).slice(0, 5)}</span>
              <span className="min-w-0 flex-1 truncate">
                <strong className="text-slate-800">{o.cliente}</strong> · {o.veiculo}
              </span>
              <span className={o.recebidoEm ? "text-emerald-700" : "text-amber-700"}>
                {o.recebidoEm ? `recebido ${dataBr(o.recebidoEm).slice(0, 5)}` : "a receber"}
              </span>
              <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{brl(o.valor)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 text-xs">
        {ordenados.length > visiveis.length ? (
          <button type="button" onClick={() => setTodos(true)} className="text-blue-700 hover:underline">
            mostrar todos ({ordenados.length})
          </button>
        ) : (
          <span />
        )}
        <span className="text-slate-600">
          {marcados.length} marcado(s) · soma <strong className="tabular-nums">{brl(soma)}</strong>
        </span>
      </div>
    </div>
  );
}

function Emitir({
  financeiras,
  retornos,
  homologacao,
}: {
  financeiras: FinanceiraOpcao[];
  retornos: RetornoOpcao[];
  homologacao: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [financeiraId, setFinanceiraId] = useState("");
  const financeira = financeiras.find((f) => f.id === financeiraId) ?? null;
  const [tipo, setTipo] = useState<Tipo>("RETORNO");
  const [descricao, setDescricao] = useState<string>(DESCRICOES_NFSE.RETORNO[0]);
  const [outraDescricao, setOutraDescricao] = useState(false);
  const [valor, setValor] = useState("");
  const [competencia, setCompetencia] = useState(hojeSp());
  const [informacoes, setInformacoes] = useState("");
  const [marcados, setMarcados] = useState<string[]>([]);
  const [erro, setErro] = useState<{ msg: string; faltas?: string[] } | null>(null);
  // Nota que já foi emitida fora do sistema: só registra (número + retornos).
  const [externa, setExterna] = useState(false);
  const [numero, setNumero] = useState("");
  const [chave, setChave] = useState("");
  const livres = retornos.filter((r) => r.financeiraId === financeiraId && r.tipo === tipo && !r.notaId);

  function mudarTipo(t: Tipo) {
    if (t === tipo) return;
    setTipo(t);
    setDescricao(DESCRICOES_NFSE[t][0]);
    setOutraDescricao(false);
    setMarcados([]);
  }

  function marcar(ids: string[]) {
    setMarcados(ids);
    const soma = livres.filter((o) => ids.includes(o.id)).reduce((s, o) => s + o.valor, 0);
    if (ids.length) setValor(valorBr(soma));
  }

  function registrar() {
    setErro(null);
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    start(async () => {
      const r = await registrarNotaExternaAction({
        financeiraId,
        tipo,
        numero,
        descricao,
        valor: v,
        competencia,
        saleIds: marcados,
        chave,
      });
      if (!r.ok) {
        setErro({ msg: r.error || "Não foi possível registrar." });
        return;
      }
      setAberto(false);
      setValor("");
      setNumero("");
      setChave("");
      setExterna(false);
      setMarcados([]);
      router.refresh();
    });
  }

  function emitir() {
    setErro(null);
    const v = Number(valor.replace(/\./g, "").replace(",", "."));
    start(async () => {
      const r = await emitirNfseAction({ financeiraId, descricao, valor: v, competencia, informacoes, saleIds: marcados, tipo });
      if (!r.ok) {
        setErro({ msg: r.error || "Não foi possível emitir.", faltas: r.faltas });
        return;
      }
      setAberto(false);
      setValor("");
      setInformacoes("");
      setMarcados([]);
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
        <select
          value={financeiraId}
          onChange={(e) => {
            setFinanceiraId(e.target.value);
            setMarcados([]);
          }}
          className={campo}
        >
          <option value="">— escolha —</option>
          {financeiras.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.tomadorDocumento ? ` · ${fmtDoc(f.tomadorDocumento)}` : " · (falta o CNPJ)"}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className="text-xs text-slate-500">Tipo da nota</span>
        <div className="mt-0.5 grid grid-cols-2 gap-2">
          {(
            [
              ["RETORNO", "💰 Comissão do retorno", "retorno do financiamento"],
              ["SEGURO", "🛡️ Comissão do seguro", "seguro vendido com o financiamento"],
            ] as const
          ).map(([t, titulo, sub]) => (
            <button
              key={t}
              type="button"
              onClick={() => mudarTipo(t)}
              aria-pressed={tipo === t}
              className={`rounded-lg border px-3 py-2 text-left ${
                tipo === t
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span className="block text-sm font-semibold">{titulo}</span>
              <span className={`block text-[11px] ${tipo === t ? "text-slate-300" : "text-slate-500"}`}>{sub}</span>
            </button>
          ))}
        </div>
      </div>
      {financeira ? <Vinculo key={`${financeira.id}-${tipo}`} financeira={financeira} papel={tipo} /> : null}
      {financeira ? (
        <div>
          <span className="text-xs text-slate-500">
            {tipo === "SEGURO" ? "Seguros" : "Retornos"} que esta nota cobre{" "}
            <span className="text-slate-400">(marque — a soma vira o valor da nota)</span>
          </span>
          <div className="mt-0.5">
            <EscolherRetornos opcoes={livres} marcados={marcados} onChange={marcar} />
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="text-xs text-slate-500">Descrição do serviço</span>
          <select
            value={outraDescricao ? "" : descricao}
            onChange={(e) => {
              setOutraDescricao(!e.target.value);
              setDescricao(e.target.value);
            }}
            className={campo}
          >
            {DESCRICOES_NFSE[tipo].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value="">Outra (digitar)…</option>
          </select>
          {outraDescricao ? (
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value.toUpperCase())}
              placeholder="Descrição do serviço"
              className={campo}
              autoFocus
            />
          ) : null}
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Valor informado pelo banco (R$)</span>
          <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className={campo} />
          {marcados.length ? (
            <span className="mt-0.5 block text-[11px] leading-snug">
              <DiferencaNota
                nota={Number(valor.replace(/\./g, "").replace(",", ".")) || 0}
                recebido={livres.filter((o) => marcados.includes(o.id)).reduce((s, o) => s + o.valor, 0)}
              />
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="text-xs text-slate-500">Competência</span>
          <input type="date" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={campo} />
        </label>
        {externa ? (
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <label className="block">
              <span className="text-xs text-slate-500">Número da nota</span>
              <input value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="numeric" placeholder="ex.: 10" className={campo} />
            </label>
            <label className="col-span-2 block">
              <span className="text-xs text-slate-500">Chave de acesso (opcional, 50 números)</span>
              <input value={chave} onChange={(e) => setChave(e.target.value)} inputMode="numeric" className={campo} />
            </label>
          </div>
        ) : (
          <label className="block sm:col-span-2">
            <span className="text-xs text-slate-500">Informações complementares (opcional)</span>
            <input value={informacoes} onChange={(e) => setInformacoes(e.target.value)} className={campo} />
          </label>
        )}
      </div>
      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
        <input type="checkbox" checked={externa} onChange={(e) => setExterna(e.target.checked)} className="mt-0.5" />
        <span>
          <strong>Esta nota já foi emitida fora do sistema</strong> (portal da prefeitura/nacional) — só registrar o
          número e os {tipo === "SEGURO" ? "seguros" : "retornos"} que ela cobriu, sem emitir de novo.
        </span>
      </label>
      <div className="flex items-center gap-3">
        {externa ? (
          <button
            type="button"
            onClick={registrar}
            disabled={pending || !financeira || !valor || !numero.trim() || !marcados.length}
            className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Registrando…" : "Registrar nota já emitida"}
          </button>
        ) : (
          <button
            type="button"
            onClick={emitir}
            disabled={pending || !financeira?.tomadorDocumento || !valor}
            className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Enviando…" : homologacao ? "Emitir nota de teste" : "Emitir NFS-e"}
          </button>
        )}
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
function Vinculo({ financeira, papel }: { financeira: FinanceiraOpcao; papel: Tipo }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const seguro = papel === "SEGURO";
  // Nota do seguro sem tomador próprio: sai para o próprio banco.
  const nome = (seguro ? financeira.seguroNome : null) ?? financeira.tomadorNome;
  const documento = (seguro ? financeira.seguroDocumento : null) ?? financeira.tomadorDocumento;
  const [editando, setEditando] = useState(!documento);
  const banco = tomadorPorNome(financeira.name);
  const sugerido = seguro ? (tomadorSeguroDe(banco) ?? banco) : banco;
  const [cnpj, setCnpj] = useState(sugerido?.cnpj ?? "");
  const [razao, setRazao] = useState("");
  const [pedeRazao, setPedeRazao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function vincular() {
    setErro(null);
    start(async () => {
      const r = await vincularFinanceiraAction(financeira.id, cnpj, razao || undefined, papel);
      if (!r.ok) {
        setErro(r.error || "Não foi possível vincular.");
        if (/raz[aã]o social/i.test(r.error || "")) setPedeRazao(true);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  if (!editando && documento) {
    return (
      <p className="text-xs text-slate-600">
        {seguro ? "Nota do seguro" : "Nota"} sai para <strong>{nome}</strong> · CNPJ {fmtDoc(documento)}{" "}
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
        {seguro ? (
          <>
            Informe o <strong>CNPJ que recebe a nota do seguro</strong> de {financeira.name} (ex.: a corretora do
            grupo).
          </>
        ) : (
          <>
            Informe o <strong>CNPJ de {financeira.name}</strong> (o que vai na nota). É só da primeira vez.
          </>
        )}
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

function Linha({
  n,
  retornos,
  canCancelar,
  canEmitir,
}: {
  n: NotaServicoResumo;
  retornos: RetornoOpcao[];
  canCancelar: boolean;
  canEmitir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cancelando, setCancelando] = useState(false);
  const cobertos = retornos.filter((r) => r.notaId === n.id && r.tipo === n.tipo);
  const somaCobertos = cobertos.reduce((s, r) => s + r.valor, 0);
  const [vinculando, setVinculando] = useState(false);
  const [marcados, setMarcados] = useState<string[]>([]);
  const ativa = n.status === "AUTORIZADA" || n.status === "PROCESSANDO";
  const opcoes = retornos.filter(
    (r) => r.tipo === n.tipo && r.financeiraId === n.financeiraId && (!r.notaId || r.notaId === n.id),
  );
  const oQue = n.tipo === "SEGURO" ? "seguros" : "retornos";

  function salvarRetornos() {
    setErro(null);
    start(async () => {
      const r = await vincularRetornosAction(n.id, marcados);
      if (!r.ok) {
        setErro(r.error || "Não foi possível vincular.");
        return;
      }
      setVinculando(false);
      router.refresh();
    });
  }
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
        {n.ambiente === "EXTERNA" ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            emitida fora do sistema
          </span>
        ) : n.ambiente !== "PRODUCAO" ? (
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
      {cobertos.length ? (
        <div className="mt-1 text-xs text-slate-600">
          <span className="font-medium">{n.tipo === "SEGURO" ? "Seguros" : "Retornos"} cobertos:</span>{" "}
          {cobertos.map((r, i) => (
            <span key={r.id}>
              {i ? " · " : ""}
              {dataBr(r.data).slice(0, 5)} {r.cliente} ({r.veiculo}) {brl(r.valor)}
            </span>
          ))}
          {Math.abs(somaCobertos - n.valor) > 0.005 ? (
            <span className="ml-1">
              — recebido {brl(somaCobertos)}; <DiferencaNota nota={n.valor} recebido={somaCobertos} />
            </span>
          ) : null}
        </div>
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
        {ativa && canEmitir && n.financeiraId && !vinculando ? (
          <button
            type="button"
            onClick={() => {
              setMarcados(cobertos.map((r) => r.id));
              setVinculando(true);
            }}
            className={botao}
          >
            🔗 {cobertos.length ? `Alterar ${oQue}` : `Vincular ${oQue}`}
          </button>
        ) : null}
        {n.ambiente === "EXTERNA" && canEmitir ? (
          <button
            type="button"
            onClick={() => {
              if (!confirm("Remover o registro desta nota? Os retornos voltam a ficar sem NF (a nota em si não muda).")) return;
              start(async () => {
                const r = await removerNotaExternaAction(n.id);
                if (!r.ok) setErro(r.error || "Não foi possível remover.");
                router.refresh();
              });
            }}
            disabled={pending}
            className="text-xs font-medium text-rose-700 hover:underline disabled:opacity-50"
          >
            Remover registro
          </button>
        ) : n.status === "AUTORIZADA" && canCancelar && !cancelando ? (
          <button type="button" onClick={() => setCancelando(true)} className="text-xs font-medium text-rose-700 hover:underline">
            Cancelar nota
          </button>
        ) : null}
      </div>
      {vinculando ? (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">
            Marque os {oQue} que esta nota cobre (valor da nota: <strong>{brl(n.valor)}</strong>).
          </p>
          <EscolherRetornos opcoes={opcoes} marcados={marcados} onChange={setMarcados} />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={salvarRetornos}
              disabled={pending}
              className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {pending ? "Salvando…" : "Salvar vínculo"}
            </button>
            <button type="button" onClick={() => setVinculando(false)} className="text-xs text-slate-500 hover:underline">
              Voltar
            </button>
          </div>
        </div>
      ) : null}
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
