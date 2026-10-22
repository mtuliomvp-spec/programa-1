import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/guards";

export const dynamic = "force-dynamic";

/** Pedaço lido do banco por vez (a resposta sai em fluxo, sem montar o arquivo inteiro). */
const BLOCO = 1024 * 1024;

/**
 * Serve um documento do imóvel. Sai em FLUXO, um bloco de 1 MB por vez: um
 * registro de cartório escaneado passa do limite de ~4,5 MB que a hospedagem
 * aceita numa resposta montada de uma vez. `?download=1` força baixar.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/imoveis/anexos/[id]">) {
  if (!(await userCan("imoveis", "visualizar"))) {
    return new NextResponse("Acesso negado", { status: 403 });
  }
  const { id } = await ctx.params;
  const anexo = await prisma.imovelAnexo.findUnique({
    where: { id },
    select: { filename: true, mimeType: true, size: true, completo: true },
  });
  if (!anexo || !anexo.completo) return new NextResponse("Não encontrado", { status: 404 });

  let pos = 0;
  const corpo = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (pos >= anexo.size) {
        controller.close();
        return;
      }
      const [linha] = await prisma.$queryRaw<{ parte: Uint8Array }[]>`
        SELECT substring("data" from ${pos + 1}::int for ${BLOCO}::int) AS parte FROM "imovel_anexos" WHERE "id" = ${id}`;
      const parte = linha?.parte ? new Uint8Array(linha.parte) : new Uint8Array();
      if (parte.byteLength === 0) {
        controller.close();
        return;
      }
      pos += parte.byteLength;
      controller.enqueue(parte);
    },
  });

  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  // Cabeçalho só aceita ASCII: "Declaração" vira "Declaracao" no nome simples;
  // o nome com acento vai no filename* (UTF-8).
  const safeName = anexo.filename.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "");
  return new NextResponse(corpo, {
    status: 200,
    headers: {
      "content-type": anexo.mimeType || "application/octet-stream",
      "content-disposition": `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(anexo.filename)}`,
      "content-length": String(anexo.size),
      "cache-control": "private, no-store",
    },
  });
}
