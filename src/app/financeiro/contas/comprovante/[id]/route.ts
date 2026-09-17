import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Serve o comprovante de uma transferência entre contas — a informada, que
 * ainda espera o caixa, ou a já efetivada (o arquivo segue com ela). Só para
 * usuários autenticados; `?download=1` baixa em vez de abrir.
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/financeiro/contas/comprovante/[id]">,
) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Acesso negado", { status: 403 });

  const { id } = await ctx.params;
  const doc =
    (await prisma.pendingTransfer.findUnique({
      where: { id },
      select: { receiptName: true, receiptMime: true, receiptSize: true, receiptData: true },
    })) ??
    (await prisma.accountTransfer.findUnique({
      where: { id },
      select: { receiptName: true, receiptMime: true, receiptSize: true, receiptData: true },
    }));
  if (!doc?.receiptData) return new NextResponse("Não encontrado", { status: 404 });

  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  const safeName = (doc.receiptName || "comprovante").replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(doc.receiptData), {
    status: 200,
    headers: {
      "content-type": doc.receiptMime || "application/octet-stream",
      "content-disposition": `${disposition}; filename="${safeName}"`,
      "content-length": String(doc.receiptSize ?? doc.receiptData.byteLength),
      "cache-control": "private, no-store",
    },
  });
}
