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
 * Garante uma AÇÃO específica numa PÁGINA (server component). Como
 * `requireModule`, mas para uma ação: manda para "/" se o usuário não tiver a
 * permissão. Usar no topo das páginas de formulário/ação (novo, editar) para
 * que o operador sem permissão não abra a tela nem por link direto.
 */
export async function requireAction(moduleKey: ModuleKey, action: string) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!can(user, moduleKey, action)) redirect("/");
  return user;
}

/**
 * Como `requireAction`, mas passa se o usuário tiver QUALQUER uma das
 * ações da lista (ex.: editar título permitido a `financeiro.criar` OU
 * `combos.criar`). Manda para "/" se não tiver nenhuma.
 */
export async function requireActionAny(pairs: [ModuleKey, string][]) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!pairs.some(([m, a]) => can(user, m, a))) redirect("/");
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

/**
 * Como `assertCan`, mas passa se o usuário tiver QUALQUER uma das ações da lista.
 * Lança (não redireciona) — para server actions dentro de try/catch.
 */
export async function assertCanAny(pairs: [ModuleKey, string][]) {
  const user = await getSessionUser();
  if (!user) throw new Error("Sessão expirada. Faça login novamente.");
  if (user.role !== "ADMIN") {
    const { getSystemLock, MAINTENANCE_MESSAGE } = await import("@/lib/system-lock");
    if ((await getSystemLock()).locked) throw new Error(MAINTENANCE_MESSAGE);
  }
  if (!pairs.some(([m, a]) => can(user, m, a))) {
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
    // O painel de cadastrar fornecedor (com busca de CNPJ) também aparece na
    // Nova solicitação de compra.
    ["compras", "criar"],
    ["compras", "aprovar"],
  ]);
}
