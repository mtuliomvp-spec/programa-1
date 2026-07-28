"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { setBeneficiaryParentAction, addCapitalTransactionAction } from "../actions";

type Child = { id: string; name: string; saldo: number };
type Option = { id: string; name: string };

/** Converte "1.234,50"/"1234.5" em número (ou NaN). */
function parseAmount(v: string): number {
  return Number(String(v).trim().replace(/\./g, "").replace(",", "."));
}

function ChildRow({ child, today }: { child: Child; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();

  function withdraw() {
    setMsg(null);
    const parsed = parseAmount(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMsg("Informe um valor maior que zero.");
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("beneficiaryId", child.id);
      fd.set("kind", "RETIRADA");
      fd.set("amount", String(parsed));
      fd.set("date", date);
      fd.set("description", "Uso/devolução de caução");
      const r = await addCapitalTransactionAction({}, fd);
      if (r.error) {
        setMsg(r.error);
        return;
      }
      setOpen(false);
      setAmount("");
      router.refresh();
    });
  }

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/capital/${child.id}`} className="text-sm font-medium text-blue-700 hover:underline">
            {child.name}
          </Link>
          <span className="ml-2 text-xs text-slate-500">
            saldo{" "}
            <strong className={child.saldo < 0 ? "text-rose-600" : "text-slate-700"}>
              {formatCurrency(child.saldo)}
            </strong>
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" onClick={() => setOpen((v) => !v)} className="font-medium text-blue-700 hover:underline">
            Usar/Devolver
          </button>
          <button
            type="button"
            disabled={removing}
            onClick={() => {
              if (confirm(`Remover o vínculo de ${child.name}?`)) {
                startRemove(async () => {
                  await setBeneficiaryParentAction(child.id, null);
                  router.refresh();
                });
              }
            }}
            className="font-medium text-rose-600 hover:underline disabled:opacity-50"
          >
            Remover
          </button>
        </div>
      </div>
      {open ? (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Valor a retirar
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className="h-8 w-32 text-sm" />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Data
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40 text-sm" />
          </label>
          <Button type="button" onClick={withdraw} disabled={pending} className="h-8 px-3 text-xs">
            {pending ? "Retirando..." : "Retirar da caução"}
          </Button>
          {msg ? <p className="w-full text-xs text-rose-600">{msg}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

/** Lado do responsável: lista dos vinculados (caução) + adicionar/remover + usar/devolver. */
export default function LinkedBeneficiaries({
  parentId,
  childrenList,
  eligible,
  today,
}: {
  parentId: string;
  childrenList: Child[];
  eligible: Option[];
  today: string;
}) {
  const router = useRouter();
  const [addValue, setAddValue] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const total = childrenList.reduce((s, c) => s + c.saldo, 0);

  function add() {
    if (!addValue) return;
    setMsg(null);
    start(async () => {
      const r = await setBeneficiaryParentAction(addValue, parentId);
      if (!r.ok) {
        setMsg(r.error || "Não foi possível vincular.");
        return;
      }
      setAddValue("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">🏠 Caução vinculada</p>
        <p className="text-sm">
          Total <strong className="text-emerald-700">{formatCurrency(total)}</strong>
          <span className="ml-1 text-xs text-slate-400">
            · {childrenList.length} vinculado(s)
          </span>
        </p>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        Valores de terceiros atrelados a este responsável — <strong>não entram no saldo investido dele</strong>
        (mas seguem contando no capital total da loja). Para usar/devolver, retire da caução (sai do caixa).
      </p>

      {childrenList.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100">
          {childrenList.map((c) => (
            <ChildRow key={c.id} child={c} today={today} />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-400">Nenhum vinculado ainda.</p>
      )}

      {eligible.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Adicionar vinculado
            <Select value={addValue} onChange={(e) => setAddValue(e.target.value)} className="max-w-[220px]">
              <option value="">Escolha um beneficiário</option>
              {eligible.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </label>
          <Button type="button" onClick={add} disabled={pending || !addValue}>
            {pending ? "Vinculando..." : "Adicionar"}
          </Button>
          {msg ? <p className="w-full text-xs text-rose-600">{msg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
