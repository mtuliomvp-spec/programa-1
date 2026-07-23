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
    items: [{ href: "/", label: "Dashboard", icon: "📊", module: "dashboard" }],
  },
  {
    title: "Operação",
    items: [
      { href: "/estoque", label: "Estoque de veículos", icon: "🚗", module: "estoque" },
      { href: "/vendas", label: "Vendas", icon: "🧾", module: "vendas" },
      {
        href: "/vendas/financiamento-terceiros",
        label: "Financiamento de terceiros",
        icon: "🤝",
        module: "vendas",
      },
      { href: "/pecas", label: "Peças", icon: "🔧", module: "pecas" },
      { href: "/compras", label: "Solicitações de compra", icon: "🛒", module: "compras" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/financeiro/contas", label: "Contas e caixas", icon: "💳", module: "financeiro" },
      { href: "/financeiro/a-pagar", label: "Contas a pagar", icon: "📤", module: "financeiro" },
      { href: "/financeiro/a-receber", label: "Contas a receber", icon: "📥", module: "financeiro" },
      { href: "/financeiro/financiamentos", label: "Financiamentos", icon: "🏦", module: "financeiro" },
      { href: "/financeiro/recorrentes", label: "Recorrentes", icon: "🔁", module: "financeiro" },
      { href: "/financeiro/livro-caixa", label: "Livro caixa", icon: "📒", module: "financeiro" },
      { href: "/financeiro/fluxo-caixa", label: "Fluxo de caixa", icon: "💰", module: "financeiro" },
      { href: "/financeiro/lucro-prejuizo", label: "Lucro / Prejuízo", icon: "📈", module: "financeiro" },
      { href: "/financeiro/conciliacao", label: "Conciliação bancária", icon: "🏦", module: "financeiro" },
      { href: "/financeiro/fechamento", label: "Fechamento mensal", icon: "📋", module: "financeiro" },
    ],
  },
  {
    title: "Administrativo",
    items: [
      { href: "/folha", label: "Folha de pagamento", icon: "👥", module: "administrativo" },
      { href: "/capital", label: "Capital dos sócios", icon: "💼", module: "administrativo" },
      { href: "/combustiveis", label: "Combustíveis", icon: "⛽", module: "administrativo" },
      { href: "/consorcios", label: "Consórcios", icon: "🎯", module: "administrativo" },
      { href: "/centros-custo", label: "Centros de custo", icon: "🏗️", module: "administrativo" },
    ],
  },
  {
    title: "Relatórios",
    items: [
      { href: "/relatorios", label: "Central de relatórios", icon: "📈", module: "relatorios" },
      { href: "/relatorios/parecer-ia", label: "Parecer IA", icon: "🛡️", module: "relatorios" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { href: "/clientes", label: "Clientes", icon: "👤", module: "cadastros" },
      { href: "/fornecedores", label: "Fornecedores", icon: "🏭", module: "cadastros" },
      { href: "/usuarios", label: "Usuários", icon: "🔐", adminOnly: true },
      { href: "/usuarios/perfis", label: "Perfis de acesso", icon: "🧩", adminOnly: true },
      { href: "/parametros", label: "Parâmetros da empresa", icon: "⚙️", adminOnly: true },
      { href: "/sistema", label: "Sistema (backup / zerar)", icon: "🖥️", adminOnly: true },
    ],
  },
];

export function isNavActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type NavUser = { role: "ADMIN" | "OPERADOR"; permissions: string[] };

function canSeeItem(user: NavUser, item: NavItem) {
  if (item.adminOnly) return user.role === "ADMIN";
  if (item.module) return hasModuleAccess(user, item.module);
  return true;
}

export function navGroupsFor(user: NavUser) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSeeItem(user, item)),
  })).filter((group) => group.items.length > 0);
}

/**
 * Primeira tela que o usuário pode abrir (na ordem do menu). Serve de destino
 * pós-login e de redirecionamento quando alguém sem acesso ao painel cai no "/".
 * Se nada estiver liberado, devolve null (o chamador trata).
 */
export function firstAccessibleHref(user: NavUser): string | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.href !== "/" && canSeeItem(user, item)) return item.href;
    }
  }
  return null;
}
