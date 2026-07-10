import type { ModuleKey } from "@/lib/permissions";
import { hasModuleAccess } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  module?: ModuleKey;
  adminOnly?: boolean;
};

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Visão geral",
    items: [{ href: "/", label: "Dashboard", icon: "📊" }],
  },
  {
    title: "Operação",
    items: [
      { href: "/estoque", label: "Estoque de veículos", icon: "🚗", module: "estoque" },
      { href: "/vendas", label: "Vendas", icon: "🧾", module: "vendas" },
      { href: "/pecas", label: "Peças", icon: "🔧", module: "pecas" },
      { href: "/compras", label: "Solicitações de compra", icon: "🛒", module: "compras" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/financeiro/a-pagar", label: "Contas a pagar", icon: "📤", module: "financeiro" },
      { href: "/financeiro/a-receber", label: "Contas a receber", icon: "📥", module: "financeiro" },
      { href: "/financeiro/recorrentes", label: "Recorrentes", icon: "🔁", module: "financeiro" },
      { href: "/financeiro/livro-caixa", label: "Livro caixa", icon: "📒", module: "financeiro" },
      { href: "/financeiro/fluxo-caixa", label: "Fluxo de caixa", icon: "💰", module: "financeiro" },
      { href: "/financeiro/conciliacao", label: "Conciliação bancária", icon: "🏦", module: "financeiro" },
    ],
  },
  {
    title: "Administrativo",
    items: [
      { href: "/folha", label: "Folha de pagamento", icon: "👥", module: "administrativo" },
      { href: "/capital", label: "Capital dos sócios", icon: "💼", module: "administrativo" },
      { href: "/combustiveis", label: "Combustíveis", icon: "⛽", module: "administrativo" },
    ],
  },
  {
    title: "Relatórios",
    items: [
      { href: "/relatorios", label: "Central de relatórios", icon: "📈", module: "relatorios" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { href: "/clientes", label: "Clientes", icon: "👤", module: "cadastros" },
      { href: "/fornecedores", label: "Fornecedores", icon: "🏭", module: "cadastros" },
      { href: "/usuarios", label: "Usuários", icon: "🔐", adminOnly: true },
    ],
  },
];

export function isNavActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function navGroupsFor(user: { role: "ADMIN" | "OPERADOR"; permissions: string[] }) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.adminOnly) return user.role === "ADMIN";
      if (item.module) return hasModuleAccess(user, item.module);
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}
