"use client";

import { useState, useTransition } from "react";
import { updateVehicleSupplierAction } from "../actions";

/**
 * Fornecedor (ou consignante) na ficha, editável aqui mesmo pelo
 * administrador — sem abrir o formulário inteiro do veículo.
 */
export default function VehicleSupplier({
  vehicleId,
  label,
  supplier,
  fornecedores,
}: {
  vehicleId: string;
  label: string;
  supplier: { id: string; name: string } | null;
  /** Lista para escolher; nula = quem vê não pode editar. */
  fornecedores: { id: string; name: string; document: string | null }[] | null;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(supplier?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function salvar() {
    setErro(null);
    start(async () => {
      const r = await updateVehicleSupplierAction(vehicleId, valor || null);
      if (!r.ok) {
        setErro(r.error || "Não foi possível salvar.");
        return;
      }
      // Recarrega a ficha inteira: contrato, ordem de compra e Renave usam o
      // fornecedor (o refresh do roteador nem sempre re-renderiza a página).
      window.location.reload();
    });
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      {editando && fornecedores ? (
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <select
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            aria-label={label}
            className="h-8 w-full max-w-64 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
          >
            <option value="">— sem fornecedor —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.document ? ` · ${f.document}` : ""}
              </option>
            ))}
          </select>
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
          <span className="w-full text-[11px] text-slate-500">
            Não está na lista?{" "}
            <a href="/fornecedores" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
              Cadastre em Fornecedores
            </a>{" "}
            e volte aqui.
          </span>
          {erro ? <span className="w-full text-xs text-rose-600">{erro}</span> : null}
        </div>
      ) : (
        <p className="mt-0.5 text-sm font-medium text-slate-800">
          {supplier?.name || "-"}
          {fornecedores ? (
            <button
              type="button"
              onClick={() => {
                setValor(supplier?.id ?? "");
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
