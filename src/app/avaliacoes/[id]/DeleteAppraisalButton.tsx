"use client";

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
      onClick={() => {
        if (!confirm("Excluir esta avaliação? As fotos também serão removidas.")) return;
        start(() => deleteAppraisalAction(id));
      }}
    >
      {pending ? "Excluindo..." : "🗑 Excluir"}
    </Button>
  );
}
