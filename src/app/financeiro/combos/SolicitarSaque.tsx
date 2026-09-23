"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import { formatCurrency } from "@/lib/format";
import { solicitarSaqueAction } from "./actions";

/**
 * "Solicitar saque": o beneficiário do capital pede parte do seu capital livre.
 * Vira um combo do tipo SAQUE — daí em diante é o combo de sempre (borderô,
 * comprovante, fila do caixa, pagamento, estorno).
 */
export default function SolicitarSaque({
  disponivel,
  livre,
  pendente,
  beneficiario,
  verExtrato,
}: {
  disponivel: number;
  livre: number;
  pendente: number;
  beneficiario: string;
  /** Mostra o atalho para o extrato do próprio capital (quem pode vê-lo). */
  verExtrato?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(0);
  const [obs, setObs] = useState("");
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function solicitar() {
    setErro(null);
    start(async () => {
      const r = await solicitarSaqueAction(valor, obs);
      if (!r.ok || !r.id) {
        setErro(r.error || "Não foi possível solicitar o saque.");
        return;
      }
      router.push(`/financeiro/combos/${r.id}`);
    });
  }

  const semSaldo = disponivel <= 0.005;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-900">💸 Saque do capital — {beneficiario}</p>
          <p className="text-xs text-emerald-800">
            Disponível para saque: <strong>{formatCurrency(disponivel)}</strong>
            {pendente > 0.005
              ? ` (capital livre ${formatCurrency(livre)}, com ${formatCurrency(pendente)} em saques ainda não pagos)`
              : ""}
            {verExtrato ? (
              <>
                {" · "}
                <Link href="/capital/meu" className="font-medium text-emerald-900 underline">
                  Ver meu extrato
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {!aberto ? (
          <Button type="button" className="h-9" onClick={() => setAberto(true)} disabled={semSaldo}>
            Solicitar saque
          </Button>
        ) : null}
      </div>
      {semSaldo && !aberto ? (
        <p className="mt-1 text-xs text-slate-500">
          Sem capital livre para sacar agora — o aplicado fica em conta de Aplicação e não sai por aqui.
        </p>
      ) : null}
      {aberto ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Valor do saque
            <MoneyInput name="valorSaque" defaultValue={null} onValueChange={setValor} placeholder="0,00" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Observação (opcional)
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: transferir por PIX"
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={solicitar}
              disabled={pending || valor <= 0 || valor > disponivel + 0.005}
            >
              {pending ? "Solicitando…" : "Confirmar saque"}
            </Button>
            <button
              type="button"
              onClick={() => setAberto(false)}
              disabled={pending}
              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Voltar
            </button>
          </div>
          {valor > disponivel + 0.005 ? (
            <p className="text-xs text-rose-600 sm:col-span-3">
              Acima do disponível ({formatCurrency(disponivel)}).
            </p>
          ) : null}
          <p className="text-[11px] text-slate-500 sm:col-span-3">
            O saque vai para aprovação e pagamento como um combo, com os seus dados bancários no borderô.
            A retirada só entra no seu capital quando o pagamento sair.
          </p>
          {erro ? <p className="text-sm text-rose-600 sm:col-span-3">{erro}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
