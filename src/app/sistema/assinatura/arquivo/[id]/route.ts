import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Serve o comprovante de uma mensalidade ou a via assinada do contrato
 * (bytes no banco). Armazenamento privado: administrador da loja (leitura) e
 * Super Admin. Nunca fica público.
 * `?tipo=contrato` busca a via assinada; sem isso, o comprovante do pagamento.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/sistema/assinatura/arquivo/[id]">) {
  const user = await getSessionUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return new NextResponse("Acesso negado", { status: 403 });
  }

  const { id } = await ctx.params;
  const tipo = req.nextUrl.searchParams.get("tipo");
  const baixar = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";

  if (tipo === "contrato") {
    const doc = await prisma.subscriptionContract.findUnique({ where: { id } });
    if (!doc) return new NextResponse("Não encontrado", { status: 404 });
    return new NextResponse(new Uint8Array(doc.data), {
      status: 200,
      headers: {
        "content-type": doc.mimeType || "application/octet-stream",
        "content-disposition": `${baixar}; filename="${doc.filename.replace(/["\r\n]/g, "")}"`,
        "content-length": String(doc.size),
        "cache-control": "private, no-store",
      },
    });
  }

  const pag = await prisma.subscriptionPayment.findUnique({ where: { id } });
  if (!pag?.proofData) return new NextResponse("Não encontrado", { status: 404 });
  return new NextResponse(new Uint8Array(pag.proofData), {
    status: 200,
    headers: {
      "content-type": pag.proofMimeType || "application/octet-stream",
      "content-disposition": `${baixar}; filename="${(pag.proofFilename || "comprovante").replace(/["\r\n]/g, "")}"`,
      "content-length": String(pag.proofSize ?? 0),
      "cache-control": "private, no-store",
    },
  });
}
