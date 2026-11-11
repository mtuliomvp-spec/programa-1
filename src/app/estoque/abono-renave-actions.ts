"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";

/**
 * Abona (dispensa) as pendências do Renave dos veículos VENDIDOS informados —
 * caso típico: vendidos antes da implantação, quando já não há entrada nem
 * saída a registrar. Não apaga nenhum dado do Renave: só marca quando e quem
 * abonou, e o selo do estoque passa a "Renave abonado". `desfazer` volta a
 * cobrar.
 */
export async function abonarRenaveAction(
  vehicleIds: string[],
  desfazer = false,
): Promise<{ ok: boolean; error?: string; alterados?: number }> {
  try {
    await assertCan("estoque", "abonarrenave");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const ids = [...new Set(vehicleIds.filter((id) => typeof id === "string" && id))].slice(0, 500);
  if (!ids.length) return { ok: false, error: "Nenhum veículo informado." };
  const user = await getSessionUser();
  const r = desfazer
    ? await prisma.vehicle.updateMany({
        where: { id: { in: ids }, renaveAbonadoEm: { not: null } },
        data: { renaveAbonadoEm: null, renaveAbonadoPor: null },
      })
    : await prisma.vehicle.updateMany({
        where: { id: { in: ids }, status: "VENDIDO", renaveAbonadoEm: null },
        data: { renaveAbonadoEm: new Date(), renaveAbonadoPor: user?.name ?? null },
      });
  if (!desfazer && r.count === 0) {
    return { ok: false, error: "Só veículo vendido pode ter o Renave abonado (ou ele já estava abonado)." };
  }
  revalidatePath("/estoque");
  for (const id of ids.slice(0, 50)) revalidatePath(`/estoque/${id}`);
  revalidatePath("/estoque/renave");
  return { ok: true, alterados: r.count };
}
