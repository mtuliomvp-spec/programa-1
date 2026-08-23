import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getSystemLock } from "@/lib/system-lock";

export const dynamic = "force-dynamic";

/** Estado do bloqueio do sistema — os clientes consultam a cada 10 s. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ locked: false, admin: false, paymentBlocked: false });
  const { locked, paymentBlocked } = await getSystemLock();
  return NextResponse.json(
    { locked, paymentBlocked, admin: user.role === "SUPER_ADMIN" },
    { headers: { "cache-control": "no-store" } },
  );
}
