"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "@/lib/clsx";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/estoque", label: "Estoque" },
  { href: "/vendas", label: "Vendas" },
  { href: "/pecas", label: "Peças" },
  { href: "/financeiro/a-pagar", label: "A pagar" },
  { href: "/financeiro/a-receber", label: "A receber" },
  { href: "/financeiro/fluxo-caixa", label: "Fluxo de caixa" },
  { href: "/clientes", label: "Clientes" },
  { href: "/fornecedores", label: "Fornecedores" },
];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
      {LINKS.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium",
              active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
