import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * Serve o arquivo anexado a um combo — hoje o comprovante do borderô, que vale
 * por todos os títulos dele. Exige permissão de visualizar no Financeiro.
 * `?download=1` força baixar em vez de abrir no navegador.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/financeiro/combos/anexos/[id]">) {
  if (!(await userCan("financeiro", "visualizar"))) {
    return new NextResponse("Acesso negado", { status: 403 });
  }

  const { id } = await ctx.params;
  const att = await prisma.comboAttachment.findUnique({ where: { id } });
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
