"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { cancelSaleAction } from "../actions";

export default function CancelSaleButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("Cancelar esta venda? O veículo voltará para o estoque e as parcelas pendentes serão removidas.")) return;
    startTransition(() => cancelSaleAction(id));
  }

  return (
    <Button variant="danger" onClick={handleClick} disabled={pending}>
      {pending ? "Cancelando..." : "Cancelar venda"}
    </Button>
  );
}
