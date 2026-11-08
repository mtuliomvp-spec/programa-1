import { NextResponse, type NextRequest } from "next/server";
import { cookieDoPortao, senhaConfere, senhaDaPlataforma } from "@/lib/plataforma";
import { ehPainelDaPlataforma } from "@/lib/tenant";

/**
 * Entrada no painel da plataforma: formulário HTML comum (POST) que grava o
 * cookie e volta para /plataforma pelo navegador — sem depender do roteador
 * do Next (o redirect de server action para a mesma página às vezes não
 * re-renderizava e o botão ficava em "Conferindo…").
 */
export async function POST(request: NextRequest) {
  if (!senhaDaPlataforma() || !(await ehPainelDaPlataforma())) return new NextResponse(null, { status: 404 });
  const form = await request.formData();
  const destino = new URL("/plataforma", request.url);
  // O host de request.url pode ser o do servidor; o do navegador é o que vale.
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) destino.host = host;
  if (!senhaConfere(String(form.get("senha") ?? ""))) {
    // Freio para tentativa e erro: a senha é a única porta do painel.
    await new Promise((r) => setTimeout(r, 1500));
    destino.searchParams.set("erro", "1");
    return NextResponse.redirect(destino, 303);
  }
  const c = cookieDoPortao();
  const res = NextResponse.redirect(destino, 303);
  res.cookies.set(c.nome, c.valor, c.opcoes);
  return res;
}
