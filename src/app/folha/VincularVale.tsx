"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { buscarTituloParaValeAction, vincularValeAction, type TituloParaVale } from "./actions";

/**
 * Liga um título que já existe no Contas a pagar (pelo nº da ordem de
 * pagamento) ao salário como vale — ex.: peças que o funcionário comprou em
 * nome da loja e a loja paga ao fornecedor.
 */
export default function VincularVale({ employeeId, competencia }: { employeeId: string; competencia: string }) {
  const [aberto, setAberto] = useState(false);
  const [numero, setNumero] = useState("");
  const [previa, setPrevia] = useState<TituloParaVale | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (msg?.ok) return <span className="max-w-xs text-right text-xs text-emerald-700">{msg.t}</span>;
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="text-xs text-slate-500 hover:text-blue-700 hover:underline">
        Vincular título como vale
      </button>
    );
  }
  return (
    <div className="flex w-64 flex-col items-end gap-1 text-right">
      <span className="text-xs text-slate-500">Nº da ordem de pagamento do título</span>
      <div className="flex items-center gap-1">
        <Input
          value={numero}
          onChange={(e) => {
            setNumero(e.target.value);
            setPrevia(null);
          }}
          inputMode="numeric"
          placeholder="1449"
          className="w-24 text-right"
          autoFocus
        />
        <Button
          type="button"
          variant="secondary"
          className="px-2.5 py-1.5"
          disabled={pending || !numero}
          onClick={() =>
            startTransition(async () => {
              setMsg(null);
              setPrevia(await buscarTituloParaValeAction(employeeId, competencia, numero));
            })
          }
        >
          Buscar
        </Button>
        <Button type="button" variant="secondary" className="px-2.5 py-1.5" onClick={() => setAberto(false)}>
          ✕
        </Button>
      </div>
      {previa && !previa.ok ? <span className="text-xs text-rose-600">{previa.erro}</span> : null}
      {previa?.ok ? (
        <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-left text-xs dark:border-slate-700 dark:bg-slate-800">
          <p className="font-medium text-slate-800 dark:text-slate-100">
            Nº {previa.orderNumber} · {formatCurrency(previa.valor)}
          </p>
          <p className="line-clamp-3 text-slate-600 dark:text-slate-300">{previa.descricao}</p>
          <p className="text-slate-500">
            {previa.fornecedor ? `${previa.fornecedor} · ` : ""}
            {previa.pago ? "pago" : `vence ${previa.vencimento}`}
          </p>
          <p className="mt-1 text-slate-500">
            Vai contar como vale do salário de {competencia} (vira despesa de Salário; valor, vencimento e fornecedor não
            mudam).
          </p>
          <Button
            type="button"
            className="mt-2 w-full px-2.5 py-1.5"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await vincularValeAction(employeeId, competencia, numero);
                setMsg(r.error ? { ok: false, t: r.error } : { ok: true, t: r.ok ?? "Vinculado." });
                if (!r.error) setTimeout(() => location.reload(), 1500);
              })
            }
          >
            {pending ? "Vinculando…" : "Vincular como vale"}
          </Button>
        </div>
      ) : null}
      {msg && !msg.ok ? <span className="text-xs text-rose-600">{msg.t}</span> : null}
    </div>
  );
}
