"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";

/**
 * Abona (dispensa) a pendência da foto do cliente dos veículos vendidos
 * informados. Não apaga nada: só marca quando e quem abonou — se a foto for
 * anexada depois, ela vale normalmente. Permissão própria (antifraude).
 */
export async function abonarFotoClienteAction(
  vehicleIds: string[],
): Promise<{ ok: boolean; error?: string; abonados?: number }> {
  try {
    await assertCan("vendas", "abonarfoto");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const ids = [...new Set(vehicleIds.filter((id) => typeof id === "string" && id))].slice(0, 500);
  if (!ids.length) return { ok: false, error: "Nenhum veículo informado." };
  const user = await getSessionUser();
  const r = await prisma.vehicle.updateMany({
    where: { id: { in: ids }, status: "VENDIDO", fotoClienteAbonadaEm: null },
    data: { fotoClienteAbonadaEm: new Date(), fotoClienteAbonadaPor: user?.name ?? null },
  });
  // Revalidar a PRÓPRIA tela faz a resposta da action já trazer a lista nova
  // (sem router.refresh, que aqui era cancelado e deixava o botão parado).
  revalidatePath("/pendencias");
  revalidatePath("/estoque");
  revalidatePath("/");
  return { ok: true, abonados: r.count };
}
