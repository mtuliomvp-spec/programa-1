"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import MoneyInput from "@/components/MoneyInput";
import { createCostRefundAction, cancelCostRefundAction } from "../actions";

type Refund = {
  id: string;
  description: string;
  amount: number;
  status: "PENDENTE" | "RECEBIDO" | "ATRASADO";
  dueDate: string;
  receivedDate: string | null;
};

/**
 * REEMBOLSO DE CUSTO: um gasto que a loja pagou pelo carro e o cliente vai
 * devolver (ex.: vistoria cautelar). Vira um título a receber; o custo do carro
 * só diminui quando o dinheiro entra (o recebimento cria o custo negativo).
 */
export default function VehicleCostRefund({
  vehicleId,
  costs,
  refunds,
  canManage,
}: {
  vehicleId: string;
  /** Custos lançados (positivos), para escolher o que está sendo reembolsado. */
  costs: { id: string; description: string; amount: number }[];
  refunds: Refund[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [costId, setCostId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState(0);
  const [valorKey, setValorKey] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function escolher(id: string) {
    setCostId(id);
    const c = costs.find((x) => x.id === id);
    if (c) {
      setDescricao(c.description);
      setValor(c.amount);
      setValorKey((k) => k + 1);
    }
  }

  function salvar() {
    setErro(null);
    start(async () => {
      const r = await createCostRefundAction({ vehicleId, costId: costId || null, descricao, valor });
      if (!r.ok) {
        setErro(r.error || "Não foi possível lançar.");
        return;
      }
      setAberto(false);
      setCostId("");
      setDescricao("");
      setValor(0);
      router.refresh();
    });
  }

  function cancelar(id: string) {
    setErro(null);
    start(async () => {
      const r = await cancelCostRefundAction(id, vehicleId);
      if (!r.ok) setErro(r.error || "Não foi possível cancelar.");
      router.refresh();
    });
  }

  if (!canManage && refunds.length === 0) return null;

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      {refunds.length > 0 ? (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reembolsos de custo</p>
          <ul className="mt-1 divide-y divide-slate-100 text-sm">
            {refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 text-slate-700">↩︎ {r.description}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-emerald-700">{formatCurrency(r.amount)}</span>
                  {r.status === "RECEBIDO" ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                      recebido {r.receivedDate ? formatDate(r.receivedDate) : ""} · custo reduzido
                    </span>
                  ) : (
                    <>
                      <Link
                        href="/financeiro/a-receber"
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:underline"
                        title="Quando o cliente pagar, dê a baixa em Contas a receber (Já caiu / Receber)"
                      >
                        a receber · vence {formatDate(r.dueDate)}
                      </Link>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => cancelar(r.id)}
                          disabled={pending}
                          className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline disabled:opacity-50"
                        >
                          cancelar
                        </button>
                      ) : null}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManage ? (
        aberto ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm">
            <p className="font-semibold text-slate-900">Reembolso de custo (o cliente devolve)</p>
            <p className="mt-0.5 text-xs text-slate-600">
              Vira um título a receber. O custo do carro só diminui quando o dinheiro entrar — dê a baixa em
              Contas a receber (Já caiu / Receber).
            </p>
            {costs.length > 0 ? (
              <label className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
                Custo que será reembolsado
                <select
                  value={costId}
                  onChange={(e) => escolher(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
                >
                  <option value="">Outro (descrever abaixo)</option>
                  {costs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.description} · {formatCurrency(c.amount)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
              Descrição
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Vistoria cautelar"
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              />
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
              Valor a receber do cliente
              <span className="w-44">
                <MoneyInput key={valorKey} name="valorReembolso" defaultValue={valor || undefined} onValueChange={setValor} />
              </span>
            </label>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={salvar}
                disabled={pending || !(valor > 0) || !descricao.trim()}
                className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {pending ? "Lançando…" : "Lançar a receber"}
              </button>
              <button type="button" onClick={() => setAberto(false)} className="text-xs text-slate-500 hover:underline">
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            ↩︎ Reembolso de custo (o cliente devolve um gasto)
          </button>
        )
      ) : null}
      {erro ? <p className="mt-2 text-xs text-rose-600">{erro}</p> : null}
    </div>
  );
}
