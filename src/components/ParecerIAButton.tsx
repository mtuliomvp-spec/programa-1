"use client";

import { useState, useTransition } from "react";
import { gerarParecerGlobalAction, gerarParecerVeiculoAction } from "@/app/relatorios/parecer-ia/actions";

/**
 * Botão de gerar o Parecer IA (geral ou por veículo). Chama a server action,
 * recebe o parecer estruturado e renderiza o PDF no navegador. Sem chave de IA
 * configurada, mostra o aviso apontando para os Parâmetros.
 */
export default function ParecerIAButton({
  mode,
  vehicleId,
  variant = "primary",
}: {
  mode: "global" | "vehicle";
  vehicleId?: string;
  variant?: "primary" | "secondary";
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "err" | "warn"; text: string } | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      try {
        if (mode === "vehicle" && vehicleId) {
          const r = await gerarParecerVeiculoAction(vehicleId);
          if (!r.ok) {
            setMsg({ tone: r.notConfigured ? "warn" : "err", text: r.error });
            return;
          }
          const { renderVehicleParecerPdf } = await import("@/lib/parecer-pdf");
          await renderVehicleParecerPdf(r.parecer, r.meta, r.vehicleLabel, r.plate);
        } else {
          const r = await gerarParecerGlobalAction();
          if (!r.ok) {
            setMsg({ tone: r.notConfigured ? "warn" : "err", text: r.error });
            return;
          }
          const { renderGlobalParecerPdf } = await import("@/lib/parecer-pdf");
          await renderGlobalParecerPdf(r.parecer, r.meta);
        }
      } catch (e) {
        setMsg({ tone: "err", text: e instanceof Error ? e.message : "Não foi possível gerar o parecer." });
      }
    });
  }

  const base =
    variant === "primary"
      ? "bg-indigo-600 text-white hover:bg-indigo-500"
      : "border border-slate-300 text-slate-700 hover:bg-slate-50";

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${base}`}
      >
        {pending ? "Analisando com IA…" : "🛡️ Gerar Parecer IA"}
      </button>
      {msg ? (
        <p
          className={`mt-2 text-sm ${msg.tone === "warn" ? "text-amber-700" : "text-rose-600"}`}
        >
          {msg.text}
          {msg.tone === "warn" ? (
            <>
              {" "}
              <a href="/parametros" className="font-medium underline">
                Abrir Parâmetros
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
