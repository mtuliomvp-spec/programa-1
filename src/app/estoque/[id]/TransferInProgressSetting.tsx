"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { setVehicleTransferInProgressAction } from "../actions";

/**
 * Marca MANUAL de "em processo de transferência no DETRAN". Para casos antigos
 * em que a taxa foi paga fora do sistema (sem custo de "transferência" para
 * acender o selo sozinho). Anexar o CRLV novo encerra o processo — o selo do
 * estoque vira "Transferido" independentemente desta marca.
 */
export default function TransferInProgressSetting({
  vehicleId,
  initial,
  canManage,
  hasCrlv,
}: {
  vehicleId: string;
  initial: boolean;
  canManage: boolean;
  /** Já tem CRLV anexado: o processo se encerra ao anexar (só informa). */
  hasCrlv: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(next: boolean) {
    setError(null);
    startSave(async () => {
      const r = await setVehicleTransferInProgressAction(vehicleId, next);
      if (!r.ok) {
        setError(r.error || "Não foi possível salvar.");
        return;
      }
      setOn(next);
    });
  }

  return (
    <div className="p-5">
      {on ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-blue-700">🔄 Marcado como em processo de transferência</p>
          {canManage ? (
            <button
              type="button"
              onClick={() => set(false)}
              disabled={saving}
              className="text-xs text-slate-400 hover:underline disabled:opacity-50"
            >
              {saving ? "..." : "desfazer"}
            </button>
          ) : null}
        </div>
      ) : (
        <div>
          <p className="text-sm text-slate-600">
            Para casos antigos em que a taxa de transferência foi paga fora do sistema, marque aqui
            para o veículo aparecer como <strong>em processo de transferência</strong> na lista do
            estoque.
          </p>
          {canManage ? (
            <Button type="button" variant="secondary" onClick={() => set(true)} disabled={saving} className="mt-2">
              {saving ? "Salvando..." : "Marcar em transferência"}
            </Button>
          ) : null}
        </div>
      )}
      {hasCrlv ? (
        <p className="mt-2 text-xs text-slate-400">
          Quando o CRLV anexado estiver no nome da loja/sócio, a lista passa a mostrar
          “Transferido”. Enquanto estiver no nome do dono anterior, segue “em processo”.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}
