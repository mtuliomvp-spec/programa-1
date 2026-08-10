"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { createComboAction } from "./actions";

export default function NewComboForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function create() {
    setMsg(null);
    if (!name.trim()) {
      setMsg("Informe um nome.");
      return;
    }
    start(async () => {
      const r = await createComboAction(name);
      if (!r.ok || !r.id) {
        setMsg(r.error || "Não foi possível criar.");
        return;
      }
      router.push(`/financeiro/combos/${r.id}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            create();
          }
        }}
        placeholder="Nome do combo (ex.: Contas do Papai - julho)"
        className="h-9 max-w-xs"
      />
      <Button className="h-9" disabled={pending} onClick={create}>
        ➕ Novo combo
      </Button>
      {msg ? <p className="w-full text-xs text-rose-600">{msg}</p> : null}
    </div>
  );
}
