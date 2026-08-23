import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { montarArquivoDePerfis } from "@/lib/profile-transfer";

export const dynamic = "force-dynamic";

/**
 * Baixa os perfis de acesso desta instalação em um arquivo JSON, para importar
 * em outra (demonstração, instalação nova de um cliente).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const perfis = await prisma.profile.findMany({
    orderBy: { name: "asc" },
    select: { name: true, permissions: true },
  });

  const hoje = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(montarArquivoDePerfis(perfis), null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="perfis-de-acesso-${hoje}.json"`,
      "cache-control": "no-store",
    },
  });
}
