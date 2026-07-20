import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Foto PÚBLICA da vitrine: serve apenas anexos FOTO_VEICULO de veículos
 * postados (published) e ainda em estoque. Qualquer outro anexo → 404
 * (documentos e fotos de cliente continuam atrás do login em /anexos/[id]).
 */
export async function GET(_req: Request, ctx: RouteContext<"/vitrine/foto/[id]">) {
  const { id } = await ctx.params;
  const att = await prisma.vehicleAttachment.findUnique({
    where: { id },
    include: { vehicle: { select: { published: true, status: true } } },
  });
  if (
    !att ||
    att.kind !== "FOTO_VEICULO" ||
    !att.vehicle.published ||
    att.vehicle.status !== "ESTOQUE"
  ) {
    return new NextResponse("Não encontrado", { status: 404 });
  }

  return new NextResponse(new Uint8Array(att.data), {
    status: 200,
    headers: {
      "content-type": att.mimeType || "image/jpeg",
      "content-length": String(att.size),
      "cache-control": "public, max-age=3600",
    },
  });
}
