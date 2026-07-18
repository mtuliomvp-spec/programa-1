"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPayableSupplierAction } from "../../actions";

type Supplier = { id: string; name: string };

/**
 * Conserta títulos lançados sem fornecedor: escolhe um fornecedor e grava no
 * título (metadado — não altera valores nem saldos). Aparece na ordem apenas
 * quando o título não tem fornecedor nem beneficiário.
 */
export default function SetSupplierForm({
  payableId,
  suppliers,
}: {
  payableId: string;
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (suppliers.length === 0) return null;

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
        >
          <option value="">Escolha o fornecedor…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending || !supplierId}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await setPayableSupplierAction(payableId, supplierId);
              if (!res.ok) setError(res.error || "Erro ao salvar.");
              else router.refresh();
            })
          }
          className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Definir fornecedor"}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
