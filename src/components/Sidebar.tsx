"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "@/lib/clsx";

const NAV_GROUPS: { title: string; items: { href: string; label: string; icon: string }[] }[] = [
  {
    title: "Visão geral",
    items: [{ href: "/", label: "Dashboard", icon: "📊" }],
  },
  {
    title: "Operação",
    items: [
      { href: "/estoque", label: "Estoque de veículos", icon: "🚗" },
      { href: "/vendas", label: "Vendas", icon: "🧾" },
      { href: "/pecas", label: "Peças", icon: "🔧" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/financeiro/a-pagar", label: "Contas a pagar", icon: "📤" },
      { href: "/financeiro/a-receber", label: "Contas a receber", icon: "📥" },
      { href: "/financeiro/fluxo-caixa", label: "Fluxo de caixa", icon: "💰" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { href: "/clientes", label: "Clientes", icon: "👤" },
      { href: "/fornecedores", label: "Fornecedores", icon: "🏭" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
          AV
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-slate-900">AutoVendas</p>
          <p className="text-xs text-slate-400">Gestão de seminovos</p>
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </p>
            <div className="mt-1.5 space-y-0.5">
              {group.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                    )}
                  >
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
