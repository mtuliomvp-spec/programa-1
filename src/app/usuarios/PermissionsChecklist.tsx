"use client";

import { useMemo, useState } from "react";
import { MODULES, ALL_PERMISSIONS } from "@/lib/permissions";

/**
 * Modelos prontos de permissão (um clique preenche o conjunto típico do cargo).
 * O admin pode ajustar depois marcando/desmarcando à mão.
 */
const PRESETS: { key: string; label: string; permissions: string[] }[] = [
  {
    key: "vendedor",
    label: "Vendedor",
    // Vê estoque e vendas, cria/edita pré-venda, cuida dos cadastros de clientes
    // e vê relatórios. NÃO registra/cancela venda nem acessa financeiro/admin.
    permissions: [
      "estoque.visualizar",
      "vendas.visualizar",
      "vendas.prevenda",
      "cadastros.visualizar",
      "cadastros.criar",
      "cadastros.editar",
      "relatorios.visualizar",
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    // Cuida de todo o financeiro (lançar, pagar, receber, contas, conciliação),
    // vê estoque/vendas/cadastros, o resultado dos veículos e os relatórios.
    permissions: [
      "dashboard.visualizar",
      "estoque.visualizar",
      "estoque.lucro",
      "vendas.visualizar",
      "cadastros.visualizar",
      "relatorios.visualizar",
      "financeiro.visualizar",
      "financeiro.criar",
      "financeiro.pagar",
      "financeiro.receber",
      "financeiro.desconto",
      "financeiro.corrigirdata",
      "financeiro.contas",
      "financeiro.conciliar",
      "compras.visualizar",
    ],
  },
];

export default function PermissionsChecklist({ defaults }: { defaults?: string[] }) {
  // Estado inicial: expande o formato antigo (só "modulo") para as ações e,
  // sem defaults (novo usuário), começa apenas com "visualizar" de cada módulo.
  const initial = useMemo(() => {
    const set = new Set<string>();
    for (const perm of ALL_PERMISSIONS) {
      const [moduleKey, acao] = perm.split(".");
      const on = defaults
        ? defaults.includes(perm) || defaults.includes(moduleKey)
        : acao === "visualizar";
      if (on) set.add(perm);
    }
    return set;
  }, [defaults]);

  const [checked, setChecked] = useState<Set<string>>(initial);

  const toggle = (perm: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });

  const applyPreset = (permissions: string[]) => setChecked(new Set(permissions));
  const clearAll = () => setChecked(new Set());

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-slate-500">Modelos:</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.permissions)}
            className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={clearAll}
          className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          Limpar tudo
        </button>
      </div>

      {MODULES.map((m) => (
        <ModuleGroup key={m.key} module={m} checked={checked} onToggle={toggle} />
      ))}
      <p className="pt-1 text-xs text-slate-500">
        Marque as ações que este perfil pode fazer em cada módulo. &quot;Visualizar&quot; libera o
        acesso ao módulo; as demais liberam ações específicas.
      </p>
    </div>
  );
}

function ModuleGroup({
  module: m,
  checked,
  onToggle,
}: {
  module: (typeof MODULES)[number];
  checked: Set<string>;
  onToggle: (perm: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const marcadas = m.acoes.filter((a) => checked.has(`${m.key}.${a.acao}`)).length;

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
        {m.acoes.map((a) => {
          const perm = `${m.key}.${a.acao}`;
          return (
            <label key={a.acao} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="permissions"
                value={perm}
                checked={checked.has(perm)}
                onChange={() => onToggle(perm)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {a.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}
