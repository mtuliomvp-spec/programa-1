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
  canManage,
  cashboxDate,
}: {
  comboId: string;
  status: Status;
  accounts: Account[];
  canPagar: boolean;
  canManage: boolean;
  cashboxDate: string | null;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  // Confirmação in-app (o window.confirm nativo é suprimido em vários navegadores
  // de celular/in-app, o que travava as ações — "como se não tivesse clicado").
  const [confirming, setConfirming] = useState<{ key: "request" | "pay" | "cancel"; msg: string } | null>(null);

  function confirmYes() {
    const key = confirming?.key;
    setConfirming(null);
    if (!key) return;
    setMsg(null);
    start(async () => {
      const r =
        key === "request"
          ? await requestComboAction(comboId)
          : key === "pay"
            ? await payComboAction(comboId, accountId)
            : await cancelComboAction(comboId);
      if (!r.ok) {
        setMsg(r.error || "Não foi possível concluir.");
        return;
      }
      router.refresh();
    });
  }

  if (status === "PAGO" || status === "CANCELADO") return null;

  const showRequest = status === "ABERTO" && canManage;
  const showPay = status === "SOLICITADO" && canPagar;
  const showCancel = canManage;
  if (!showRequest && !showPay && !showCancel) return null;

  return (
    <div className="print:hidden flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
      {showRequest ? (
        <button
          type="button"
          disabled={pending || confirming !== null}
          onClick={() => setConfirming({ key: "request", msg: "Encerrar o combo e solicitar o pagamento do total?" })}
          className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Solicitar pagamento
        </button>
      ) : null}

      {showPay ? (
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
            disabled={pending || !accountId || confirming !== null}
            onClick={() => setConfirming({ key: "pay", msg: "Pagar todos os títulos do combo agora?" })}
            className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? "Pagando..." : "Pagar combo"}
          </button>
          <span className="text-xs text-slate-500">
            Data: <strong>{cashboxDate ? `${cashboxDate} (caixa)` : "—"}</strong>
          </span>
        </>
      ) : null}

      {showCancel ? (
        <button
          type="button"
          disabled={pending || confirming !== null}
          onClick={() =>
            setConfirming({ key: "cancel", msg: "Cancelar o combo? Os títulos voltam soltos para o Contas a pagar." })
          }
          className="h-9 rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Cancelar combo
        </button>
      ) : null}

      {confirming ? (
        <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="mb-2 text-sm text-slate-700">{confirming.msg}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={confirmYes}
              className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {pending ? "Processando..." : "Confirmar"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(null)}
              className="h-9 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <p className="w-full text-sm text-rose-600">{msg}</p> : null}
    </div>
  );
}
