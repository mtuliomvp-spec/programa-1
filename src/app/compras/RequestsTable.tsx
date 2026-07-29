"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Table, Td, Th, Thead, Tr } from "@/components/ui";
import {
  batchApproveRequestsAction,
  batchRejectRequestsAction,
  batchCancelRequestsAction,
  batchDeleteRequestsAction,
  type BatchResult,
} from "./actions";

type Tone = "warning" | "info" | "danger" | "success" | "default";
export type RequestRow = {
  id: string;
  number: string;
  description: string;
  hasAttachment: boolean;
  subInfo: string;
  requestedBy: string;
  valueText: string;
  status: "PENDENTE" | "APROVADA" | "REJEITADA" | "CONCLUIDA" | "CANCELADA";
  statusLabel: string;
  statusTone: Tone;
};

export default function RequestsTable({
  rows,
  canApprove,
  canCreate,
}: {
  rows: RequestRow[];
  canApprove: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const selectable = rows.filter((r) => r.status !== "CONCLUIDA");
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (selectable.every((r) => prev.has(r.id)) ? new Set() : new Set(selectable.map((r) => r.id))));
  }

  function run(
    action: (ids: string[]) => Promise<BatchResult>,
    verb: string,
    confirmMsg?: string,
  ) {
    const ids = [...selected];
    if (!ids.length) return;
    if (confirmMsg && !confirm(confirmMsg)) return;
    setMsg(null);
    startTransition(async () => {
      const res = await action(ids);
      if (res.error) {
        setMsg(res.error);
        return;
      }
      setMsg(`${res.done} ${verb}${res.skipped > 0 ? ` · ${res.skipped} ignorada(s)` : ""}.`);
      setSelected(new Set());
      router.refresh();
    });
  }

  const canBatch = canApprove || canCreate;

  return (
    <>
      <Table>
        <Thead>
          <Tr>
            <Th className="w-8">
              {canBatch ? (
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
            <Th>Solicitante</Th>
            <Th className="text-right">Valor</Th>
            <Th>Status</Th>
            <Th />
          </Tr>
        </Thead>
        <tbody>
          {rows.map((r) => (
            <Tr key={r.id} className={selected.has(r.id) ? "bg-blue-50/60" : undefined}>
              <Td>
                {canBatch && r.status !== "CONCLUIDA" ? (
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${r.number}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                ) : null}
              </Td>
              <Td className="whitespace-nowrap tabular-nums text-slate-500">
                <Link href={`/compras/${r.id}`} className="text-blue-700 hover:underline">
                  {r.number}
                </Link>
              </Td>
              <Td className="max-w-[260px] font-medium text-slate-900">
                <Link href={`/compras/${r.id}`} className="block hover:underline">
                  <span className="block truncate">
                    {r.description}
                    {r.hasAttachment ? (
                      <span className="ml-1 text-slate-400" title="Tem anexo">
                        📎
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-xs font-normal text-slate-400">{r.subInfo}</span>
                </Link>
              </Td>
              <Td>{r.requestedBy}</Td>
              <Td className="text-right tabular-nums">{r.valueText}</Td>
              <Td>
                <Badge tone={r.statusTone}>{r.statusLabel}</Badge>
              </Td>
              <Td>
                {canCreate && (r.status === "PENDENTE" || r.status === "APROVADA") ? (
                  <Link href={`/compras/${r.id}/editar`} className="text-sm font-medium text-blue-700 hover:underline">
                    Editar
                  </Link>
                ) : null}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      {selected.size > 0 ? (
        <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-slate-800">
              {selected.size} selecionada(s)
            </p>
            {canApprove ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(batchApproveRequestsAction, "aprovada(s)")}
                  className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(batchRejectRequestsAction, "rejeitada(s)", "Rejeitar as selecionadas?")}
                  className="h-9 rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Rejeitar
                </button>
              </>
            ) : null}
            {canCreate ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(batchCancelRequestsAction, "cancelada(s)", "Cancelar as selecionadas?")}
                  className="h-9 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(batchDeleteRequestsAction, "excluída(s)", "Excluir as selecionadas? Esta ação não pode ser desfeita.")}
                  className="h-9 rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                >
                  Excluir
                </button>
              </>
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
