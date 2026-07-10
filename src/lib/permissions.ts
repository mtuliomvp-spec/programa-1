/**
 * Módulos do sistema para controle de acesso por usuário.
 * Administradores sempre acessam tudo; operadores só o que estiver
 * marcado em suas permissões (gerenciado na tela Usuários).
 */

export const MODULES = [
  { key: "estoque", label: "Estoque de veículos" },
  { key: "vendas", label: "Vendas" },
  { key: "pecas", label: "Peças" },
  { key: "compras", label: "Solicitações de compra" },
  { key: "financeiro", label: "Financeiro (contas, caixa, conciliação)" },
  { key: "administrativo", label: "Administrativo (folha, capital, combustíveis)" },
  { key: "relatorios", label: "Relatórios" },
  { key: "cadastros", label: "Cadastros (clientes e fornecedores)" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const ALL_MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

export function hasModuleAccess(
  user: { role: "ADMIN" | "OPERADOR"; permissions: string[] },
  moduleKey: ModuleKey,
): boolean {
  if (user.role === "ADMIN") return true;
  return user.permissions.includes(moduleKey);
}
