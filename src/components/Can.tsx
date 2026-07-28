import "server-only";
import type { ReactNode } from "react";
import { userCan } from "@/lib/guards";
import type { ModuleKey } from "@/lib/permissions";

/**
 * Mostra os filhos só se o usuário logado tiver a permissão `modulo.acao`.
 * Server component (usa guards `server-only`): serve para esconder controles
 * de ação renderizados no servidor — botões do PageHeader/EmptyState,
 * LinkButton, DeleteRowButton, <form> inline, etc.
 *
 * Ex.: <Can module="estoque" action="criar"><LinkButton .../></Can>
 *
 * Administrador passa sempre (o `can()` já libera ADMIN).
 */
export default async function Can({
  module,
  action,
  children,
  fallback = null,
}: {
  module: ModuleKey;
  action: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = await userCan(module, action);
  return <>{allowed ? children : fallback}</>;
}
