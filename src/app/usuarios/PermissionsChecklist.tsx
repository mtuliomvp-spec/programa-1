"use client";

import { useState } from "react";
import { MODULES } from "@/lib/permissions";

export default function PermissionsChecklist({ defaults }: { defaults?: string[] }) {
  // Marcado quando a permissão granular existe OU quando há o módulo inteiro
  // (formato antigo). Sem defaults (novo usuário): marca só "visualizar".
  const isChecked = (moduleKey: string, acao: string) => {
    if (!defaults) return acao === "visualizar";
    return defaults.includes(`${moduleKey}.${acao}`) || defaults.includes(moduleKey);
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {MODULES.map((m) => (
        <ModuleGroup key={m.key} module={m} isChecked={isChecked} />
      ))}
      <p className="pt-1 text-xs text-slate-500">
        Marque as ações que este usuário pode fazer em cada módulo. &quot;Visualizar&quot; libera o
        acesso ao módulo; as demais liberam ações específicas.
      </p>
    </div>
  );
}

function ModuleGroup({
  module: m,
  isChecked,
}: {
  module: (typeof MODULES)[number];
  isChecked: (moduleKey: string, acao: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const marcadas = m.acoes.filter((a) => isChecked(m.key, a.acao)).length;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-slate-800">{m.label}</span>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          {marcadas}/{m.acoes.length}
          <span aria-hidden>{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {/* Mantém os checkboxes sempre no DOM (só escondidos) para serem enviados
          mesmo com o grupo recolhido. */}
      <div className={`space-y-1.5 border-t border-slate-100 px-3 py-2 ${open ? "" : "hidden"}`}>
        {m.acoes.map((a) => (
          <label key={a.acao} className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="permissions"
              value={`${m.key}.${a.acao}`}
              defaultChecked={isChecked(m.key, a.acao)}
              className="h-4 w-4 rounded border-slate-300"
            />
            {a.label}
          </label>
        ))}
      </div>
    </div>
  );
}
