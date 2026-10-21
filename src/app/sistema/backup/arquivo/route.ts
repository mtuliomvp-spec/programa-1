import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { modeloBackup } from "@/lib/backup/esquema";

export const dynamic = "force-dynamic";

/**
 * Um arquivo (campo Bytes) de uma linha, em binário puro — o backup completo
 * baixa os documentos um por um, para nenhuma resposta passar do limite da
 * Vercel. Somente o Super Admin.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  const p = request.nextUrl.searchParams;
  const m = modeloBackup(p.get("m") || "");
  const campo = p.get("f") || "";
  const id = p.get("id") || "";
  if (!m || !m.bytes.includes(campo) || !id) {
    return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linha = await (prisma as any)[m.delegate].findUnique({ where: { id }, select: { [campo]: true } });
  const dados = linha?.[campo] as Uint8Array | null | undefined;
  if (!dados) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return new NextResponse(Buffer.from(dados), {
    status: 200,
    headers: { "content-type": "application/octet-stream", "cache-control": "no-store" },
  });
}
