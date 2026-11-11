import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSystemLock } from "@/lib/system-lock";
import { touchPresence } from "@/lib/presence";
import { APP_BUILD_ID, APP_VERSION } from "@/lib/app-version";

export const dynamic = "force-dynamic";

/**
 * Estado do bloqueio do sistema — os clientes consultam a cada 10 s.
 *
 * Essa consulta é também o batimento de presença: quem está com o sistema
 * aberto passa por aqui sozinho, e é isso que alimenta a lista de "quem está
 * online" do painel do Super Admin (a gravação é no máximo 1×/min por pessoa).
 */
export async function GET() {
  // `build`: a publicação que o servidor está rodando. A tela aberta compara
  // com a dela — diferente, o sistema foi atualizado e ela pede para recarregar
  // (os botões de uma tela antiga chamam funções que a versão nova não tem).
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ locked: false, admin: false, paymentBlocked: false, build: APP_BUILD_ID });
  await touchPresence(user.id);
  const { locked, paymentBlocked } = await getSystemLock();
  return NextResponse.json(
    { locked, paymentBlocked, admin: user.role === "SUPER_ADMIN", build: APP_BUILD_ID, versao: APP_VERSION },
    { headers: { "cache-control": "no-store" } },
  );
}
