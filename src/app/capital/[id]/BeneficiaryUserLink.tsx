"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { linkBeneficiaryUserAction } from "../actions";

type Option = { id: string; name: string };

/** Vincula o beneficiário a um usuário do sistema (somente admin). */
export default function BeneficiaryUserLink({
  beneficiaryId,
  users,
  currentUserId,
}: {
  beneficiaryId: string;
  users: Option[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentUserId ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await linkBeneficiaryUserAction(beneficiaryId, value || null);
      if (!r.ok) {
        setMsg({ tone: "err", text: r.error || "Não foi possível vincular." });
        return;
      }
      setMsg({ tone: "ok", text: value ? "Usuário vinculado! Os nomes ficam iguais." : "Vínculo removido." });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <label className="block text-sm font-medium text-slate-700">Usuário vinculado</label>
      <p className="mb-2 mt-0.5 text-xs text-slate-500">
        Ligue este beneficiário ao login do sócio. Ao vincular, o nome passa a ser o do usuário.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[240px]">
          <option value="">Sem vínculo</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Salvando..." : "Salvar vínculo"}
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
