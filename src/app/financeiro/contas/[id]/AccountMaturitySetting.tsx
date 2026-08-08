"use client";

import { useState, useTransition } from "react";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { setAccountMaturityAction } from "../actions";
import { maturityStatus, daysToMaturity } from "@/lib/status";
import { formatDate } from "@/lib/format";

/**
 * Vencimento da aplicação: até quando o dinheiro rende nesta conta.
 *
 * Fica aqui (e não no cadastro de conta) porque o sistema não tem formulário de
 * EDIÇÃO de conta — só de criação. Sem este ajuste, as contas de aplicação que
 * já existem não teriam como receber a data.
 */
export default function AccountMaturitySetting({
  id,
  initialMaturity,
}: {
  id: string;
  /** Data atual em yyyy-mm-dd, ou string vazia quando não informada. */
  initialMaturity: string;
}) {
  const [date, setDate] = useState(initialMaturity);
  const [saved, setSaved] = useState(initialMaturity);
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const status = maturityStatus(saved ? new Date(`${saved}T12:00:00.000Z`) : null);
  const savedDate = saved ? new Date(`${saved}T12:00:00.000Z`) : null;

  function save() {
    setMsg(null);
    startSave(async () => {
      const r = await setAccountMaturityAction(id, date);
      if (!r.ok) {
        setMsg({ tone: "err", text: r.error || "Não foi possível salvar." });
        return;
      }
      setSaved(date);
      setMsg({ tone: "ok", text: date ? "Vencimento atualizado." : "Vencimento removido." });
    });
  }

  return (
    <Card className="mb-4">
      <CardHeader
        title="Vencimento da aplicação"
        description="Até quando o dinheiro rende nesta conta. Ao renovar a aplicação, atualize a data aqui — o sistema avisa antes de vencer, no card das contas e no painel inicial."
      />
      <div className="flex flex-wrap items-end gap-3 p-5">
        <div className="w-48">
          <Field label="Vence em">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        {msg ? (
          <p
            className={`text-sm font-medium ${msg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}
          >
            {msg.text}
          </p>
        ) : null}
      </div>
      <div className="border-t border-slate-100 px-5 py-3 text-sm">
        {status === "sem-data" ? (
          <p className="text-slate-500">
            Sem vencimento informado. Se esta aplicação tem prazo, informe a data — é o que evita o
            dinheiro ficar parado sem render depois de vencida.
          </p>
        ) : status === "vencido" ? (
          <p className="font-medium text-rose-600">
            ⚠ Venceu em {formatDate(savedDate!)} — reaplique para o dinheiro voltar a render.
          </p>
        ) : status === "proximo" ? (
          <p className="font-medium text-amber-700">
            ⏳ Vence em {formatDate(savedDate!)} ({daysToMaturity(savedDate!)} dia(s)).
          </p>
        ) : (
          <p className="text-slate-600">Rendendo até {formatDate(savedDate!)}.</p>
        )}
      </div>
    </Card>
  );
}
