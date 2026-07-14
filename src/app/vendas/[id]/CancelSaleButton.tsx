"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { cancelSaleAction } from "../actions";

export default function CancelSaleButton({ id, mode = "cancel" }: { id: string; mode?: "cancel" | "fix" }) {
  const [pending, startTransition] = useTransition();
  const isFix = mode === "fix";

  function handleClick() {
    const message = isFix
      ? "Reverter os lançamentos que ficaram presos nesta venda cancelada? Os recebíveis vinculados serão removidos e o caixa voltará a bater com a equação patrimonial (o sinal, se houver, é preservado)."
      : "Cancelar esta venda? O veículo voltará para o estoque e todos os lançamentos serão revertidos (o sinal, se houver, é preservado).";
    if (!confirm(message)) return;
    startTransition(() => cancelSaleAction(id));
  }

  return (
    <Button variant="danger" onClick={handleClick} disabled={pending}>
      {pending
        ? isFix
          ? "Revertendo..."
          : "Cancelando..."
        : isFix
          ? "Reverter lançamentos"
          : "Cancelar venda"}
    </Button>
  );
}
