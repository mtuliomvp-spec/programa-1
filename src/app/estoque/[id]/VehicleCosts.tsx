"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { addVehicleCostAction, deleteVehicleCostAction, type CostFormState } from "../actions";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { VEHICLE_COST_CATEGORY_LABEL } from "@/lib/labels";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import type { CategoriaCustoVeiculo } from "@prisma/client";

type Cost = {
  id: string;
  description: string;
  category: CategoriaCustoVeiculo;
  amount: number;
  date: Date;
  postSale?: boolean;
  notes?: string | null;
  payableId?: string | null;
  payableStatus?: "PENDENTE" | "PAGO" | "ATRASADO" | null;
  // Outro custo deste veículo tem o MESMO valor — possível lançamento em dobro.
  duplicateSuspect?: boolean;
  // Custo de solicitação de compra cuja solicitação/título foram excluídos na
  // raiz: ficou órfão no veículo e deve ser excluído.
  orphan?: boolean;
  // Recomendação no par duplicado (manual × solicitação de compra vivos):
  // "excluir" = este é o manual duplicado; "manter" = este veio da solicitação.
  dupAdvice?: "excluir" | "manter" | null;
};

export default function VehicleCosts({
  vehicleId,
  costs,
  sold,
  canManage = true,
  canOpenPayable = false,
}: {
  vehicleId: string;
  costs: Cost[];
  sold: boolean;
  canManage?: boolean;
  canOpenPayable?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<CostFormState, FormData>(
    async (prev, formData) => {
      const result = await addVehicleCostAction(prev, formData);
      if (result.success) setShowForm(false);
      return result;
    },
    {},
  );
  const [deleting, startDelete] = useTransition();

  return (
    <div>
      {costs.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">
          Nenhum custo lançado. Registre preparação, documentação, mecânica etc. para
          calcular a margem real do veículo.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {costs.map((c) => (
            <li key={c.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {c.payableId && canOpenPayable ? (
                    <Link
                      href={`/financeiro/a-pagar/${c.payableId}/ordem`}
                      className="block truncate text-sm font-medium text-blue-700 hover:underline"
                      title="Abrir os detalhes do título (ordem de pagamento)"
                    >
                      {c.description}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => (v === c.id ? null : c.id))}
                      className="block max-w-full truncate text-left text-sm font-medium text-slate-800 hover:text-blue-700 hover:underline"
                      title="Ver detalhes do custo"
                    >
                      {c.description}
                    </button>
                  )}
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    {formatDate(c.date)}
                    <Badge>{VEHICLE_COST_CATEGORY_LABEL[c.category]}</Badge>
                    {c.postSale ? <Badge tone="danger">Pós-venda</Badge> : null}
                    {c.payableStatus === "PENDENTE" || c.payableStatus === "ATRASADO" ? (
                      <Badge tone={c.payableStatus === "ATRASADO" ? "danger" : "warning"}>
                        {c.payableStatus === "ATRASADO" ? "Pagamento atrasado" : "A pagar"}
                      </Badge>
                    ) : null}
                    {c.orphan ? (
                      <span
                        className="inline-flex items-center rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white"
                        title="A solicitação de compra que gerou este custo foi excluída e o título não existe mais. Exclua ESTE custo — o lançamento correto é o outro de mesmo valor."
                      >
                        🗑️ Órfão — excluir este
                      </span>
                    ) : c.dupAdvice === "excluir" ? (
                      <span
                        className="inline-flex items-center rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white"
                        title="Duplicado do título da solicitação de compra de mesmo valor. Exclua ESTE (lançamento manual) e mantenha o da solicitação, que tem a trilha/anexos da compra."
                      >
                        🗑️ Duplicado — excluir este
                      </span>
                    ) : c.dupAdvice === "manter" ? (
                      <span
                        className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                        title="Este veio da solicitação de compra (raiz formal, com trilha e anexos). Mantenha este e exclua o lançamento manual duplicado de mesmo valor."
                      >
                        ✔ Manter este (da solicitação)
                      </span>
                    ) : c.duplicateSuspect ? (
                      <span
                        className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700"
                        title="Outro custo deste veículo tem o mesmo valor — confira se não foi lançado em dobro (custo manual + solicitação de compra)."
                      >
                        ⚠️ Possível duplicado
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">
                    {formatCurrency(c.amount)}
                  </span>
                  {(!sold || c.postSale) && canManage ? (
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => {
                        if (confirm("Excluir este custo? A conta a pagar vinculada também será removida.")) {
                          startDelete(() => deleteVehicleCostAction(c.id, vehicleId));
                        }
                      }}
                      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>
              {expanded === c.id ? (
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <p><strong>Descrição:</strong> {c.description}</p>
                  <p><strong>Data:</strong> {formatDate(c.date)} · <strong>Categoria:</strong> {VEHICLE_COST_CATEGORY_LABEL[c.category]} · <strong>Valor:</strong> {formatCurrency(c.amount)}</p>
                  {c.notes ? <p><strong>Observações:</strong> {c.notes}</p> : null}
                  {c.orphan ? (
                    <p className="font-semibold text-rose-600">
                      A solicitação de compra que gerou este custo foi excluída — o título não existe mais. Este custo
                      ficou órfão e deve ser excluído (use o botão Excluir).
                    </p>
                  ) : (
                    <p className="text-slate-400">
                      {c.payableId
                        ? "Custo com conta a pagar vinculada."
                        : "Custo manual, sem título vinculado (pago no ato)."}
                    </p>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className={`border-t border-slate-100 px-5 py-4 ${canManage ? "" : "hidden"}`}>
        {sold && !showForm ? (
          <p className="mb-2 text-xs text-slate-500">
            Veículo vendido. Novos custos entram como <strong>pós-venda</strong> (não mexem na
            margem da venda; aparecem no Lucro/Prejuízo como pós-venda).
          </p>
        ) : null}
        {showForm ? (
          <form action={formAction} className="space-y-3">
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Descrição" required>
                <Input name="description" placeholder="Ex.: Troca de pneus" required />
              </Field>
              <Field label="Categoria" required>
                <Select name="category" defaultValue="PREPARACAO">
                  {Object.entries(VEHICLE_COST_CATEGORY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valor (R$)" required>
                <Input name="amount" type="number" step="0.01" min="0.01" required />
              </Field>
              <Field label="Data" required>
                <Input name="date" type="date" defaultValue={toDateInputValue(new Date())} required />
              </Field>
              <Field label="Parcelas (IPVA, multas...)">
                <Input name="installments" type="number" min={1} max={60} defaultValue={1} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="alreadyPaid" value="true" className="h-4 w-4 rounded border-slate-300" />
              Já paguei no ato (senão, entra como conta a pagar; o pagamento é dado depois por uma conta financeira)
            </label>
            {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Lançar custo"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setShowForm(true)}>
            {sold ? "+ Lançar custo pós-venda" : "+ Lançar custo"}
          </Button>
        )}
      </div>
    </div>
  );
}
