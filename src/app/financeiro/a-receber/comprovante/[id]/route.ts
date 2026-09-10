import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * Serve o comprovante do recebimento de um título a receber — o PDF do depósito
 * ou o print do extrato. Endereçado pelo id do TÍTULO (é um por título), para a
 * tela não precisar carregar o id do anexo. `?download=1` força baixar.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/financeiro/a-receber/comprovante/[id]">) {
  if (!(await userCan("financeiro", "visualizar"))) {
    return new NextResponse("Acesso negado", { status: 403 });
  }

  const { id } = await ctx.params;
  const att = await prisma.receivableAttachment.findFirst({
    where: { receivableId: id, kind: "COMPROVANTE" },
    orderBy: { createdAt: "desc" },
  });
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
