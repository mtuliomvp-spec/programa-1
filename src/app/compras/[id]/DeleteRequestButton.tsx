"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { deleteRequestAction } from "../actions";

/** Exclui a solicitação (ex.: duplicada) e volta para a lista. */
export default function DeleteRequestButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (!confirm("Excluir esta solicitação? Esta ação não pode ser desfeita.")) return;
          setError(null);
          startTransition(async () => {
            const res = await deleteRequestAction(id);
            if (!res.ok) setError(res.error || "Não foi possível excluir.");
            else router.push("/compras");
          });
        }}
        className="!text-rose-700"
      >
        {pending ? "Excluindo..." : "Excluir"}
      </Button>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </>
  );
}
