"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { resizeImageToJpeg } from "@/lib/image-resize";
import RecurringForm, { type RecurringInitial } from "../novo/RecurringForm";
import { readRecurringDocumentAction, type LeituraRecorrencia } from "../actions";

type Option = { id: string; name: string };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Cria a recorrência a partir do documento: a IA lê o boleto (ou o carnê
 * inteiro), a tela mostra o que encontrou e o formulário normal de recorrência
 * abre já preenchido — quem grava é a action de sempre, depois da conferência.
 */
export default function ImportRecurringDoc({
  suppliers,
  customers,
  beneficiaries,
  despesaCategories,
  receitaCategories,
}: {
  suppliers: Option[];
  customers: Option[];
  beneficiaries: Option[];
  despesaCategories: string[];
  receitaCategories: string[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [leitura, setLeitura] = useState<LeituraRecorrencia | null>(null);

  async function ler() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setLeitura(null);
    setBusy(true);
    try {
      const prepared = await resizeImageToJpeg(file);
      const fd = new FormData();
      fd.set("file", prepared);
      setLeitura(await readRecurringDocumentAction(fd));
    } finally {
      setBusy(false);
    }
  }

  const p = leitura?.proposta;
  const initial: RecurringInitial | undefined = p
    ? {
        kind: "PAGAR",
        description: p.description,
        amount: p.amount,
        structuralKey: "ADMINISTRATIVO",
        periodicidade: p.periodicidade,
        dayOfMonth: p.dayOfMonth,
        intervalDays: p.intervalDays,
        anticipateToBusinessDay: p.anticipateToBusinessDay,
        cardInvoice: false,
        categoryLabel: "Despesa operacional",
        supplierName: p.supplierName,
        customerId: null,
        capitalBeneficiaryId: null,
        startDate: p.startDate,
        endDate: p.endDate,
        notes: p.notes,
      }
    : undefined;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <p className="text-sm font-semibold text-slate-800">🤖 Ler o documento</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Anexe o boleto ou o carnê (PDF ou foto). A IA lê valor, vencimento e beneficiário; num carnê
          com várias parcelas ela também descobre o dia da repetição e até quando ela vai.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
          <Button type="button" onClick={ler} disabled={busy}>
            {busy ? "Lendo o documento…" : "Ler documento"}
          </Button>
        </div>
        {busy ? (
          <p className="mt-2 text-xs text-slate-500">
            A IA está lendo — um carnê com muitas parcelas pode levar um minuto. Não feche a página.
          </p>
        ) : null}
        {leitura?.error ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠️ {leitura.error}
          </p>
        ) : null}
      </div>

      {leitura?.ok && leitura.parcelas.length > 0 ? (
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-800">
            O que a IA encontrou ({leitura.parcelas.length}{" "}
            {leitura.parcelas.length === 1 ? "boleto" : "parcelas"})
          </p>
          <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {leitura.parcelas.map((parc, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-slate-700">
                  {parc.amount != null ? brl(parc.amount) : "valor não lido"}
                  {parc.descricao ? <span className="ml-2 text-xs text-slate-500">{parc.descricao}</span> : null}
                </span>
                <span className="tabular-nums text-xs text-slate-500">
                  {parc.dueDate ? dataBr(parc.dueDate) : "sem vencimento"}
                </span>
              </li>
            ))}
          </ul>
          {leitura.avisos.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {leitura.avisos.map((a, i) => (
                <li key={i} className="text-xs text-amber-800">
                  ⚠️ {a}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {initial ? (
        <div className="rounded-xl border border-slate-200 p-5">
          <p className="mb-1 text-sm font-semibold text-slate-800">Confira e salve</p>
          <p className="mb-4 text-xs text-slate-500">
            Os campos vieram do documento. Ajuste o que precisar — nada foi gravado ainda.
          </p>
          <RecurringForm
            key={`${initial.description}-${initial.amount}-${initial.startDate}`}
            suppliers={suppliers}
            customers={customers}
            beneficiaries={beneficiaries}
            despesaCategories={despesaCategories}
            receitaCategories={receitaCategories}
            initial={initial}
          />
        </div>
      ) : null}
    </div>
  );
}
