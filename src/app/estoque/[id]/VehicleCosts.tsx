"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  addVehicleCostAction,
  deleteVehicleCostAction,
  detachVehicleCostAction,
  setVehicleCostCapitalBeneficiaryAction,
  type CostFormState,
} from "../actions";
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
  beneficiaries = [],
  attachedBeneficiaryId = null,
}: {
  vehicleId: string;
  costs: Cost[];
  sold: boolean;
  canManage?: boolean;
  canOpenPayable?: boolean;
  /** Sócios ativos: permitem custear um custo pós-venda pelo capital do sócio. */
  beneficiaries?: { id: string; name: string }[];
  /** Sócio ao qual o pós-venda está ATRELADO (custeio automático), se houver. */
  attachedBeneficiaryId?: string | null;
}) {
  const [showForm, setShowForm] = useState(false);
  // Pós-venda custeado pelo capital de um sócio (só faz sentido com o carro
  // vendido): a despesa vira aporte do sócio, sem tocar no caixa.
  const [payFromCapital, setPayFromCapital] = useState(false);
  // Vínculo persistente: enquanto atrelado a um sócio, TODO custo de pós-venda
  // já entra custeado por ele (o servidor força isso; aqui é só o controle/aviso).
  const [attachedId, setAttachedId] = useState<string | null>(attachedBeneficiaryId);
  const [pickBeneficiary, setPickBeneficiary] = useState("");
  const [attaching, startAttach] = useTransition();
  const [attachError, setAttachError] = useState<string | null>(null);
  const attachedName = beneficiaries.find((b) => b.id === attachedId)?.name ?? null;
  const attached = Boolean(attachedId);

  function setAttachment(next: string | null) {
    setAttachError(null);
    startAttach(async () => {
      const r = await setVehicleCostCapitalBeneficiaryAction(vehicleId, next);
      if (!r.ok) {
        setAttachError(r.error || "Não foi possível salvar.");
        return;
      }
      setAttachedId(next);
      setPickBeneficiary("");
    });
  }
  const [expanded, setExpanded] = useState<string | null>(null);
  // Confirmação in-app (o window.confirm nativo é suprimido em navegadores de
  // celular/in-app, deixando o Excluir "morto").
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<CostFormState, FormData>(
    async (prev, formData) => {
      const result = await addVehicleCostAction(prev, formData);
      if (result.success) {
        setShowForm(false);
        setPayFromCapital(false);
      }
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
                      onClick={() => setConfirmingId((v) => (v === c.id ? null : c.id))}
                      className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              </div>
              {confirmingId === c.id ? (
                c.payableId ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                    <p className="text-xs text-rose-700">
                      Este custo tem uma <strong>conta a pagar vinculada</strong>. O que fazer com ela?
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => {
                          setConfirmingId(null);
                          startDelete(() => detachVehicleCostAction(c.id, vehicleId));
                        }}
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        {deleting ? "Removendo..." : "Remover do veículo (mantém a conta a pagar)"}
                      </button>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => {
                          setConfirmingId(null);
                          startDelete(() => deleteVehicleCostAction(c.id, vehicleId));
                        }}
                        className="rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                      >
                        {deleting ? "Excluindo..." : "Excluir custo e conta a pagar"}
                      </button>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => setConfirmingId(null)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Voltar
                      </button>
                    </div>
                    <p className="text-[11px] text-rose-600/80">
                      &quot;Remover do veículo&quot;: o custo sai do carro e o título volta ao Contas a
                      pagar (fluxo Administrativo). &quot;Excluir&quot;: some dos dois lugares.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                    <span className="text-xs text-rose-700">Excluir este custo?</span>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => {
                        setConfirmingId(null);
                        startDelete(() => deleteVehicleCostAction(c.id, vehicleId));
                      }}
                      className="rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                    >
                      {deleting ? "Excluindo..." : "Sim, excluir"}
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => setConfirmingId(null)}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Voltar
                    </button>
                  </div>
                )
              ) : null}
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
        {sold && beneficiaries.length > 0 ? (
          <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
            {attached ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-indigo-900">
                  🔗 Pós-venda atrelado ao capital de <strong>{attachedName ?? "sócio"}</strong> — todo
                  custo lançado aqui é custeado por ele (aporte, sem mexer no caixa).
                </p>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    disabled={attaching}
                    className="text-xs text-slate-500 hover:underline disabled:opacity-50"
                  >
                    {attaching ? "..." : "desatrelar"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[12rem]">
                  <p className="mb-1 text-sm text-indigo-900">
                    <strong>Atrelar o pós-venda ao capital de um sócio</strong> — enquanto atrelado,
                    todo custo lançado no carro vira aporte dele (sem mexer no caixa).
                  </p>
                  {canManage ? (
                    <Select
                      value={pickBeneficiary}
                      onChange={(e) => setPickBeneficiary(e.target.value)}
                    >
                      <option value="">Selecione o sócio</option>
                      {beneficiaries.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                </div>
                {canManage ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAttachment(pickBeneficiary)}
                    disabled={attaching || !pickBeneficiary}
                  >
                    {attaching ? "..." : "Atrelar"}
                  </Button>
                ) : null}
              </div>
            )}
            {attachError ? (
              <p className="mt-2 text-sm font-medium text-rose-600">{attachError}</p>
            ) : null}
          </div>
        ) : null}
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
              {!(payFromCapital || attached) ? (
                <Field label="Parcelas (IPVA, multas...)">
                  <Input name="installments" type="number" min={1} max={60} defaultValue={1} />
                </Field>
              ) : null}
            </div>
            {attached ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                🔗 Este custo será custeado pelo capital de <strong>{attachedName ?? "sócio"}</strong>{" "}
                (veículo atrelado): vira <strong>aporte</strong> dele, sem mexer no caixa. Para pagar
                pelo caixa, desatrele o veículo acima.
              </div>
            ) : sold && beneficiaries.length > 0 ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                <label className="flex items-start gap-2 text-sm text-indigo-900">
                  <input
                    type="checkbox"
                    checked={payFromCapital}
                    onChange={(e) => setPayFromCapital(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    <strong>Pagar com o capital de um sócio</strong> — o sócio bancou esta despesa
                    com recurso próprio. Ela entra no resultado como pós-venda e vira{" "}
                    <strong>aporte</strong> do sócio (sem mexer no caixa da loja).
                  </span>
                </label>
                {payFromCapital ? (
                  <div className="mt-2">
                    <Field label="Sócio (beneficiário do capital)" required>
                      <Select name="capitalBeneficiaryId" defaultValue="" required>
                        <option value="">Selecione o sócio</option>
                        {beneficiaries.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : null}
              </div>
            ) : null}
            {!(payFromCapital || attached) ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="alreadyPaid" value="true" className="h-4 w-4 rounded border-slate-300" />
                Já paguei no ato (senão, entra como conta a pagar; o pagamento é dado depois por uma conta financeira)
              </label>
            ) : null}
            {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Lançar custo"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowForm(false);
                  setPayFromCapital(false);
                }}
              >
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
