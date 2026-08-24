"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { simulate } from "@/lib/financing";
import {
  deleteFinancingRateAction,
  saveFinancingRateAction,
  toggleSimulatorAction,
  type RateFormState,
} from "./actions";

const vazio: RateFormState = {};

export type RateRow = {
  id: string;
  name: string;
  monthlyRate: number | null;
  maxInstallments: number;
  minDownPercent: number;
  bcbInstitution: string | null;
  bcbMonthlyRate: number | null;
  bcbReferenceDate: string | null;
  active: boolean;
};

function Aviso({ state }: { state: RateFormState }) {
  if (state.error) return <p className="text-sm font-medium text-rose-600">{state.error}</p>;
  if (state.success) return <p className="text-sm font-medium text-emerald-700">{state.success}</p>;
  return null;
}

/** Liga/desliga o simulador na vitrine. */
export function SimulatorToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant={on ? "secondary" : "primary"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await toggleSimulatorAction(!on);
          router.refresh();
        })
      }
    >
      {pending ? "Aguarde…" : on ? "Desligar simulador da vitrine" : "Ligar simulador na vitrine"}
    </Button>
  );
}

/** Cadastro/edição de uma financeira, com prévia da parcela enquanto digita. */
export function RateForm({ rate, onDone }: { rate?: RateRow; onDone?: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (prev: RateFormState, formData: FormData) => {
      const r = await saveFinancingRateAction(prev, formData);
      if (r.success) onDone?.();
      return r;
    },
    vazio,
  );
  const [taxa, setTaxa] = useState(rate?.monthlyRate != null ? String(rate.monthlyRate).replace(".", ",") : "");

  const previa = (() => {
    const n = Number(taxa.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return null;
    return simulate({ price: 50000, downPayment: 10000, months: 48, monthlyRatePercent: n });
  })();

  return (
    <form action={formAction} className="space-y-4">
      {rate ? <input type="hidden" name="id" value={rate.id} /> : null}
      <Aviso state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Financeira" required>
          <Input name="name" defaultValue={rate?.name || ""} placeholder="Ex.: C6 Bank" required />
        </Field>
        <Field label="Taxa da loja (% ao mês)">
          <Input
            name="monthlyRate"
            value={taxa}
            onChange={(e) => setTaxa(e.target.value)}
            inputMode="decimal"
            placeholder="Ex.: 1,79"
          />
          <span className="mt-1 block text-xs text-slate-500">
            Em branco, o simulador usa a taxa média do Banco Central (quando houver).
          </span>
        </Field>
        <Field label="Prazo máximo (parcelas)">
          <Input type="number" name="maxInstallments" min={1} max={120} defaultValue={rate?.maxInstallments ?? 48} />
        </Field>
        <Field label="Entrada mínima (%)">
          <Input type="number" name="minDownPercent" min={0} max={90} defaultValue={rate?.minDownPercent ?? 20} />
        </Field>
        <Field label="Nome no Banco Central (opcional)">
          <Input
            name="bcbInstitution"
            defaultValue={rate?.bcbInstitution || ""}
            placeholder="Ex.: BANCO C6 S.A."
          />
          <span className="mt-1 block text-xs text-slate-500">
            Usado para buscar a taxa oficial automaticamente.
          </span>
        </Field>
        <Field label="Situação">
          <Select name="active" defaultValue={rate ? String(rate.active) : "true"}>
            <option value="true">Ativa (aparece na vitrine)</option>
            <option value="false">Inativa</option>
          </Select>
        </Field>
      </div>

      {previa ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Exemplo com esta taxa: carro de {formatCurrency(50000)}, entrada de {formatCurrency(10000)} em 48×
          → <strong>{formatCurrency(previa.installment)}</strong> por mês ({previa.yearlyRatePercent.toFixed(2)}% ao
          ano).
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : rate ? "Salvar financeira" : "Cadastrar financeira"}
      </Button>
    </form>
  );
}

/** Linha da lista, com edição embutida. */
export function RateRowActions({ rate }: { rate: RateRow }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <div className="flex items-center gap-3 text-sm font-medium">
        <button type="button" onClick={() => setAberto((v) => !v)} className="text-blue-700 hover:underline">
          {aberto ? "Fechar" : "Editar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Excluir a financeira ${rate.name} do simulador?`)) return;
            start(async () => {
              await deleteFinancingRateAction(rate.id);
              router.refresh();
            });
          }}
          className="text-rose-600 hover:underline disabled:opacity-50"
        >
          Excluir
        </button>
      </div>
      {aberto ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <RateForm
            rate={rate}
            onDone={() => {
              setAberto(false);
              router.refresh();
            }}
          />
        </div>
      ) : null}
    </>
  );
}
