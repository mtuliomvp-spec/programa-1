import { requireModuleAny } from "@/lib/guards";

// "Meu capital" (só o próprio) também mora em /capital. A trava do
// Administrativo — que mostra o capital de todos — fica em cada página.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireModuleAny(["administrativo", "meu_capital"]);
  return <>{children}</>;
}
