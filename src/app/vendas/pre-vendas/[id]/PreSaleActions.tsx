"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, LinkButton } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import { convertPreSaleAction, deletePreSaleAction } from "../actions";

export default function PreSaleActions({ id, editHref }: { id: string; editHref: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleConvert() {
    if (!confirm("Registrar a venda agora? A partir daqui os lançamentos financeiros serão gerados.")) return;
    start(() => convertPreSaleAction(id));
  }
  function handleDelete() {
    if (!confirm("Excluir esta pré-venda? Ela não gerou nada no financeiro; será apenas removida.")) return;
    setError(null);
    start(async () => {
      const res = await deletePreSaleAction(id);
      if (!res.ok) {
        setError(res.error || "Não foi possível excluir a pré-venda.");
        return;
      }
      // Navega no cliente (mais confiável que redirect no servidor via transition).
      router.push("/vendas");
      router.refresh();
    });
  }

  return (
    <div className="print:hidden">
      <div className="flex flex-wrap items-center justify-end gap-2">
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
      {error ? (
        <p className="mt-2 text-right text-sm font-medium text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
