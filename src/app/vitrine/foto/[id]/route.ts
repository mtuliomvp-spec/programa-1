import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Foto PÚBLICA da vitrine. Serve duas origens, sempre só do que está no ar:
 *
 *  • anexo FOTO_VEICULO de veículo postado (published) e ainda em estoque;
 *  • foto de AVALIAÇÃO postada como repasse (published).
 *
 * Qualquer outro anexo → 404 (documentos e fotos de cliente continuam atrás do
 * login em /anexos/[id]). Os ids das duas tabelas são cuid, então não há
 * ambiguidade entre elas.
 */
export async function GET(_req: Request, ctx: RouteContext<"/vitrine/foto/[id]">) {
  const { id } = await ctx.params;
  const att = await prisma.vehicleAttachment.findUnique({
    where: { id },
    include: { vehicle: { select: { published: true, status: true } } },
  });
  if (att) {
    if (att.kind !== "FOTO_VEICULO" || !att.vehicle.published || att.vehicle.status !== "ESTOQUE") {
      return new NextResponse("Não encontrado", { status: 404 });
    }
    return imagem(att.data, att.mimeType, att.size);
  }

  const foto = await prisma.vehicleAppraisalPhoto.findUnique({
    where: { id },
    include: { appraisal: { select: { published: true } } },
  });
  if (!foto || !foto.appraisal.published) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  return imagem(foto.data, foto.mimeType, foto.size);
}

function imagem(data: Uint8Array, mimeType: string, size: number) {
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "content-type": mimeType || "image/jpeg",
      "content-length": String(size),
      "cache-control": "public, max-age=3600",
    },
  });
}
