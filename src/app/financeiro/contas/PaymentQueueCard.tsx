"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, CardHeader, Select } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { confirmQueuedPaymentsAction, dismissQueuedPaymentAction } from "./actions";
import type { PagamentoNaFila } from "@/lib/payment-queue";

/**
 * Fila de espera do caixa: títulos cujo comprovante já chegou (o dinheiro saiu
 * do banco) e que esperavam o movimento alcançar o dia do pagamento. Agora que
 * o caixa daquele dia está aberto, eles aparecem PRÉ-LANÇADOS — um ok debita
 * de verdade. Nada é baixado sozinho.
 */
export default function PaymentQueueCard({
  rows,
  accounts,
  workDateLabel,
  canPagar,
}: {
  rows: PagamentoNaFila[];
  accounts: { id: string; name: string }[];
  workDateLabel: string;
  canPagar: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(rows.map((r) => r.id)));
  // Conta escolhida à mão para os pré-lançamentos cuja conta o comprovante não
  // identificou (banco diferente do cadastro, comprovante ilegível...).
  const [contas, setContas] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [dismissing, startDismiss] = useTransition();

  if (rows.length === 0) return null;

  const total = rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.amount, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmar() {
    const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
    if (!ids.length) return;
    setMsg(null);
    start(async () => {
      const res = await confirmQueuedPaymentsAction(ids, contas);
      if (!res.ok) {
        setMsg(res.error || "Não foi possível confirmar.");
        router.refresh();
        return;
      }
      setMsg(`${res.paid} pagamento(s) debitado(s) no caixa de ${workDateLabel}.`);
      router.refresh();
    });
  }

  function descartar(id: string) {
    if (!confirm("Tirar este pré-lançamento da fila? O comprovante continua anexado ao título.")) return;
    startDismiss(async () => {
      await dismissQueuedPaymentAction(id);
      router.refresh();
    });
  }

  return (
    <Card className="mb-4 border-2 border-amber-300">
      <CardHeader
        title={`⏳ ${rows.length} pagamento(s) esperando este caixa`}
        description={`O comprovante já chegou e o dinheiro saiu do banco. Confirme para debitar no caixa de ${workDateLabel}.`}
      />
      <div className="divide-y divide-slate-100">
        {rows.map((r) => {
          const semConta = !r.accountId && !contas[r.id];
          return (
            <div key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                className="mt-1 h-4 w-4 rounded border-slate-300"
                aria-label={`Selecionar ${r.description}`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  <Link href={r.href} className="text-blue-700 hover:underline">
                    {r.kind === "combo"
                      ? `🧺 ${r.description} · ${r.titulos} título${r.titulos === 1 ? "" : "s"}`
                      : `${String(r.orderNumber).padStart(4, "0")} · ${r.description}`}
                  </Link>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {r.supplierName ? `${r.supplierName} · ` : ""}
                  comprovante de {formatDate(r.paidAt)} ·{" "}
                  {r.kind === "combo" ? "mais antigo vencia em " : "vencia em "}
                  {formatDate(r.dueDate)}
                </p>
                {r.kind === "combo" ? (
                  <p className="mt-0.5 text-xs text-slate-500">
                    O ok baixa os {r.titulos} títulos do combo de uma vez.
                  </p>
                ) : null}
                {r.note ? (
                  <p className="mt-1 text-xs font-medium text-amber-700">⚠ {r.note}</p>
                ) : null}
                {semConta ? (
                  <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    Conta debitada
                    <Select
                      className="h-9 w-56"
                      value={contas[r.id] ?? ""}
                      onChange={(e) => setContas((p) => ({ ...p, [r.id]: e.target.value }))}
                    >
                      <option value="">Escolha a conta…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    Debita em <strong>{r.accountName ?? accounts.find((a) => a.id === contas[r.id])?.name}</strong>
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums text-rose-600">{formatCurrency(r.amount)}</p>
                {Math.abs(r.amount - r.tituloAmount) > 0.005 ? (
                  <p className="text-[11px] text-slate-400">
                    {r.kind === "combo" ? "combo" : "título"} {formatCurrency(r.tituloAmount)}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => descartar(r.id)}
                  disabled={dismissing}
                  className="mt-1 text-[11px] font-medium text-slate-400 hover:text-rose-600 hover:underline"
                >
                  tirar da fila
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
        <p className="text-sm text-slate-600">
          {selected.size} selecionado(s) ·{" "}
          <strong className="tabular-nums text-rose-600">{formatCurrency(total)}</strong>
        </p>
        {canPagar ? (
          <Button type="button" onClick={confirmar} disabled={pending || selected.size === 0}>
            {pending ? "Debitando…" : `✓ Confirmar e debitar (${formatCurrency(total)})`}
          </Button>
        ) : (
          <Badge tone="warning">Sem permissão para pagar</Badge>
        )}
      </div>
      {msg ? <p className="px-5 pb-3 text-sm font-medium text-slate-700">{msg}</p> : null}
    </Card>
  );
}
