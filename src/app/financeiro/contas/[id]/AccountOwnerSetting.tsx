"use client";

import { useState, useTransition } from "react";
import { Button, Card, CardHeader, Field, Select } from "@/components/ui";
import { setAccountOwnerAction } from "../actions";

type Beneficiary = { id: string; name: string };

/**
 * Define/troca o titular verdadeiro da conta (sócio dono, que opera a conta
 * como se fosse da MVP). Informativo — não altera saldos nem a contabilidade.
 */
export default function AccountOwnerSetting({
  id,
  initialOwnerId,
  beneficiaries,
}: {
  id: string;
  initialOwnerId: string | null;
  beneficiaries: Beneficiary[];
}) {
  const [ownerId, setOwnerId] = useState(initialOwnerId ?? "");
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function save() {
    setMsg(null);
    startSave(async () => {
      const r = await setAccountOwnerAction(id, ownerId || null);
      if (!r.ok) {
        setMsg({ tone: "err", text: r.error || "Não foi possível salvar." });
        return;
      }
      setMsg({ tone: "ok", text: "Titular da conta atualizado." });
    });
  }

  return (
    <Card className="mb-4">
      <CardHeader
        title="Titular da conta"
        description="Quando a conta é de um sócio mas opera como se fosse da MVP, identifique aqui o dono verdadeiro. Só informativo — não altera saldos nem a equação patrimonial."
      />
      <div className="flex flex-wrap items-end gap-3 p-5">
        <div className="w-64">
          <Field label="Dono verdadeiro">
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">MVP Veículos (empresa)</option>
              {beneficiaries.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        {msg ? (
          <p className={`text-sm ${msg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>
        ) : null}
      </div>
    </Card>
  );
}
