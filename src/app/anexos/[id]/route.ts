import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Serve o arquivo de um anexo de veículo (ex.: Comunicação de venda) guardado no
 * banco. Só para usuários autenticados. `?download=1` força baixar em vez de
 * abrir no navegador.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/anexos/[id]">) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Acesso negado", { status: 403 });

  const { id } = await ctx.params;
  const att = await prisma.vehicleAttachment.findUnique({ where: { id } });
  if (!att) return new NextResponse("Não encontrado", { status: 404 });

  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  const safeName = att.filename.replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(att.data), {
    status: 200,
    headers: {
      "content-type": att.mimeType || "application/octet-stream",
      "content-disposition": `${disposition}; filename="${safeName}"`,
      "content-length": String(att.size),
      "cache-control": "private, no-store",
    },
  });
}
