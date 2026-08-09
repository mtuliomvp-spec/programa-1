"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { mergeDuplicateCustomersAction, type MergeResult } from "./actions";

export default function MergeButton({ groups, moved }: { groups: number; moved: number }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<MergeResult | null>(null);

  return (
    <div>
      <Button
        type="button"
        disabled={pending || (result?.ok ?? false)}
        onClick={() => {
          const ok = confirm(
            `Unificar ${groups} grupo(s) de clientes repetidos?\n\n` +
              `${moved} lançamento(s) passam para o cadastro que fica. ` +
              `Nenhuma venda, proposta ou conta a receber é apagada — só muda de cliente. ` +
              `Os cadastros repetidos, já sem nada ligado a eles, são excluídos.`,
          );
          if (!ok) return;
          startTransition(async () => setResult(await mergeDuplicateCustomersAction()));
        }}
      >
        {pending ? "Unificando..." : `Unificar os ${groups} grupo(s)`}
      </Button>

      {result?.ok ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-medium">
            {result.groups} grupo(s) unificado(s) · {result.moved} lançamento(s) mudaram de dono ·{" "}
            {result.removed} cadastro(s) repetido(s) excluído(s).
          </p>
          {result.names.length ? <p className="mt-1">Ficaram: {result.names.join(" · ")}.</p> : null}
          <p className="mt-1">Recarregue esta página para conferir que não sobrou nada.</p>
        </div>
      ) : null}
      {result && !result.ok ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {result.error}
        </div>
      ) : null}
    </div>
  );
}
