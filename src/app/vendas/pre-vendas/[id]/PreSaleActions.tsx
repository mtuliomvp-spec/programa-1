"use client";

import { useTransition } from "react";
import { Button, LinkButton } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import { convertPreSaleAction, deletePreSaleAction } from "../actions";

export default function PreSaleActions({ id, editHref }: { id: string; editHref: string }) {
  const [pending, start] = useTransition();

  function handleConvert() {
    if (!confirm("Registrar a venda agora? A partir daqui os lançamentos financeiros serão gerados.")) return;
    start(() => convertPreSaleAction(id));
  }
  function handleDelete() {
    if (!confirm("Excluir esta pré-venda? Ela não gerou nada no financeiro; será apenas removida.")) return;
    start(() => deletePreSaleAction(id));
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
      <LinkButton variant="secondary" href="/vendas">
        ← Vendas
      </LinkButton>
      <LinkButton variant="secondary" href={editHref}>
        ✏️ Editar
      </LinkButton>
      <PrintButton />
      <Button type="button" variant="danger" onClick={handleDelete} disabled={pending}>
        {pending ? "..." : "Excluir"}
      </Button>
      <Button type="button" onClick={handleConvert} disabled={pending}>
        {pending ? "Registrando..." : "✓ Registrar venda"}
      </Button>
    </div>
  );
}
