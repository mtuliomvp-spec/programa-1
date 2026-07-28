import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * Serve o arquivo de um documento da empresa guardado no banco. Só para quem
 * tem acesso ao módulo "Documentos da empresa". `?download=1` força baixar.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/documentos-empresa/[id]">) {
  if (!(await userCan("documentos_empresa", "visualizar"))) {
    return new NextResponse("Acesso negado", { status: 403 });
  }

  const { id } = await ctx.params;
  const doc = await prisma.companyDocument.findUnique({ where: { id } });
  if (!doc) return new NextResponse("Não encontrado", { status: 404 });

  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  const safeName = doc.filename.replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(doc.data), {
    status: 200,
    headers: {
      "content-type": doc.mimeType || "application/octet-stream",
      "content-disposition": `${disposition}; filename="${safeName}"`,
      "content-length": String(doc.size),
      "cache-control": "private, no-store",
    },
  });
}
