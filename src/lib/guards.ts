import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { can, hasModuleAccess, type ModuleKey } from "@/lib/permissions";

/** Garante que o usuário logado pode acessar o módulo; senão volta ao dashboard. */
export async function requireModule(moduleKey: ModuleKey) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasModuleAccess(user, moduleKey)) redirect("/");
  return user;
}

/**
 * Garante uma AÇÃO específica dentro de um módulo (ex.: vendas.registrar).
 * Lança Error com mensagem amigável — para usar em server actions dentro de
 * try/catch (não redireciona). Admin passa sempre.
 */
export async function assertCan(moduleKey: ModuleKey, action: string) {
  const user = await getSessionUser();
  if (!user) throw new Error("Sessão expirada. Faça login novamente.");
  // Bloqueio do sistema (modo manutenção): recusa ações de não-admins.
  if (user.role !== "ADMIN") {
    const { getSystemLock, MAINTENANCE_MESSAGE } = await import("@/lib/system-lock");
    if ((await getSystemLock()).locked) throw new Error(MAINTENANCE_MESSAGE);
  }
  if (!can(user, moduleKey, action)) {
    throw new Error("Você não tem permissão para esta ação.");
  }
  return user;
}

/** Versão não-lançável: true se o usuário logado pode a ação. */
export async function userCan(moduleKey: ModuleKey, action: string): Promise<boolean> {
  const user = await getSessionUser();
  return !!user && can(user, moduleKey, action);
}

/** True se o usuário logado tem QUALQUER uma das ações da lista (uma leitura só). */
export async function userCanAny(pairs: [ModuleKey, string][]): Promise<boolean> {
  const user = await getSessionUser();
  return !!user && pairs.some(([m, a]) => can(user, m, a));
}

/**
 * Pode usar as consultas-auxiliares de formulário (CEP, CNPJ, pessoa por
 * documento, placa): qualquer permissão de criar/editar que leve a um dos
 * formulários que as utilizam (cadastros, estoque ou vendas). Admin sempre.
 */
export async function canUseFormLookup(): Promise<boolean> {
  return userCanAny([
    ["cadastros", "criar"],
    ["cadastros", "editar"],
    ["estoque", "criar"],
    ["estoque", "editar"],
    ["vendas", "prevenda"],
    ["vendas", "registrar"],
  ]);
}
