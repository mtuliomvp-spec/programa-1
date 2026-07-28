"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { setBeneficiaryParentAction } from "../actions";

type Option = { id: string; name: string };

/** Lado do vinculado: escolhe o "responsável" (outro beneficiário) a que se atrela. */
export default function BeneficiaryParentSelect({
  beneficiaryId,
  parents,
  currentParentId,
}: {
  beneficiaryId: string;
  parents: Option[];
  currentParentId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentParentId ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await setBeneficiaryParentAction(beneficiaryId, value || null);
      if (!r.ok) {
        setMsg({ tone: "err", text: r.error || "Não foi possível salvar." });
        return;
      }
      setMsg({ tone: "ok", text: value ? "Atrelado ao responsável." : "Vínculo removido." });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <label className="block text-sm font-medium text-slate-700">Responsável (atrelar a)</label>
      <p className="mb-2 mt-0.5 text-xs text-slate-500">
        Vincule este beneficiário a um responsável (ex.: caução em nome de outro sócio). É só
        agrupamento — não muda nenhum valor.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[240px]">
          <option value="">Sem responsável</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
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
