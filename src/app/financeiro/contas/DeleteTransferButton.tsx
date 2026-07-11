"use client";

import { useTransition } from "react";
import { deleteTransferAction } from "./actions";

export default function DeleteTransferButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Excluir esta transferência? Os saldos das duas contas serão recalculados.")) {
          startTransition(() => deleteTransferAction(id));
        }
      }}
      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
    >
      Excluir
    </button>
  );
}
