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

  // /login e subpáginas (ex.: /login/redefinir) são públicas
  if (pathname === "/login" || pathname.startsWith("/login/")) return NextResponse.next();

  // Verificação pública de autenticidade (QR Code da Ordem de Pagamento).
  if (pathname.startsWith("/verificar/")) return NextResponse.next();

  // Painel oculto do dono do sistema: a própria página exige a senha mestra da
  // instalação (e devolve 404 quando ela não está configurada). Passa sem
  // sessão de propósito — é por onde o fornecedor entra mesmo que o acesso da
  // loja esteja suspenso ou algo esteja errado com as contas.
  if (pathname === "/super" || pathname.startsWith("/super/")) return NextResponse.next();

  // Vitrine pública dos veículos à venda (inclui as fotos públicas).
  if (pathname === "/vitrine" || pathname.startsWith("/vitrine/")) return NextResponse.next();

  // Estado do bloqueio do sistema (a própria rota trata sessão ausente).
  if (pathname === "/api/system-lock") return NextResponse.next();

  // Visitante sem sessão na raiz: vê a vitrine (o Entrar fica lá).
  if (pathname === "/") return NextResponse.redirect(new URL("/vitrine", request.url));

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // `documentos/` fica de fora junto com os demais estáticos: são os PDFs
    // públicos da plataforma (apresentação comercial e manual do sistema),
    // servidos direto de public/ e pensados para serem compartilhados por link.
    // Passar pelo porteiro impediria o arquivo de ser entregue.
    "/((?!_next/static|_next/image|favicon\\.ico|documentos/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)",
  ],
};
