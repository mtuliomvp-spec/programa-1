"use client";

import { useTransition } from "react";
import { toggleCostCenterAction } from "./actions";

export default function ToggleCostCenterButton({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => toggleCostCenterAction(id, !active))}
      className={`text-sm font-medium hover:underline disabled:opacity-50 ${
        active ? "text-slate-500" : "text-blue-700"
      }`}
    >
      {active ? "Encerrar" : "Reabrir"}
    </button>
  );
}
