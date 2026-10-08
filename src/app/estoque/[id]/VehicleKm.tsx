"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateVehicleKmAction } from "../actions";

/**
 * Quilometragem na ficha, editável aqui mesmo por quem tem a permissão
 * "Editar quilometragem" (ou "Editar" o veículo) — sem abrir o formulário
 * inteiro do veículo.
 */
export default function VehicleKm({ vehicleId, km, canEdit }: { vehicleId: string; km: number; canEdit: boolean }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(km));
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function salvar() {
    setErro(null);
    const n = Number(valor.replace(/\D/g, ""));
    start(async () => {
      const r = await updateVehicleKmAction(vehicleId, n);
      if (!r.ok) {
        setErro(r.error || "Não foi possível salvar.");
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">KM</p>
      {editando ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="numeric"
            aria-label="Quilometragem"
            className="h-8 w-28 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
          />
          <button
            type="button"
            onClick={salvar}
            disabled={pending}
            className="h-8 rounded-lg bg-slate-900 px-2.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={() => setEditando(false)} className="text-xs text-slate-500 hover:underline">
            Cancelar
          </button>
          {erro ? <span className="w-full text-xs text-rose-600">{erro}</span> : null}
        </div>
      ) : (
        <p className="mt-0.5 text-sm font-medium text-slate-800">
          {km.toLocaleString("pt-BR")} km
          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                setValor(String(km));
                setEditando(true);
              }}
              className="ml-2 text-xs font-medium text-blue-700 hover:underline"
            >
              ✏️ editar
            </button>
          ) : null}
        </p>
      )}
    </div>
  );
}
