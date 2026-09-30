"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import MoneyInput from "@/components/MoneyInput";
import { devolverSinalAction } from "../actions";

type Account = { id: string; name: string };

/**
 * Devolver um sinal já creditado (a venda não aconteceu). O normal é devolver
 * tudo; se a loja retiver uma parte (desistência), ela vira receita
 * administrativa. A devolução sai agora pela conta escolhida ou fica no
 * Contas a pagar.
 */
export default function DevolverSinal({
  receivableId,
  vehicleId,
  amount,
  accounts,
  contaDoSinal,
  aguardandoCredito = false,
}: {
  receivableId: string;
  vehicleId: string;
  amount: number;
  accounts: Account[];
  /** Nome da conta em que o sinal entrou (sugestão para a devolução). */
  contaDoSinal: string | null;
  /**
   * O sinal ainda não foi creditado (o caixa não chegou no dia do depósito):
   * a devolução fica a pagar (Já paguei) e sai depois do crédito; sem retenção.
   */
  aguardandoCredito?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [reter, setReter] = useState(false);
  const [retido, setRetido] = useState(0);
  const [pagarAgora, setPagarAgora] = useState(!aguardandoCredito);
  const [accountId, setAccountId] = useState(
    accounts.find((a) => a.name === contaDoSinal)?.id ?? accounts[0]?.id ?? "",
  );
  const [obs, setObs] = useState("");
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const valorRetido = reter ? retido : 0;
  const devolver = Math.round((amount - valorRetido) * 100) / 100;
  const invalido = valorRetido < 0 || valorRetido > amount + 0.005;

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-xs font-medium text-blue-700 hover:underline"
      >
        ↩︎ Devolver
      </button>
    );
  }

  function confirmar() {
    setErro(null);
    start(async () => {
      const r = await devolverSinalAction({
        receivableId,
        vehicleId,
        valorRetido,
        pagarAgora: pagarAgora && devolver > 0.005,
        accountId,
        obs,
      });
      if (!r.ok) {
        setErro(r.error || "Não foi possível devolver.");
        return;
      }
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-sm">
      <p className="font-semibold text-slate-900">Devolver sinal de {formatCurrency(amount)}</p>
      <p className="mt-0.5 text-xs text-slate-600">
        A venda não aconteceu. O sinal continua registrado no dia em que entrou; a devolução sai como
        um pagamento ao cliente, na data do caixa aberto.
      </p>

      {aguardandoCredito ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          Este sinal ainda <strong>aguarda crédito</strong> (depósito à frente do caixa). A devolução vai
          para o <strong>Contas a pagar</strong>: lá, use o <strong>“Já paguei”</strong> com a data e o
          comprovante da devolução. No caixa, confirme primeiro o crédito do sinal e depois a devolução.
        </p>
      ) : null}
      <label className={`mt-2 flex items-center gap-2 text-xs text-slate-700 ${aguardandoCredito ? "hidden" : ""}`}>
        <input
          type="checkbox"
          checked={reter}
          onChange={(e) => setReter(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        A loja vai reter uma parte (desistência)
      </label>
      {reter ? (
        <label className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
          Valor retido pela loja (vira receita administrativa)
          <span className="w-44">
            <MoneyInput name="valorRetido" onValueChange={setRetido} />
          </span>
        </label>
      ) : null}

      <p className="mt-2 text-xs text-slate-700">
        Devolver ao cliente: <strong>{formatCurrency(Math.max(0, devolver))}</strong>
        {valorRetido > 0.005 ? ` · retido ${formatCurrency(valorRetido)}` : ""}
      </p>
      {invalido ? <p className="text-xs text-rose-600">O valor retido não pode passar do sinal.</p> : null}

      {devolver > 0.005 && !aguardandoCredito ? (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={pagarAgora}
              onChange={(e) => setPagarAgora(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Pagar agora
          </label>
          {pagarAgora ? (
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Conta de onde sai
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
          ) : (
            <span className="text-xs text-slate-500">
              Fica no Contas a pagar (dá para usar o &quot;Já paguei&quot; com o comprovante).
            </span>
          )}
        </div>
      ) : null}

      <input
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        placeholder="Observação (opcional) — ex.: cliente desistiu da compra"
        className="mt-2 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={confirmar}
          disabled={pending || invalido || (pagarAgora && devolver > 0.005 && !accountId)}
          className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Registrando…" : "Confirmar devolução"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-slate-500 hover:underline">
          Voltar
        </button>
      </div>
      {erro ? <p className="mt-2 text-xs text-rose-600">{erro}</p> : null}
    </div>
  );
}
