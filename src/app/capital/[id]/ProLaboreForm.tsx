"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { setProLaboreAction } from "../actions";

/** Edita o valor do pró-labore combinado do sócio (usado no fechamento mensal). */
export default function ProLaboreForm({
  beneficiaryId,
  initial,
}: {
  beneficiaryId: string;
  initial: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(initial ?? 0));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function save() {
    setMsg(null);
    const parsed = Number(String(value).replace(/\./g, "").replace(",", "."));
    start(async () => {
      const r = await setProLaboreAction(beneficiaryId, parsed);
      if (!r.ok) {
        setMsg({ tone: "err", text: r.error || "Não foi possível salvar." });
        return;
      }
      setMsg({ tone: "ok", text: "Pró-labore salvo!" });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <label className="block text-sm font-medium text-slate-700">
        Pró-labore combinado (R$/mês)
      </label>
      <p className="mb-2 mt-0.5 text-xs text-slate-500">
        Valor creditado a este sócio quando você fechar o mês (com contrapartida na empresa).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0,00"
          className="max-w-[160px]"
        />
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Salvando..." : "Salvar pró-labore"}
        </Button>
      </div>
      {msg ? (
        <p className={`mt-2 text-sm font-medium ${msg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
