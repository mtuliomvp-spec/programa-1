"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Badge, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { markPendingAction, payBatchAction } from "./actions";

type Account = { id: string; name: string };

export type PayableRow = {
  id: string;
  description: string;
  categoryLabel: string;
  supplierName: string | null;
  dueDate: string; // ISO
  amount: number;
  effective: "PENDENTE" | "PAGO" | "ATRASADO";
  status: "PENDENTE" | "PAGO" | "ATRASADO";
  accountName: string | null;
  recurring: boolean;
};

const statusTone = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const statusLabel = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;

export default function PayablesTable({
  rows,
  accounts,
}: {
  rows: PayableRow[];
  accounts: Account[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [payDate, setPayDate] = useState(toDateInputValue(new Date()));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [reverting, startRevert] = useTransition();

  const payableRows = rows.filter((r) => r.effective !== "PAGO");
  const allSelected = payableRows.length > 0 && payableRows.every((r) => selected.has(r.id));

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const selectedTotal = selectedRows.reduce((s, r) => s + r.amount, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (payableRows.every((r) => prev.has(r.id))) return new Set();
      return new Set(payableRows.map((r) => r.id));
    });
  }

  function pay() {
    if (!accountId) {
      setMsg("Escolha a conta que fará o pagamento.");
      return;
    }
    const ids = [...selected];
    setMsg(null);
    startTransition(async () => {
      const res = await payBatchAction(ids, accountId, payDate);
      if (!res.ok) {
        setMsg(res.error || "Não foi possível pagar.");
        return;
      }
      setSelected(new Set());
    });
  }

  return (
    <>
      <Table>
        <Thead>
          <Tr>
            <Th className="w-8">
              <input
                type="checkbox"
                aria-label="Selecionar todas"
                checked={allSelected}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-slate-300"
              />
            </Th>
            <Th>Descrição</Th>
            <Th>Categoria</Th>
            <Th>Fornecedor</Th>
            <Th>Vencimento</Th>
            <Th>Valor</Th>
            <Th>Status</Th>
            <Th />
          </Tr>
        </Thead>
        <tbody>
          {rows.map((p) => {
            const selectable = p.effective !== "PAGO";
            return (
              <Tr key={p.id} className={selected.has(p.id) ? "bg-blue-50/60" : undefined}>
                <Td>
                  {selectable ? (
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${p.description}`}
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  ) : null}
                </Td>
                <Td className="font-medium text-slate-900">
                  {p.description}
                  {p.recurring ? (
                    <span className="ml-1.5 text-xs text-slate-400" title="Gerada por recorrência">
                      🔁
                    </span>
                  ) : null}
                </Td>
                <Td>{p.categoryLabel}</Td>
                <Td>{p.supplierName || "-"}</Td>
                <Td>{formatDate(p.dueDate)}</Td>
                <Td>{formatCurrency(p.amount)}</Td>
                <Td>
                  <Badge tone={statusTone[p.effective]}>{statusLabel[p.effective]}</Badge>
                  {p.accountName ? (
                    <p className="mt-0.5 text-[11px] text-slate-400">{p.accountName}</p>
                  ) : null}
                </Td>
                <Td>
                  {p.status === "PAGO" ? (
                    <button
                      type="button"
                      disabled={reverting}
                      onClick={() => startRevert(() => markPendingAction(p.id))}
                      className="text-sm font-medium text-slate-500 hover:underline disabled:opacity-50"
                    >
                      Reverter
                    </button>
                  ) : null}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>

      {accounts.length === 0 ? (
        <p className="px-5 py-3 text-sm text-amber-700">
          Cadastre uma conta financeira para poder pagar os títulos.{" "}
          <Link href="/financeiro/contas" className="font-medium text-blue-700 hover:underline">
            Criar conta
          </Link>
        </p>
      ) : null}

      {/* Barra de pagamento em lote — aparece ao selecionar títulos */}
      {selected.size > 0 && accounts.length > 0 ? (
        <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Selecionados</p>
              <p className="text-sm font-semibold text-slate-800">
                {selected.size} {selected.size === 1 ? "título" : "títulos"} ·{" "}
                <span className="text-rose-600">{formatCurrency(selectedTotal)}</span>
              </p>
            </div>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Conta que vai pagar
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Data do pagamento
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={pay}
              className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {pending
                ? "Pagando..."
                : selected.size === 1
                  ? "Pagar título"
                  : `Pagar ${selected.size} títulos`}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="h-9 px-2 text-sm text-slate-400 hover:underline"
            >
              Limpar
            </button>
          </div>
          {msg ? <p className="mt-2 text-sm text-rose-600">{msg}</p> : null}
        </div>
      ) : null}
      {msg && selected.size === 0 ? <p className="px-5 py-2 text-sm text-rose-600">{msg}</p> : null}
    </>
  );
}
