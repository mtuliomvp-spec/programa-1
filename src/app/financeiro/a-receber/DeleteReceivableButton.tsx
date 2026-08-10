"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReceivableAction } from "./actions";

export default function DeleteReceivableButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Excluir este título a receber? Esta ação não pode ser desfeita.")) return;
        startTransition(async () => {
          const r = await deleteReceivableAction(id);
          if (!r.ok) {
            alert(r.error || "Não foi possível excluir.");
            return;
          }
          router.refresh();
        });
      }}
      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50 print:hidden"
    >
      Excluir
    </button>
  );
}
