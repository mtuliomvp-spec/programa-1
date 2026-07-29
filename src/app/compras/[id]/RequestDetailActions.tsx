"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { decideRequestAction, cancelRequestAction } from "../actions";
import { Button } from "@/components/ui";

type Status = "PENDENTE" | "APROVADA" | "REJEITADA" | "CONCLUIDA" | "CANCELADA";

/**
 * Decisão da solicitação PENDENTE: aprovar / rejeitar (quem pode aprovar) ou
 * cancelar (quem criou). Aprovar já gera o espelho em Contas a pagar.
 */
export default function RequestDetailActions({
  id,
  status,
  canApprove,
  canCreate,
}: {
  id: string;
  status: Status;
  canApprove: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status !== "PENDENTE") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canApprove ? (
        <>
          <Button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => decideRequestAction(id, true).then(() => router.refresh()))}
          >
            ✓ Aprovar
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              const notes = prompt("Motivo da rejeição (opcional):") || undefined;
              startTransition(() => decideRequestAction(id, false, notes).then(() => router.refresh()));
            }}
          >
            Rejeitar
          </Button>
        </>
      ) : null}
      {canCreate ? (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (confirm("Cancelar esta solicitação?")) {
              startTransition(() => cancelRequestAction(id).then(() => router.refresh()));
            }
          }}
        >
          Cancelar solicitação
        </Button>
      ) : null}
      {!canApprove && !canCreate ? (
        <p className="text-sm text-slate-500">Aguardando aprovação do administrador.</p>
      ) : null}
    </div>
  );
}
