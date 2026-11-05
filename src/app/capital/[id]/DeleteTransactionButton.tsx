"use client";

import { perguntar } from "@/lib/confirmar";

import { useTransition } from "react";
import { deleteCapitalTransactionAction } from "../actions";

export default function DeleteTransactionButton({
  id,
  beneficiaryId,
}: {
  id: string;
  beneficiaryId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        if (await perguntar("Excluir esta movimentação? O lançamento vinculado no financeiro também será removido.")) {
          startTransition(() => deleteCapitalTransactionAction(id, beneficiaryId));
        }
      }}
      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
    >
      Excluir
    </button>
  );
}
