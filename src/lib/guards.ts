import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { hasModuleAccess, type ModuleKey } from "@/lib/permissions";

/** Garante que o usuário logado pode acessar o módulo; senão volta ao dashboard. */
export async function requireModule(moduleKey: ModuleKey) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasModuleAccess(user, moduleKey)) redirect("/");
  return user;
}
