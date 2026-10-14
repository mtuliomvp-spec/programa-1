import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { baixarUrl, type Ambiente } from "@/lib/focus-nfe";

/** DANFSe (PDF) ou XML de uma NFS-e, buscado na Focus NFe. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; arquivo: string }> }) {
  const user = await getSessionUser();
  if (!user || !can(user, "financeiro", "visualizar")) {
    return new Response("Acesso negado", { status: 403 });
  }
  const { id, arquivo } = await params;
  const nota = await prisma.notaServico.findUnique({ where: { id } });
  if (!nota) return new Response("Nota não encontrada", { status: 404 });
  const xml = arquivo === "xml";
  const origem = xml ? nota.caminhoXml : arquivo === "danfse" ? nota.urlDanfse : null;
  if (!origem) return new Response("Arquivo indisponível", { status: 404 });
  const res = await baixarUrl(nota.ambiente as Ambiente, origem);
  if (!res) {
    // DANFSe com link público da Focus (arquivo na Amazon): se o download por
    // aqui falhar, abre direto lá em vez de deixar a tela de erro.
    if (!xml && /^https:\/\/focusnfe\.s3[.-]/.test(origem)) return Response.redirect(origem, 302);
    return new Response("Não foi possível baixar o arquivo agora.", { status: 502 });
  }
  const nome = `nfse-${nota.numero ?? nota.ref}.${xml ? "xml" : "pdf"}`;
  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": xml ? "application/xml" : "application/pdf",
      "Content-Disposition": `${xml ? "attachment" : "inline"}; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
