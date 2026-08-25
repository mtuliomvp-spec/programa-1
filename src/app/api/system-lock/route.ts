import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSystemLock } from "@/lib/system-lock";
import { touchPresence } from "@/lib/presence";

export const dynamic = "force-dynamic";

/**
 * Estado do bloqueio do sistema — os clientes consultam a cada 10 s.
 *
 * Essa consulta é também o batimento de presença: quem está com o sistema
 * aberto passa por aqui sozinho, e é isso que alimenta a lista de "quem está
 * online" do painel do Super Admin (a gravação é no máximo 1×/min por pessoa).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ locked: false, admin: false, paymentBlocked: false });
  await touchPresence(user.id);
  const { locked, paymentBlocked } = await getSystemLock();
  return NextResponse.json(
    { locked, paymentBlocked, admin: user.role === "SUPER_ADMIN" },
    { headers: { "cache-control": "no-store" } },
  );
}
