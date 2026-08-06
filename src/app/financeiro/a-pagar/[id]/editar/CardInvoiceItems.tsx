"use client";

import { useRef, useState, useTransition, useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import {
  addCardItemAction,
  updateCardItemAction,
  deleteCardItemAction,
  type CardItemFormState,
} from "./card-actions";

type Option = { id: string; label: string };

export type CardItemRow = {
  id: string;
  description: string;
  amount: number;
  structuralKey: string;
  vehicleId: string | null;
  capitalBeneficiaryId: string | null;
  who: string | null; // carro (Veículos) ou sócio (Capital)
};

const fluxoLabel: Record<string, string> = {
  ADMINISTRATIVO: "Administrativo",
  VEICULOS: "Veículos",
  CAPITAL: "Capital",
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Campos de fluxo compartilhados entre adicionar e editar. */
function FlowFields({
  flow,
  setFlow,
  vehicles,
  beneficiaries,
  defaultVehicleId,
  defaultBeneficiaryId,
}: {
  flow: string;
  setFlow: (v: string) => void;
  vehicles: Option[];
  beneficiaries: Option[];
  defaultVehicleId?: string | null;
  defaultBeneficiaryId?: string | null;
}) {
  return (
    <>
      <Field label="Fluxo" required>
        <Select name="structuralKey" value={flow} onChange={(e) => setFlow(e.target.value)}>
          <option value="ADMINISTRATIVO">Administrativo (despesa comum)</option>
          <option value="VEICULOS">Veículos</option>
          <option value="CAPITAL">Capital (conta de sócio)</option>
        </Select>
      </Field>
      {flow === "VEICULOS" ? (
        <Field label="Veículo (opcional)">
          <Select name="vehicleId" defaultValue={defaultVehicleId ?? ""}>
            <option value="">Nenhum — entra como Administrativo</option>
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
          <Select name="capitalBeneficiaryId" defaultValue={defaultBeneficiaryId ?? ""} required>
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
    </>
  );
}

/** Formulário inline de edição de um lançamento. */
function EditItemForm({
  item,
  vehicles,
  beneficiaries,
  onClose,
}: {
  item: CardItemRow;
  vehicles: Option[];
  beneficiaries: Option[];
  onClose: () => void;
}) {
  const [flow, setFlow] = useState(item.structuralKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) =>
        start(async () => {
          const r = await updateCardItemAction(fd);
          if (r.error) setError(r.error);
          else onClose();
        })
      }
      className="rounded-xl border border-blue-200 bg-blue-50/50 p-4"
    >
      <input type="hidden" name="itemId" value={item.id} />
      <p className="mb-3 text-sm font-semibold text-slate-700">✏️ Editar lançamento</p>
      {error ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Descrição" required>
          <Input name="description" required defaultValue={item.description} />
        </Field>
        <Field label="Valor (R$)" required>
          <MoneyInput name="amount" required defaultValue={item.amount} />
        </Field>
        <FlowFields
          flow={flow}
          setFlow={setFlow}
          vehicles={vehicles}
          beneficiaries={beneficiaries}
          defaultVehicleId={item.vehicleId}
          defaultBeneficiaryId={item.capitalBeneficiaryId}
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-white disabled:opacity-50"
        >
          Cancelar
        </button>
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar lançamento"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Lançamentos da fatura do cartão dentro do título: lista tal qual a fatura,
 * cada linha com seu fluxo, com edição e exclusão por linha. O valor do título
 * acompanha a soma automaticamente.
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
  const [editingId, setEditingId] = useState<string | null>(null);
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
                <tr key={i.id} className="border-b border-slate-100 align-top">
                  {editingId === i.id ? (
                    <td colSpan={editable ? 4 : 3} className="py-3">
                      <EditItemForm
                        item={i}
                        vehicles={vehicles}
                        beneficiaries={beneficiaries}
                        onClose={() => setEditingId(null)}
                      />
                    </td>
                  ) : (
                    <>
                      <td className="py-2 pr-3 text-slate-800">{i.description}</td>
                      <td className="py-2 pr-3">
                        <span className="text-slate-600">{fluxoLabel[i.structuralKey] || i.structuralKey}</span>
                        {i.who ? <span className="block text-xs text-slate-400">{i.who}</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{fmt(i.amount)}</td>
                      {editable ? (
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError(null);
                                setEditingId(i.id);
                              }}
                              className="text-sm font-medium text-blue-700 hover:underline"
                            >
                              Editar
                            </button>
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
                          </div>
                        </td>
                      ) : null}
                    </>
                  )}
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
            <FlowFields flow={flow} setFlow={setFlow} vehicles={vehicles} beneficiaries={beneficiaries} />
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
