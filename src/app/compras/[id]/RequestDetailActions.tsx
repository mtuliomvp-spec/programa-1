"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, useActionState } from "react";
import {
  decideRequestAction,
  cancelRequestAction,
  concludeRequestAction,
  type ComprasFormState,
} from "../actions";
import { Button, Field, Input, Select } from "@/components/ui";
import { STRUCTURAL_FLOWS } from "@/lib/structural-flows";

type Status = "PENDENTE" | "APROVADA" | "REJEITADA" | "CONCLUIDA" | "CANCELADA";

/**
 * Ações da solicitação na página de detalhe (versão espaçosa, boa no celular).
 * - Pendente: aprovar / rejeitar (quem pode aprovar) ou cancelar (quem criou).
 * - Aprovada: concluir a compra → lança direto em Contas a pagar.
 */
export default function RequestDetailActions({
  id,
  status,
  structuralKey,
  canApprove,
  canCreate,
}: {
  id: string;
  status: Status;
  structuralKey?: string | null;
  canApprove: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, formAction, concludePending] = useActionState(
    async (prev: ComprasFormState, formData: FormData) => {
      const result = await concludeRequestAction(prev, formData);
      if (result.success) router.refresh();
      return result;
    },
    {} as ComprasFormState,
  );

  if (status === "PENDENTE") {
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

  if (status === "APROVADA") {
    if (!canApprove) {
      return <p className="text-sm text-slate-500">Aprovada — aguardando a conclusão da compra.</p>;
    }
    return (
      <form action={formAction} className="space-y-3">
        <p className="text-sm text-slate-600">
          Informe o valor realmente pago/combinado para lançar em <strong>Contas a pagar</strong>.
        </p>
        <input type="hidden" name="requestId" value={id} />
        <Field label="Valor final (R$)" required>
          <Input name="finalAmount" type="number" step="0.01" min={0.01} required placeholder="0,00" />
        </Field>
        <Field label="Categoria">
          <Select name="category" defaultValue="COMPRA_PECA">
            <option value="COMPRA_PECA">Compra de peças</option>
            <option value="DESPESA_OPERACIONAL">Despesa operacional</option>
            <option value="COMBUSTIVEL">Combustível</option>
            <option value="OUTROS">Outros</option>
          </Select>
        </Field>
        <Field label="Fluxo">
          <Select name="structuralKey" defaultValue={structuralKey || "ADMINISTRATIVO"}>
            {STRUCTURAL_FLOWS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="alreadyPaid" value="true" className="h-4 w-4" />
          Já foi pago (lança como pago)
        </label>
        <Button type="submit" disabled={concludePending} className="w-full">
          {concludePending ? "Lançando..." : "Concluir e lançar em Contas a pagar"}
        </Button>
        {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      </form>
    );
  }

  return null;
}
