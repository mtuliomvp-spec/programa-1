"use client";

import { useActionState, type ReactNode } from "react";
import type { EstadoPlataforma } from "./actions";

/** Formulário do painel da plataforma: mostra o erro/ok da ação e trava o botão. */
export default function FormPlataforma({
  acao,
  botao,
  enviando = "Salvando…",
  children,
  variante = "primary",
}: {
  acao: (estado: EstadoPlataforma, form: FormData) => Promise<EstadoPlataforma>;
  botao: string;
  enviando?: string;
  children?: ReactNode;
  variante?: "primary" | "secondary" | "danger";
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const cor =
    variante === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-500"
      : variante === "secondary"
        ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        : "bg-blue-700 text-white hover:bg-blue-600";
  return (
    <form action={enviar} className="space-y-3">
      {children}
      {estado.erro ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{estado.erro}</p> : null}
      {estado.ok ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{estado.ok}</p> : null}
      <button
        type="submit"
        disabled={pendente}
        className={`inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-50 ${cor}`}
      >
        {pendente ? enviando : botao}
      </button>
    </form>
  );
}
