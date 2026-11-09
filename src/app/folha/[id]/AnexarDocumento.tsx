"use client";

import { useRef, useState, useTransition } from "react";
import { anexarDocumentoFolhaAction } from "../actions";

/**
 * Anexa ou troca um documento de férias/rescisão já lançadas: o recibo (ou
 * TRCT) da contabilidade ou o comprovante bancário de quem pagou por fora.
 */
export default function AnexarDocumento({
  tipo,
  campo,
  id,
  tem,
}: {
  tipo: "ferias" | "rescisao";
  campo: "recibo" | "comprovante";
  id: string;
  tem: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const nome = campo === "comprovante" ? "comprovante" : tipo === "ferias" ? "recibo" : "TRCT";
  return (
    <span className="inline-flex flex-col items-end">
      <input
        ref={ref}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (!arquivo) return;
          const fd = new FormData();
          fd.set("tipo", tipo);
          fd.set("campo", campo);
          fd.set("id", id);
          fd.set("arquivo", arquivo);
          iniciar(async () => {
            const r = await anexarDocumentoFolhaAction(fd);
            if (r.error) setErro(r.error);
            else window.location.assign(`${window.location.pathname}?ok=${encodeURIComponent(r.ok ?? "Anexado.")}`);
          });
        }}
      />
      <button
        type="button"
        disabled={pendente}
        onClick={() => ref.current?.click()}
        className="whitespace-nowrap text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
      >
        {pendente ? "Anexando…" : tem ? `Trocar ${nome}` : `📎 Anexar ${nome}`}
      </button>
      {erro ? <span className="mt-1 max-w-[220px] text-right text-xs text-rose-600">{erro}</span> : null}
    </span>
  );
}
