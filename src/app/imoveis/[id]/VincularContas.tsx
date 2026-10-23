"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { buscarContasParaVincularAction, vincularContasImovelAction, type ContaParaVincular } from "../actions";

/**
 * Liga ao imóvel contas que já existem — recorrências (com os títulos que já
 * geraram) e títulos avulsos, inclusive pagos. É só a etiqueta "conta deste
 * imóvel": valor, data, fluxo e caixa não mudam.
 */
export default function VincularContas({ imovelId }: { imovelId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [rec, setRec] = useState<ContaParaVincular[]>([]);
  const [tit, setTit] = useState<ContaParaVincular[]>([]);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  async function buscar() {
    setMsg(null);
    setBuscando(true);
    const r = await buscarContasParaVincularAction(busca);
    setBuscando(false);
    if (!r.ok) return setMsg(r.error || "Não foi possível buscar.");
    setRec(r.recorrencias ?? []);
    setTit(r.titulos ?? []);
    setMarcados(new Set());
    if (!r.recorrencias?.length && !r.titulos?.length) setMsg("Nada encontrado sem imóvel com esse texto.");
  }

  async function vincular() {
    const ids = [...marcados];
    setSalvando(true);
    const r = await vincularContasImovelAction({
      imovelId,
      recorrencias: ids.filter((i) => i.startsWith("r:")).map((i) => i.slice(2)),
      titulos: ids.filter((i) => i.startsWith("t:")).map((i) => i.slice(2)),
    });
    setSalvando(false);
    if (!r.ok) return setMsg(r.error || "Não foi possível vincular.");
    setMsg(`✓ ${r.vinculados} conta(s) ligada(s) ao imóvel.`);
    setRec([]);
    setTit([]);
    setMarcados(new Set());
    router.refresh();
  }

  const alternar = (k: string) =>
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const lista = (titulo: string, prefixo: string, itens: ContaParaVincular[]) =>
    itens.length ? (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
        <ul className="mt-1 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {itens.map((c) => {
            const k = `${prefixo}${c.id}`;
            return (
              <li key={k}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={marcados.has(k)} onChange={() => alternar(k)} className="mt-1" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-800">{c.descricao}</span>
                    <span className="block text-xs text-slate-500">{c.detalhe}</span>
                  </span>
                  <span className="tabular-nums text-slate-900">{formatCurrency(c.valor)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-sm font-medium text-blue-700 hover:underline">
        🔗 Vincular contas que já existem (recorrentes ou avulsas, pagas ou não)
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <p className="text-sm font-semibold text-slate-800">🔗 Vincular contas que já existem</p>
      <p className="text-xs text-slate-600">
        Procure pela descrição ou pelo fornecedor (ex.: &quot;Manoel&quot;, &quot;pedreira&quot;). Recorrência
        vinculada leva junto os títulos que já gerou e os próximos. Não muda valor, data, fluxo nem caixa.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              buscar();
            }
          }}
          placeholder="Descrição ou fornecedor"
          className="max-w-xs"
        />
        <Button type="button" variant="secondary" onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando…" : "Buscar"}
        </Button>
        <button type="button" onClick={() => setAberto(false)} className="text-sm text-slate-500 hover:underline">
          Fechar
        </button>
      </div>
      {lista("Contas recorrentes", "r:", rec)}
      {lista("Títulos", "t:", tit)}
      {rec.length || tit.length ? (
        <Button type="button" onClick={vincular} disabled={salvando || marcados.size === 0}>
          {salvando ? "Vinculando…" : `Vincular ${marcados.size || ""} selecionada(s)`}
        </Button>
      ) : null}
      {msg ? <p className="text-sm text-slate-700">{msg}</p> : null}
    </div>
  );
}
