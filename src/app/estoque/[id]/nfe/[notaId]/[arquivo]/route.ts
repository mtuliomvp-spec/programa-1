import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { baixarArquivo, type Ambiente } from "@/lib/focus-nfe";

/** XML ou DANFE (PDF) de uma NF-e do veículo, buscado na Focus NFe. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; notaId: string; arquivo: string }> },
) {
  const user = await getSessionUser();
  if (!user || !can(user, "estoque", "visualizar")) {
    return new Response("Acesso negado", { status: 403 });
  }
  const { id, notaId, arquivo } = await params;
  const nota = await prisma.notaFiscal.findUnique({ where: { id: notaId } });
  if (!nota || nota.vehicleId !== id) return new Response("Nota não encontrada", { status: 404 });

  const xml = arquivo === "xml";
  const caminho = xml ? nota.caminhoXml : arquivo === "danfe" ? nota.caminhoDanfe : null;
  if (!caminho) return new Response("Arquivo indisponível", { status: 404 });
  const res = await baixarArquivo(nota.ambiente as Ambiente, caminho);
  if (!res) return new Response("Não foi possível baixar o arquivo da Focus NFe agora.", { status: 502 });

  const nome = `${nota.chave ?? nota.ref}.${xml ? "xml" : "pdf"}`;
  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": xml ? "application/xml" : "application/pdf",
      "Content-Disposition": `${xml ? "attachment" : "inline"}; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
