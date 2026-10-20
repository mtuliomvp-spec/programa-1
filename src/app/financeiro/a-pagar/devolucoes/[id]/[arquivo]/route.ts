import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

/**
 * Arquivos do registro de devolução de compra: "nf" = a NF de devolução; outro
 * valor = id de um anexo do título cancelado (NF da compra, boleto…).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; arquivo: string }> }) {
  const user = await getSessionUser();
  if (!user || !can(user, "financeiro", "visualizar")) return new Response("Acesso negado", { status: 403 });
  const { id, arquivo } = await params;
  const arq =
    arquivo === "nf"
      ? await prisma.devolucaoCompra.findUnique({
          where: { id },
          select: { filename: true, mimeType: true, data: true },
        })
      : await prisma.devolucaoCompraAnexo.findFirst({
          where: { id: arquivo, devolucaoId: id },
          select: { filename: true, mimeType: true, data: true },
        });
  if (!arq) return new Response("Arquivo não encontrado", { status: 404 });
  return new Response(new Uint8Array(arq.data), {
    headers: {
      "Content-Type": arq.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(arq.filename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
