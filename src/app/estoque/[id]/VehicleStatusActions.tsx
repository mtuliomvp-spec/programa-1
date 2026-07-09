"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { setVehicleStatusAction } from "../actions";

export default function VehicleStatusActions({ id, status }: { id: string; status: "ESTOQUE" | "RESERVADO" }) {
  const [pending, startTransition] = useTransition();

  function setStatus(next: "ESTOQUE" | "RESERVADO") {
    startTransition(() => setVehicleStatusAction(id, next));
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">
        Status atual: <span className="font-medium text-slate-800">{status === "ESTOQUE" ? "Em estoque" : "Reservado"}</span>
      </p>
      {status === "ESTOQUE" ? (
        <Button variant="secondary" disabled={pending} onClick={() => setStatus("RESERVADO")} className="w-full">
          Marcar como reservado
        </Button>
      ) : (
        <Button variant="secondary" disabled={pending} onClick={() => setStatus("ESTOQUE")} className="w-full">
          Voltar para estoque
        </Button>
      )}
    </div>
  );
}
