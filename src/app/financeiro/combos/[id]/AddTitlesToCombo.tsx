"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import { normalizeSearch } from "@/lib/search";
import { Button, Input, Select } from "@/components/ui";
import { addPayablesToComboAction, removePayableFromComboAction } from "../actions";

type Row = {
  id: string;
  description: string;
  supplierName: string;
  beneficiaryName: string;
  vehicleLabel: string;
  dueDate: string;
  amount: number;
};

function distinct(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export default function AddTitlesToCombo({ comboId, available }: { comboId: string; available: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [beneficiario, setBeneficiario] = useState("");
  const [veiculo, setVeiculo] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const supplierOptions = distinct(available.map((r) => r.supplierName));
  const beneficiaryOptions = distinct(available.map((r) => r.beneficiaryName));
  const vehicleOptions = distinct(available.map((r) => r.vehicleLabel));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function add() {
    const ids = [...selected];
    if (!ids.length) return;
    setMsg(null);
    start(async () => {
      const r = await addPayablesToComboAction(comboId, ids);
      if (!r.ok) {
        setMsg(r.error || "Não foi possível adicionar.");
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  const nq = normalizeSearch(q.trim());
  const shown = available.filter((r) => {
    if (fornecedor && r.supplierName !== fornecedor) return false;
    if (beneficiario && r.beneficiaryName !== beneficiario) return false;
    if (veiculo && r.vehicleLabel !== veiculo) return false;
    if (nq) {
      // Inclui o valor em várias formas para achar com ou sem ponto de milhar:
      // "R$ 2.000,00", "2000", "2000.00" e "2000,00".
      const valor = `${formatCurrency(r.amount)} ${r.amount} ${r.amount.toFixed(2)} ${r.amount.toFixed(2).replace(".", ",")}`;
      const hay = normalizeSearch(
        `${r.description} ${r.supplierName} ${r.beneficiaryName} ${r.vehicleLabel} ${valor} ${formatDate(r.dueDate)}`,
      );
      // Também compara a query sem ponto de milhar (ex.: "2.000" → "2000").
      if (!hay.includes(nq) && !hay.includes(nq.replace(/\./g, ""))) return false;
    }
    return true;
  });

  if (available.length === 0) {
    return <p className="px-1 py-3 text-sm text-slate-500">Nenhum título pendente disponível para adicionar.</p>;
  }

  const subtitle = (r: Row) => [r.supplierName || r.beneficiaryName, r.vehicleLabel].filter(Boolean).join(" · ") || "—";
  const selectedTotal = available.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1 basis-full sm:basis-auto">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar título (descrição, fornecedor, valor...)"
            className="h-11 text-base"
          />
        </div>
        <Select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className="h-11 w-full sm:w-48">
          <option value="">Todos os fornecedores</option>
          {supplierOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <Select value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} className="h-11 w-full sm:w-48">
          <option value="">Todos os beneficiários</option>
          {beneficiaryOptions.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </Select>
        <Select value={veiculo} onChange={(e) => setVeiculo(e.target.value)} className="h-11 w-full sm:w-52">
          <option value="">Todos os veículos</option>
          {vehicleOptions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </Select>
      </div>
      {shown.length === 0 ? (
        <p className="px-1 py-3 text-sm text-slate-500">Nenhum título encontrado para o filtro.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-800">{r.description}</span>
                <span className="block truncate text-xs text-slate-400">
                  {subtitle(r)} · vence {formatDate(r.dueDate)}
                </span>
              </span>
              <span className="tabular-nums text-slate-700">{formatCurrency(r.amount)}</span>
              <Link
                href={`/financeiro/a-pagar/${r.id}/editar?returnTo=${encodeURIComponent(`/financeiro/combos/${comboId}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-medium text-blue-700 hover:underline"
                title="Editar este título (abre em outra aba)"
              >
                Editar
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button className="h-9" disabled={pending || selected.size === 0} onClick={add}>
          Adicionar {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
        {selected.size > 0 ? (
          <span className="text-sm text-slate-600">
            Selecionados: <strong className="tabular-nums text-slate-900">{formatCurrency(selectedTotal)}</strong>
          </span>
        ) : null}
        {selected.size > 0 ? (
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-slate-400 hover:underline">
            Limpar seleção
          </button>
        ) : null}
        {msg ? <p className="text-sm text-rose-600">{msg}</p> : null}
      </div>
    </div>
  );
}

export function RemoveFromCombo({ payableId, comboId }: { payableId: string; comboId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-3 print:hidden">
      <Link
        href={`/financeiro/a-pagar/${payableId}/editar?returnTo=${encodeURIComponent(`/financeiro/combos/${comboId}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-blue-700 hover:underline"
      >
        Editar
      </Link>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await removePayableFromComboAction(payableId);
            if (!r.ok) {
              alert(r.error || "Não foi possível remover.");
              return;
            }
            router.refresh();
          })
        }
        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
      >
        Remover
      </button>
    </span>
  );
}
