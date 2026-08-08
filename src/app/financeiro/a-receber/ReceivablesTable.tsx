"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Badge, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { receiveBatchAction, deleteReceivablesAction } from "./actions";
import ReceivableRowActions from "./ReceivableRowActions";
import DeleteReceivableButton from "./DeleteReceivableButton";

type Account = { id: string; name: string };

export type ReceivableRow = {
  id: string;
  description: string;
  categoryLabel: string;
  customerName: string | null;
  dueDate: string; // ISO
  amount: number;
  status: "PENDENTE" | "RECEBIDO" | "ATRASADO";
  effective: "PENDENTE" | "RECEBIDO" | "ATRASADO";
  /** Manual e não recebido: pode editar/excluir por aqui. */
  editable: boolean;
  /** Motivo de não poder editar (mostrado como dica na linha). */
  originHint: string | null;
  /** Ligado a um carro: um desconto vira custo pós-venda dele. */
  hasVehicle: boolean;
};

const statusTone = { PENDENTE: "warning", RECEBIDO: "success", ATRASADO: "danger" } as const;
const statusLabel = { PENDENTE: "Pendente", RECEBIDO: "Recebido", ATRASADO: "Atrasado" } as const;

/**
 * Tabela de Contas a receber com seleção em lote, espelhando a de Contas a
 * pagar: marca vários títulos, escolhe a conta e recebe todos de uma vez (pelo
 * valor cheio, na data do caixa aberto). Recebimento parcial continua no botão
 * "Receber" da linha.
 */
export default function ReceivablesTable({
  rows,
  accounts,
  canReceber = true,
  canManage = false,
  canEdit,
  canDiscount = false,
  cashboxDate = null,
}: {
  rows: ReceivableRow[];
  accounts: Account[];
  canReceber?: boolean;
  canManage?: boolean;
  canEdit?: boolean;
  /** Pode quitar o título dando desconto na diferença. */
  canDiscount?: boolean;
  cashboxDate?: string | null;
}) {
  const showEdit = canEdit ?? canManage;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [removing, startRemove] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const openRows = rows.filter((r) => r.effective !== "RECEBIDO");
  const allSelected = openRows.length > 0 && openRows.every((r) => selected.has(r.id));
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
      if (openRows.every((r) => prev.has(r.id))) return new Set();
      return new Set(openRows.map((r) => r.id));
    });
  }

  function receive() {
    if (!accountId) {
      setMsg("Escolha a conta que vai receber.");
      return;
    }
    const ids = [...selected];
    setMsg(null);
    startTransition(async () => {
      const res = await receiveBatchAction(ids, accountId);
      if (!res.ok) {
        setMsg(res.error || "Não foi possível receber.");
        return;
      }
      setSelected(new Set());
    });
  }

  function remove() {
    const ids = [...selected];
    if (!ids.length) return;
    if (
      !confirm(
        `Excluir ${ids.length} ${ids.length === 1 ? "título selecionado" : "títulos selecionados"}? Só valem os manuais e não recebidos.`,
      )
    )
      return;
    setMsg(null);
    startRemove(async () => {
      const res = await deleteReceivablesAction(ids);
      if (res.error) {
        setMsg(res.error);
        return;
      }
      setMsg(
        `${res.deleted} excluído(s)` +
          (res.skipped > 0 ? ` · ${res.skipped} ignorado(s) (recebido ou de outra operação)` : ""),
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
              {canReceber || canManage ? (
                <input
                  type="checkbox"
                  aria-label="Selecionar todas"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300"
                />
              ) : null}
            </Th>
            <Th>Descrição</Th>
            <Th>Categoria</Th>
            <Th>Cliente</Th>
            <Th>Vencimento</Th>
            <Th>Valor</Th>
            <Th>Status</Th>
            <Th>{""}</Th>
          </Tr>
        </Thead>
        <tbody>
          {rows.map((r) => {
            const selectable = r.effective !== "RECEBIDO";
            return (
              <Tr key={r.id} className={selected.has(r.id) ? "bg-blue-50/60" : undefined}>
                <Td>
                  {selectable && (canReceber || canManage) ? (
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${r.description}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  ) : null}
                </Td>
                <Td className="font-medium text-slate-900">{r.description}</Td>
                <Td>{r.categoryLabel}</Td>
                <Td>{r.customerName || "-"}</Td>
                <Td className="whitespace-nowrap">{formatDate(r.dueDate)}</Td>
                <Td className="whitespace-nowrap">{formatCurrency(r.amount)}</Td>
                <Td>
                  <Badge tone={statusTone[r.effective]}>{statusLabel[r.effective]}</Badge>
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-3">
                    {showEdit && r.editable ? (
                      <Link
                        href={`/financeiro/a-receber/${r.id}/editar`}
                        className="text-sm font-medium text-blue-700 hover:underline"
                      >
                        Editar
                      </Link>
                    ) : null}
                    {showEdit && !r.editable && r.originHint ? (
                      <span className="cursor-help text-xs text-slate-400" title={r.originHint}>
                        ⓘ origem
                      </span>
                    ) : null}
                    <ReceivableRowActions
                      id={r.id}
                      status={r.status}
                      amount={r.amount}
                      accounts={accounts}
                      canReceber={canReceber}
                      canDiscount={canDiscount}
                      hasVehicle={r.hasVehicle}
                    />
                    {canManage && r.editable ? <DeleteReceivableButton id={r.id} /> : null}
                  </div>
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>

      {accounts.length === 0 && canReceber ? (
        <p className="px-5 py-3 text-sm text-amber-700">
          Cadastre uma conta financeira para poder receber os títulos.{" "}
          <Link href="/financeiro/contas" className="font-medium text-blue-700 hover:underline">
            Criar conta
          </Link>
        </p>
      ) : null}

      {selected.size > 0 ? (
        <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur print:hidden">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Selecionados</p>
              <p className="text-sm font-semibold text-slate-800">
                {selected.size} {selected.size === 1 ? "título" : "títulos"} ·{" "}
                <span className="text-emerald-600">{formatCurrency(selectedTotal)}</span>
              </p>
            </div>
            {canReceber && accounts.length > 0 ? (
              <>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Conta que vai receber
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
                  Data do recebimento
                  <span className="flex h-9 items-center rounded-lg bg-slate-100 px-2 text-sm font-medium text-slate-700">
                    {cashboxDate ? `${cashboxDate} (caixa)` : "—"}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={pending || removing}
                  onClick={receive}
                  className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {pending
                    ? "Recebendo..."
                    : selected.size === 1
                      ? "Receber título"
                      : `Receber ${selected.size} títulos`}
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
