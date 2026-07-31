"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestComboAction, payComboAction, cancelComboAction } from "../actions";

type Account = { id: string; name: string };
type Status = "ABERTO" | "SOLICITADO" | "PAGO" | "CANCELADO";

export default function ComboActions({
  comboId,
  status,
  accounts,
  canPagar,
  cashboxDate,
}: {
  comboId: string;
  status: Status;
  accounts: Account[];
  canPagar: boolean;
  cashboxDate: string | null;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setMsg(r.error || "Não foi possível concluir.");
        return;
      }
      router.refresh();
    });
  }

  if (status === "PAGO" || status === "CANCELADO") return null;

  return (
    <div className="print:hidden flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
      {status === "ABERTO" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => requestComboAction(comboId), "Encerrar o combo e solicitar o pagamento do total?")}
          className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Solicitar pagamento
        </button>
      ) : null}

      {status === "SOLICITADO" && canPagar ? (
        <>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !accountId}
            onClick={() => run(() => payComboAction(comboId, accountId), "Pagar todos os títulos do combo agora?")}
            className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? "Pagando..." : "Pagar combo"}
          </button>
          <span className="text-xs text-slate-500">
            Data: <strong>{cashboxDate ? `${cashboxDate} (caixa)` : "—"}</strong>
          </span>
        </>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => cancelComboAction(comboId), "Cancelar o combo? Os títulos voltam soltos para o Contas a pagar.")}
        className="h-9 rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        Cancelar combo
      </button>
      {msg ? <p className="w-full text-sm text-rose-600">{msg}</p> : null}
    </div>
  );
}
