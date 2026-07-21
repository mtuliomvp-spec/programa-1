import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Bloqueio do sistema (modo manutenção, estilo Agrasty): interruptor global
 * gravado no servidor (company_settings.systemLocked). Enquanto ativo, só
 * administradores navegam; os demais veem o aviso de manutenção e TODAS as
 * ações protegidas por assertCan são recusadas (defesa no servidor — não dá
 * para burlar pelo navegador).
 */

export type SystemLockState = { locked: boolean; by: string | null; at: Date | null };

export async function getSystemLock(): Promise<SystemLockState> {
  const c = await prisma.companySettings.findUnique({
    where: { id: "company" },
    select: { systemLocked: true, systemLockedBy: true, systemLockedAt: true },
  });
  return { locked: !!c?.systemLocked, by: c?.systemLockedBy ?? null, at: c?.systemLockedAt ?? null };
}

export const MAINTENANCE_MESSAGE =
  "Este sistema encontra-se em manutenção. Aguarde a liberação pelo administrador.";
