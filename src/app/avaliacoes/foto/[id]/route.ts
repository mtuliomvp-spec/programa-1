import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Serve a foto de uma avaliação (bytes no banco). Só para autenticados. */
export async function GET(req: NextRequest, ctx: RouteContext<"/avaliacoes/foto/[id]">) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Acesso negado", { status: 403 });

  const { id } = await ctx.params;
  const photo = await prisma.vehicleAppraisalPhoto.findUnique({ where: { id } });
  if (!photo) return new NextResponse("Não encontrado", { status: 404 });

  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  const safeName = photo.filename.replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(photo.data), {
    status: 200,
    headers: {
      "content-type": photo.mimeType || "application/octet-stream",
      "content-disposition": `${disposition}; filename="${safeName}"`,
      "content-length": String(photo.size),
      "cache-control": "private, no-store",
    },
  });
}
