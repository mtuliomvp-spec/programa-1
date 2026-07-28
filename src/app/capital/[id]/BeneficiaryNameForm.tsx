"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { renameBeneficiaryAction } from "../actions";

/** Edita o nome do beneficiário (sincroniza com o usuário vinculado, se houver). */
export default function BeneficiaryNameForm({
  beneficiaryId,
  initial,
  linked,
}: {
  beneficiaryId: string;
  initial: string;
  linked?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await renameBeneficiaryAction(beneficiaryId, value);
      if (!r.ok) {
        setMsg({ tone: "err", text: r.error || "Não foi possível salvar." });
        return;
      }
      setMsg({ tone: "ok", text: "Nome salvo!" });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <label className="block text-sm font-medium text-slate-700">Nome do beneficiário</label>
      <p className="mb-2 mt-0.5 text-xs text-slate-500">
        {linked
          ? "Vinculado a um usuário — o nome é o mesmo nos dois."
          : "Como aparece no capital, no caixa e nos relatórios."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nome"
          className="max-w-[240px]"
        />
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Salvando..." : "Salvar nome"}
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
