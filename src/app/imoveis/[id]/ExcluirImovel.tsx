"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ConfirmButton from "@/components/ConfirmButton";
import { excluirImovelAction } from "../actions";

export default function ExcluirImovel({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <span>
      <ConfirmButton
        confirmLabel="Excluir"
        question={`Excluir "${nome}" e todos os documentos dele? As contas (títulos e recorrências) continuam no financeiro, só sem o vínculo.`}
        onConfirm={async () => {
          const r = await excluirImovelAction(id);
          if (!r.ok) return setErro(r.error || "Não foi possível excluir.");
          router.push("/imoveis");
        }}
        className="text-sm font-medium text-rose-600 hover:underline"
      >
        Excluir imóvel
      </ConfirmButton>
      {erro ? <span className="ml-2 text-xs text-rose-600">{erro}</span> : null}
    </span>
  );
}
