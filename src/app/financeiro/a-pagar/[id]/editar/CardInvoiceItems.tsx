"use client";

import { useRef, useState, useTransition, useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import { addCardItemAction, deleteCardItemAction, type CardItemFormState } from "./card-actions";

type Option = { id: string; label: string };

export type CardItemRow = {
  id: string;
  description: string;
  amount: number;
  structuralKey: string;
  who: string | null; // carro (Veículos) ou sócio (Capital)
};

const fluxoLabel: Record<string, string> = {
  ADMINISTRATIVO: "Administrativo",
  VEICULOS: "Veículos",
  CAPITAL: "Capital",
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Lançamentos da fatura do cartão dentro do título: lista tal qual a fatura,
 * cada linha com seu fluxo. O valor do título acompanha a soma automaticamente.
 */
export default function CardInvoiceItems({
  payableId,
  items,
  vehicles,
  beneficiaries,
  editable,
}: {
  payableId: string;
  items: CardItemRow[];
  vehicles: Option[];
  beneficiaries: Option[];
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(addCardItemAction, {} as CardItemFormState);
  const [flow, setFlow] = useState("ADMINISTRATIVO");
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const total = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Nenhum lançamento ainda — digite abaixo os itens da fatura (compra a compra, como no
          extrato do cartão).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Lançamento</th>
                <th className="py-2 pr-3">Fluxo</th>
                <th className="py-2 pr-3 text-right">Valor</th>
                {editable ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 text-slate-800">{i.description}</td>
                  <td className="py-2 pr-3">
                    <span className="text-slate-600">{fluxoLabel[i.structuralKey] || i.structuralKey}</span>
                    {i.who ? <span className="block text-xs text-slate-400">{i.who}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmt(i.amount)}</td>
                  {editable ? (
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => {
                          setDeleteError(null);
                          startDelete(async () => {
                            const r = await deleteCardItemAction(i.id);
                            if (!r.ok) setDeleteError(r.error || "Não foi possível excluir.");
                          });
                        }}
                        className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50"
                      >
                        Excluir
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-2 pr-3 font-semibold text-slate-900">Total da fatura</td>
                <td />
                <td className="py-2 pr-3 text-right font-black tabular-nums text-slate-900">{fmt(total)}</td>
                {editable ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {deleteError ? <p className="text-sm text-rose-600">{deleteError}</p> : null}

      {editable ? (
        <form
          ref={formRef}
          action={(fd) => {
            formAction(fd);
            // Mantém o fluxo escolhido e limpa os campos para digitação em série.
            formRef.current?.reset();
          }}
          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <input type="hidden" name="payableId" value={payableId} />
          <p className="mb-3 text-sm font-semibold text-slate-700">+ Adicionar lançamento</p>
          {state.error ? (
            <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Descrição (como na fatura)" required>
              <Input name="description" required placeholder="Ex: Posto Shell — combustível" />
            </Field>
            <Field label="Valor (R$)" required>
              <MoneyInput name="amount" required />
            </Field>
            <Field label="Fluxo" required>
              <Select name="structuralKey" value={flow} onChange={(e) => setFlow(e.target.value)}>
                <option value="ADMINISTRATIVO">Administrativo (despesa comum)</option>
                <option value="VEICULOS">Veículos</option>
                <option value="CAPITAL">Capital (conta de sócio)</option>
              </Select>
            </Field>
            {flow === "VEICULOS" ? (
              <Field label="Veículo (opcional)">
                <Select name="vehicleId" defaultValue="">
                  <option value="">Nenhum (custo geral de veículos)</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-slate-400">
                  Com um carro escolhido, o valor entra no custo do veículo (margem da venda).
                </p>
              </Field>
            ) : null}
            {flow === "CAPITAL" ? (
              <Field label="Sócio (beneficiário)" required>
                <Select name="capitalBeneficiaryId" defaultValue="" required>
                  <option value="">Selecione o sócio</option>
                  {beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </Select>
                <p className="mt-1 text-xs text-slate-400">
                  Vira RETIRADA do sócio quando a fatura for paga (não conta como despesa).
                </p>
              </Field>
            ) : null}
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Adicionando..." : "Adicionar lançamento"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-xs text-slate-400">
          Fatura paga — reverta a baixa para alterar os lançamentos.
        </p>
      )}
    </div>
  );
}
