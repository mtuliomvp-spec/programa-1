export const NAV_GROUPS: {
  title: string;
  items: { href: string; label: string; icon: string }[];
}[] = [
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
    title: "Relatórios",
    items: [
      { href: "/relatorios", label: "Central de relatórios", icon: "📈" },
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

export function isNavActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
