import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/guards";

/** Recibo de férias ou TRCT guardado na ficha do funcionário. */
export async function GET(_req: Request, { params }: { params: Promise<{ tipo: string; id: string }> }) {
  if (!(await userCan("administrativo", "folha"))) return new NextResponse("Sem permissão.", { status: 403 });
  const { tipo, id } = await params;
  const doc =
    tipo === "ferias"
      ? await prisma.employeeVacation
          .findUnique({ where: { id }, select: { reciboNome: true, reciboMime: true, reciboDados: true } })
          .then((v) => v && { nome: v.reciboNome, mime: v.reciboMime, dados: v.reciboDados })
      : tipo === "rescisao"
        ? await prisma.employeeTermination
            .findUnique({ where: { id }, select: { arquivoNome: true, arquivoMime: true, arquivoDados: true } })
            .then((r) => r && { nome: r.arquivoNome, mime: r.arquivoMime, dados: r.arquivoDados })
        : null;
  if (!doc?.dados) return new NextResponse("Arquivo não encontrado.", { status: 404 });
  return new NextResponse(new Uint8Array(doc.dados), {
    headers: {
      "Content-Type": doc.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.nome || "documento")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
