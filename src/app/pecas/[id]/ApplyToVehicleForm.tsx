"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { applyPartAction, type FormState } from "../actions";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";

type Vehicle = { id: string; label: string };

const CATEGORIAS = [
  { value: "MECANICA", label: "Mecânica" },
  { value: "PREPARACAO", label: "Preparação" },
  { value: "ESTETICA", label: "Estética" },
  { value: "FUNILARIA_PINTURA", label: "Funilaria / pintura" },
  { value: "OUTROS", label: "Outros" },
];

/**
 * Aplicar a peça num carro do estoque: o valor sai do almoxarifado e vira custo
 * do veículo. Não gera conta a pagar — a compra já foi lançada quando a peça
 * entrou no estoque.
 */
export default function ApplyToVehicleForm({
  partId,
  availableQuantity,
  costPrice,
  vehicles,
  cashboxDate,
}: {
  partId: string;
  availableQuantity: number;
  costPrice: number;
  vehicles: Vehicle[];
  /** Data do caixa aberto: o movimento é do dia do caixa, não de outro dia. */
  cashboxDate?: string | null;
}) {
  const [state, formAction, pending] = useActionState(applyPartAction, {} as FormState);
  const [quantity, setQuantity] = useState(1);

  if (availableQuantity <= 0) {
    return <p className="text-sm text-slate-500">Sem estoque disponível para aplicar.</p>;
  }
  if (vehicles.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nenhum veículo em estoque. Peça só pode ser aplicada em carro que ainda não foi vendido.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="partId" defaultValue={partId} />
      {state.error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      <Field label="Veículo do estoque" required>
        <Select name="vehicleId" defaultValue="" required>
          <option value="" disabled>
            Escolha o veículo…
          </option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantidade" required>
          <Input
            type="number"
            min={1}
            max={availableQuantity}
            name="quantity"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            required
          />
        </Field>
        {cashboxDate ? (
          <Field label="Data">
            {/* Travada na data do caixa aberto, como no lançamento do caixa. */}
            <input type="hidden" name="date" value={cashboxDate} />
            <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
              {formatDate(cashboxDate)}
              <span className="ml-2 text-xs text-slate-400">(caixa aberto)</span>
            </div>
          </Field>
        ) : (
          <Field label="Data" required>
            <Input type="date" name="date" defaultValue={toDateInputValue(new Date())} required />
          </Field>
        )}
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Custo lançado no veículo: <strong>{formatCurrency(quantity * costPrice)}</strong> (
        {quantity} un. × {formatCurrency(costPrice)}). Saem do estoque: {availableQuantity} →{" "}
        {Math.max(0, availableQuantity - quantity)} un. <strong>Não gera conta a pagar</strong> — a
        compra já foi lançada quando a peça entrou no almoxarifado.
      </p>

      <Field label="Categoria do custo">
        <Select name="category" defaultValue="MECANICA">
          {CATEGORIAS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Observações">
        <Textarea name="notes" rows={2} placeholder="Ex.: troca na revisão de entrega" />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Aplicando..." : "Aplicar no veículo"}
      </Button>
    </form>
  );
}
