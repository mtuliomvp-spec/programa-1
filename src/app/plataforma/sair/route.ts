import { NextResponse, type NextRequest } from "next/server";
import { NOME_DO_PORTAO } from "@/lib/plataforma";

/** Sai do painel da plataforma (apaga o cookie do portão). */
export async function POST(request: NextRequest) {
  const destino = new URL("/plataforma", request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) destino.host = host;
  const res = NextResponse.redirect(destino, 303);
  res.cookies.set(NOME_DO_PORTAO, "", { path: "/plataforma", maxAge: 0 });
  return res;
}
