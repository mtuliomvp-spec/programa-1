"use client";

import { perguntar } from "@/lib/confirmar";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { deleteAppraisalAction } from "../actions";

export default function DeleteAppraisalButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      disabled={pending}
      onClick={async () => {
        if (!await perguntar("Excluir esta avaliação? As fotos também serão removidas.")) return;
        start(() => deleteAppraisalAction(id));
      }}
    >
      {pending ? "Excluindo..." : "🗑 Excluir"}
    </Button>
  );
}
