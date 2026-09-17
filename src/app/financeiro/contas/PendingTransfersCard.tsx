"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  confirmarTransferenciaPendenteAction,
  descartarTransferenciaPendenteAction,
} from "./actions";

export type TransferenciaPendente = {
  id: string;
  fromName: string;
  toName: string;
  amount: number;
  /** Data em que o dinheiro saiu do banco (a do comprovante). */
  date: string;
  description: string | null;
  note: string | null;
  temComprovante: boolean;
  /** O movimento de caixa já alcançou esse dia? */
  podeConfirmar: boolean;
};

/**
 * Transferências entre contas JÁ FEITAS no banco, esperando o movimento chegar
 * no dia — o mesmo lugar dos títulos pré-lançados, só que aqui o dinheiro anda
 * entre as contas da loja (não muda o saldo total, muda de bolso).
 *
 * Enquanto esperam, elas não mexem em nada: saldo, extrato e conciliação só
 * enxergam a transferência depois do ok.
 */
export default function PendingTransfersCard({
  rows,
  workDateLabel,
  canConfirmar,
}: {
  rows: TransferenciaPendente[];
  workDateLabel: string;
  canConfirmar: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [agindo, start] = useTransition();
  // Some da tela na hora: esperar o redesenho do servidor fazia parecer que o
  // clique não tinha funcionado.
  const [removidas, setRemovidas] = useState<string[]>([]);

  const linhas = rows.filter((r) => !removidas.includes(r.id));
  if (linhas.length === 0) return null;

  function confirmar(r: TransferenciaPendente) {
    setMsg(null);
    setPendingId(r.id);
    start(async () => {
      const res = await confirmarTransferenciaPendenteAction(r.id);
      setPendingId(null);
      if (!res.ok) {
        setMsg(res.error || "Não foi possível confirmar.");
        return;
      }
      setRemovidas((prev) => [...prev, r.id]);
      setMsg(
        `Transferência de ${formatCurrency(r.amount)} (${r.fromName} → ${r.toName}) lançada no caixa de ${workDateLabel}.`,
      );
      router.refresh();
    });
  }

  function descartar(r: TransferenciaPendente) {
    if (!confirm(`Tirar da fila a transferência de ${formatCurrency(r.amount)} (${r.fromName} → ${r.toName})?`)) {
      return;
    }
    setMsg(null);
    setRemovidas((prev) => [...prev, r.id]);
    start(async () => {
      const res = await descartarTransferenciaPendenteAction(r.id);
      if (!res.ok) {
        setRemovidas((prev) => prev.filter((x) => x !== r.id));
        setMsg(res.error || "Não foi possível tirar da fila.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="mb-4 border-2 border-sky-300">
      <CardHeader
        title={`🔁 ${linhas.length} transferência(s) informada(s) esperando o caixa`}
        description="O dinheiro já andou entre as contas no banco. O saldo só muda quando o movimento do dia for aberto e você der o ok."
      />
      <div className="divide-y divide-slate-100">
        {linhas.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">
                {r.fromName} → {r.toName}
                {r.description ? <span className="font-normal text-slate-500"> · {r.description}</span> : null}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                saiu do banco em {formatDate(r.date)}
                {r.temComprovante ? (
                  <>
                    {" · "}
                    <a
                      href={`/financeiro/contas/comprovante/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-700 hover:underline"
                    >
                      📎 comprovante
                    </a>
                  </>
                ) : null}
              </p>
              {r.note ? <p className="mt-1 text-xs font-medium text-amber-700">⚠ {r.note}</p> : null}
              {!r.podeConfirmar ? (
                <p className="mt-1 text-xs text-slate-500">
                  Espera o movimento alcançar {formatDate(r.date)} — o caixa aberto é de {workDateLabel}.
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="font-semibold tabular-nums text-slate-800">{formatCurrency(r.amount)}</p>
              {canConfirmar ? (
                r.podeConfirmar ? (
                  <Button
                    type="button"
                    className="mt-1"
                    onClick={() => confirmar(r)}
                    disabled={agindo && pendingId === r.id}
                  >
                    {agindo && pendingId === r.id ? "Lançando…" : "✓ Confirmar no caixa"}
                  </Button>
                ) : (
                  <Badge tone="info">aguardando o caixa</Badge>
                )
              ) : (
                <Badge tone="warning">Sem permissão</Badge>
              )}
              {canConfirmar ? (
                <button
                  type="button"
                  onClick={() => descartar(r)}
                  disabled={agindo}
                  className="mt-1 block w-full text-right text-[11px] font-medium text-slate-400 hover:text-rose-600 hover:underline disabled:opacity-50"
                >
                  tirar da fila
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {msg ? <p className="px-5 pb-3 text-sm font-medium text-slate-700">{msg}</p> : null}
    </Card>
  );
}
