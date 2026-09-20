"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LinkButton } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import ConfirmButton from "@/components/ConfirmButton";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import { convertPreSaleAction, deletePreSaleAction } from "../actions";

/**
 * Ações da pré-venda. A confirmação é um bloco na tela, não o `confirm` do
 * navegador: no atalho instalado no celular o diálogo nativo não abre, o clique
 * volta como "cancelar" e o botão parece morto.
 */
export default function PreSaleActions({
  id,
  editHref,
  canRegister = true,
  canPreSale = true,
}: {
  id: string;
  editHref: string;
  canRegister?: boolean;
  canPreSale?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [runningLabel, setRunningLabel] = useState("Registrando a venda… aguarde. Não feche esta página.");
  const router = useRouter();

  function handleConvert() {
    setRunningLabel("Registrando a venda… aguarde. Não feche esta página.");
    start(() => convertPreSaleAction(id));
  }
  function handleDelete() {
    setError(null);
    setRunningLabel("Excluindo a pré-venda…");
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
      <ProcessingOverlay show={pending} label={runningLabel} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <LinkButton variant="secondary" href="/vendas">
          ← Vendas
        </LinkButton>
        {canPreSale ? (
          <LinkButton variant="secondary" href={editHref}>
            ✏️ Editar
          </LinkButton>
        ) : null}
        <LinkButton variant="secondary" href={`/vendas/pre-vendas/${id}/contrato`}>
          📄 Contrato de venda
        </LinkButton>
        <PrintButton />
        {canPreSale ? (
          <ConfirmButton
            question="Excluir esta pré-venda? Ela não gerou nada no financeiro; será apenas removida."
            confirmLabel="Excluir a pré-venda"
            cancelLabel="Manter"
            onConfirm={handleDelete}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-300 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {pending ? "..." : "Excluir"}
          </ConfirmButton>
        ) : null}
        {canRegister ? (
          <ConfirmButton
            question="Registrar a venda agora? A partir daqui os lançamentos financeiros serão gerados."
            confirmLabel="Registrar a venda"
            onConfirm={handleConvert}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {pending ? "Registrando..." : "✓ Registrar venda"}
          </ConfirmButton>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-right text-sm font-medium text-rose-600">{error}</p>
      ) : null}
    </div>
  );
}
