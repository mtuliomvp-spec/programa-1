"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Badge, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { markPendingAction, payBatchAction, deletePayablesAction } from "./actions";
import CommissionPayButton from "./CommissionPayButton";

type Account = { id: string; name: string };

export type PayableRow = {
  id: string;
  orderNumber: number;
  description: string;
  categoryLabel: string;
  documentNumber: string | null;
  supplierName: string | null;
  vehicleLabel: string | null;
  dueDate: string; // ISO
  amount: number;
  effective: "PENDENTE" | "PAGO" | "ATRASADO";
  status: "PENDENTE" | "PAGO" | "ATRASADO";
  accountName: string | null;
  recurring: boolean;
  // Manual e não pago: pode editar/excluir direto por aqui.
  editable: boolean;
  // Tem anexo (NF/comprovante) no título ou na solicitação de origem.
  hasAttachment: boolean;
  // Comissão de vendedor vinculado a beneficiário: permite acertar o capital na baixa.
  commissionExcess: { beneficiaryName: string; free: number; capital: number } | null;
};

const statusTone = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const statusLabel = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;

export default function PayablesTable({
  rows,
  accounts,
  canPagar = true,
  canManage = false,
  cashboxDate = null,
}: {
  rows: PayableRow[];
  accounts: Account[];
  canPagar?: boolean;
  canManage?: boolean;
  cashboxDate?: string | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [reverting, startRevert] = useTransition();
  const [removing, startRemove] = useTransition();

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
      const res = await payBatchAction(ids, accountId);
      if (!res.ok) {
        setMsg(res.error || "Não foi possível pagar.");
        return;
      }
      setSelected(new Set());
    });
  }

  function remove() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Excluir ${ids.length} ${ids.length === 1 ? "título selecionado" : "títulos selecionados"}? Só valem os manuais e não pagos.`)) {
      return;
    }
    setMsg(null);
    startRemove(async () => {
      const res = await deletePayablesAction(ids);
      if (res.error) {
        setMsg(res.error);
        return;
      }
      setMsg(
        `${res.deleted} excluído(s)` +
          (res.skipped > 0 ? ` · ${res.skipped} ignorado(s) (pago ou de outra operação)` : ""),
      );
      setSelected(new Set());
    });
  }

  return (
    <>
      <Table>
        <Thead>
          <Tr>
            <Th className="w-8">
              {canPagar || canManage ? (
                <input
                  type="checkbox"
                  aria-label="Selecionar todas"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300"
                />
              ) : null}
            </Th>
            <Th>Nº</Th>
            <Th>Descrição</Th>
            <Th>Categoria</Th>
            <Th>Fornecedor</Th>
            <Th>Veículo</Th>
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
                  {selectable && (canPagar || canManage) ? (
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${p.description}`}
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap tabular-nums text-slate-500">
                  <Link
                    href={`/financeiro/a-pagar/${p.id}/ordem`}
                    className="font-medium text-blue-700 hover:underline"
                    title="Abrir ordem de pagamento"
                  >
                    {String(p.orderNumber).padStart(4, "0")}
                  </Link>
                </Td>
                <Td className="font-medium text-slate-900">
                  <Link
                    href={`/financeiro/a-pagar/${p.id}/ordem`}
                    className="text-blue-700 hover:underline"
                    title="Abrir ordem de pagamento"
                  >
                    {p.description}
                  </Link>
                  {p.recurring ? (
                    <span className="ml-1.5 text-xs text-slate-400" title="Gerada por recorrência">
                      🔁
                    </span>
                  ) : null}
                  {p.hasAttachment ? (
                    <span className="ml-1.5 text-xs text-slate-400" title="Tem anexo">
                      📎
                    </span>
                  ) : null}
                  {p.documentNumber ? (
                    <p className="mt-0.5 text-[11px] font-normal text-slate-400">Doc. {p.documentNumber}</p>
                  ) : null}
                </Td>
                <Td>{p.categoryLabel}</Td>
                <Td>{p.supplierName || "-"}</Td>
                <Td className="whitespace-nowrap text-slate-600">{p.vehicleLabel || "-"}</Td>
                <Td>{formatDate(p.dueDate)}</Td>
                <Td>{formatCurrency(p.amount)}</Td>
                <Td>
                  <Badge tone={statusTone[p.effective]}>{statusLabel[p.effective]}</Badge>
                  {p.accountName ? (
                    <p className="mt-0.5 text-[11px] text-slate-400">{p.accountName}</p>
                  ) : null}
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-3">
                    {p.editable && canManage ? (
                      <Link
                        href={`/financeiro/a-pagar/${p.id}/editar`}
                        className="text-sm font-medium text-blue-700 hover:underline"
                      >
                        Editar
                      </Link>
                    ) : null}
                    {p.status === "PAGO" && canPagar ? (
                      <button
                        type="button"
                        disabled={reverting}
                        onClick={() => startRevert(() => markPendingAction(p.id))}
                        className="text-sm font-medium text-slate-500 hover:underline disabled:opacity-50"
                      >
                        Reverter
                      </button>
                    ) : selectable && canPagar && p.commissionExcess && accounts.length > 0 ? (
                      <CommissionPayButton
                        payableId={p.id}
                        commissionAmount={p.amount}
                        accounts={accounts}
                        beneficiaryName={p.commissionExcess.beneficiaryName}
                        free={p.commissionExcess.free}
                        capital={p.commissionExcess.capital}
                        cashboxDate={cashboxDate}
                      />
                    ) : null}
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>

      {accounts.length === 0 && canPagar ? (
        <p className="px-5 py-3 text-sm text-amber-700">
          Cadastre uma conta financeira para poder pagar os títulos.{" "}
          <Link href="/financeiro/contas" className="font-medium text-blue-700 hover:underline">
            Criar conta
          </Link>
        </p>
      ) : null}

      {/* Barra de ações em lote — aparece ao selecionar títulos */}
      {selected.size > 0 ? (
        <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Selecionados</p>
              <p className="text-sm font-semibold text-slate-800">
                {selected.size} {selected.size === 1 ? "título" : "títulos"} ·{" "}
                <span className="text-rose-600">{formatCurrency(selectedTotal)}</span>
              </p>
            </div>
            {accounts.length > 0 ? (
              <>
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
                <div className="flex flex-col gap-1 text-xs text-slate-500">
                  Data do pagamento
                  <span className="flex h-9 items-center rounded-lg bg-slate-100 px-2 text-sm font-medium text-slate-700">
                    {cashboxDate ? `${cashboxDate} (caixa)` : "—"}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={pending || removing}
                  onClick={pay}
                  className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {pending
                    ? "Pagando..."
                    : selected.size === 1
                      ? "Pagar título"
                      : `Pagar ${selected.size} títulos`}
                </button>
              </>
            ) : null}
            {canManage ? (
              <button
                type="button"
                disabled={removing || pending}
                onClick={remove}
                className="h-9 rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                {removing ? "Excluindo..." : "Excluir selecionados"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="h-9 px-2 text-sm text-slate-400 hover:underline"
            >
              Limpar
            </button>
          </div>
          {msg ? <p className="mt-2 text-sm text-slate-600">{msg}</p> : null}
        </div>
      ) : null}
      {msg && selected.size === 0 ? <p className="px-5 py-2 text-sm text-slate-600">{msg}</p> : null}
    </>
  );
}
