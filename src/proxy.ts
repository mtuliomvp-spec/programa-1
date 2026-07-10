import { NextResponse, type NextRequest } from "next/server";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Porteiro do sistema: toda rota (exceto /login e arquivos estáticos)
 * exige o cookie de sessão assinado. A validação autoritativa (usuário
 * ativo no banco) acontece nas páginas; aqui é o bloqueio rápido.
 */

const SESSION_COOKIE = "mvp_session";

function getSecret(): string {
  const base = process.env.AUTH_SECRET || process.env.DATABASE_URL || "mvp-veiculos-dev";
  return createHash("sha256").update(base).digest("hex");
}

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isValidToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    // já logado tentando abrir /login: manda para o dashboard
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/login") return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)",
  ],
};
