"use client";

import { useTransition } from "react";
import { toggleEmployeeAction } from "./actions";

export default function EmployeeRowActions({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const message = active
          ? "Desligar este funcionário? Ele deixa de entrar nas próximas folhas."
          : "Reativar este funcionário?";
        if (confirm(message)) startTransition(() => toggleEmployeeAction(id, !active));
      }}
      className={`text-sm font-medium hover:underline disabled:opacity-50 ${
        active ? "text-rose-600" : "text-blue-700"
      }`}
    >
      {active ? "Desligar" : "Reativar"}
    </button>
  );
}
