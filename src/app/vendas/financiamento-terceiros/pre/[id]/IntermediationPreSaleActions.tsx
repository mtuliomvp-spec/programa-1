"use client";

import { useState, useTransition } from "react";
import { LinkButton } from "@/components/ui";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import { convertIntermediationAction, cancelIntermediationPreSaleAction } from "../../actions";

/**
 * Botões de ação da pré-venda de financiamento de terceiros com retorno visual
 * inconfundível: ao registrar/cancelar, mostra um overlay "processando" e
 * bloqueia toques repetidos até a operação concluir (navega sozinha).
 */
export default function IntermediationPreSaleActions({
  id,
  canRegister = true,
  canPreSale = true,
}: {
  id: string;
  canRegister?: boolean;
  canPreSale?: boolean;
}) {
  const [pending, start] = useTransition();
  const [runningLabel, setRunningLabel] = useState("Registrando a operação… aguarde. Não feche esta página.");

  function handleConvert() {
    if (!confirm("Concluir a operação agora? A partir daqui os lançamentos financeiros serão gerados.")) return;
    setRunningLabel("Registrando a operação… aguarde. Não feche esta página.");
    start(() => convertIntermediationAction(id));
  }
  function handleCancel() {
    if (!confirm("Cancelar esta pré-venda? Ela não gerou nada no financeiro; será apenas removida.")) return;
    setRunningLabel("Cancelando a pré-venda…");
    start(() => cancelIntermediationPreSaleAction(id));
  }

  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <ProcessingOverlay show={pending} label={runningLabel} />
      {canRegister ? (
        <button
          type="button"
          onClick={handleConvert}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {pending ? "Registrando…" : "✓ Registrar (concluir operação)"}
        </button>
      ) : null}
      {canPreSale ? (
        <LinkButton variant="secondary" href={`/vendas/financiamento-terceiros/novo?preSale=${id}`}>
          ✏️ Editar
        </LinkButton>
      ) : null}
      {canPreSale ? (
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          Cancelar pré-venda
        </button>
      ) : null}
    </div>
  );
}
