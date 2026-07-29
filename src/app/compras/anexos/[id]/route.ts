import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * Serve o arquivo anexado a uma solicitação de compra (foto, PDF, orçamento…)
 * guardado no banco. Exige permissão de visualizar em Compras. `?download=1`
 * força baixar em vez de abrir no navegador.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/compras/anexos/[id]">) {
  if (!(await userCan("compras", "visualizar"))) {
    return new NextResponse("Acesso negado", { status: 403 });
  }

  const { id } = await ctx.params;
  const att = await prisma.purchaseRequestAttachment.findUnique({ where: { id } });
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
