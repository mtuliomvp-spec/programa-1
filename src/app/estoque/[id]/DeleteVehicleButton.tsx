"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { deleteVehicleAction } from "../actions";

export default function DeleteVehicleButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Tem certeza que deseja excluir este veículo do estoque? Esta ação não pode ser desfeita.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteVehicleAction(id);
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setError(err.message);
        }
      }
    });
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">Excluir permanentemente este veículo do estoque.</p>
      {error ? <p className="mb-2 text-sm text-rose-600">{error}</p> : null}
      <Button variant="danger" onClick={handleDelete} disabled={pending}>
        {pending ? "Excluindo..." : "Excluir veículo"}
      </Button>
    </div>
  );
}
