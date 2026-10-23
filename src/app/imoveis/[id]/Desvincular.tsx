"use client";

import { useRouter } from "next/navigation";
import ConfirmButton from "@/components/ConfirmButton";
import { desvincularContaImovelAction } from "../actions";

/** Tira a conta da ficha do imóvel (ela continua no financeiro). */
export default function Desvincular({ tipo, id }: { tipo: "recorrencia" | "titulo"; id: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      confirmLabel="Desvincular"
      question={
        tipo === "recorrencia"
          ? "Tirar esta recorrência (e os títulos dela) do imóvel? Nada muda no financeiro."
          : "Tirar este título do imóvel? Nada muda no financeiro."
      }
      onConfirm={async () => {
        await desvincularContaImovelAction({ tipo, id });
        router.refresh();
      }}
      className="text-xs text-slate-400 hover:text-rose-600 hover:underline"
    >
      desvincular
    </ConfirmButton>
  );
}
