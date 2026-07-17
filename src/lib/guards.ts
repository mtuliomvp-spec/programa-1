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
