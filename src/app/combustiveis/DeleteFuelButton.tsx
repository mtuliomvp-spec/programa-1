"use client";

import { useTransition } from "react";
import { deleteFuelEntryAction } from "./actions";

export default function DeleteFuelButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Excluir este abastecimento? A conta a pagar vinculada também será removida.")) {
          startTransition(() => deleteFuelEntryAction(id));
        }
      }}
      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
    >
      Excluir
    </button>
  );
}
