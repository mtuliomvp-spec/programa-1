"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { converterSinalEmReembolsoAction } from "../actions";

/**
 * "Isto não é sinal, é reembolso de custo": o cliente pagou parte de um gasto
 * do carro (ex.: a transferência) e o valor foi lançado como sinal. Convertido,
 * ele sai da venda e do contrato e reduz o custo escolhido.
 */
export default function ConverterSinalReembolso({
  receivableId,
  vehicleId,
  amount,
  costs,
}: {
  receivableId: string;
  vehicleId: string;
  amount: number;
  costs: { id: string; description: string; amount: number }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [costId, setCostId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function escolher(id: string) {
    setCostId(id);
    const c = costs.find((x) => x.id === id);
    if (c) setDescricao(amount < c.amount ? `${c.description} (parte paga pelo cliente)` : c.description);
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-xs font-medium text-slate-500 hover:text-blue-700 hover:underline"
      >
        ↪ Não é sinal — é reembolso de custo
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
      <p className="text-xs text-slate-600">
        O cliente pagou <strong>{formatCurrency(amount)}</strong> de um gasto do carro. Convertido, o valor{" "}
        <strong>sai da venda e do contrato</strong> (não é abatido do preço) e <strong>reduz o custo</strong> escolhido.
        A conta, a data e o comprovante continuam os mesmos.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Custo reembolsado">
          <Select value={costId} onChange={(e) => escolher(e.target.value)}>
            <option value="">Outro (descrever)</option>
            {costs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.description} — {formatCurrency(c.amount)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descrição">
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: parte da transferência" />
        </Field>
      </div>
      {erro ? <p className="mt-2 text-xs text-rose-600">{erro}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          disabled={pending || !descricao.trim()}
          onClick={() =>
            start(async () => {
              setErro(null);
              const r = await converterSinalEmReembolsoAction({ receivableId, vehicleId, costId: costId || null, descricao });
              if (!r.ok) {
                setErro(r.error || "Não foi possível converter.");
                return;
              }
              setAberto(false);
              router.refresh();
            })
          }
        >
          {pending ? "Convertendo…" : "Converter em reembolso de custo"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
