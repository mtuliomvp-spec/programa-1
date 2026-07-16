"use client";

import { useState, useTransition } from "react";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { updateFinancerTaxAction } from "../actions";

export default function AccountFinancerSettings({
  id,
  initialPercent,
}: {
  id: string;
  initialPercent: number;
}) {
  const [percent, setPercent] = useState(String(initialPercent ?? 0));
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function save() {
    setMsg(null);
    startSave(async () => {
      const r = await updateFinancerTaxAction(id, Number(percent));
      if (!r.ok) {
        setMsg({ tone: "err", text: r.error || "Não foi possível salvar." });
        return;
      }
      setMsg({ tone: "ok", text: "Desconto de impostos atualizado." });
    });
  }

  return (
    <Card className="mb-4">
      <CardHeader
        title="Financeira — retorno"
        description="Percentual de imposto que a financeira retém sobre o retorno (a loja recebe o líquido)."
      />
      <div className="flex flex-wrap items-end gap-3 p-5">
        <div className="w-40">
          <Field label="Desconto de impostos (%)">
            <Input
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </Field>
        </div>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        {msg ? (
          <p
            className={`text-sm font-medium ${
              msg.tone === "ok" ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {msg.text}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
