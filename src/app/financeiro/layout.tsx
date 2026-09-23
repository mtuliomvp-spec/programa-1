import { requireModuleAny } from "@/lib/guards";

// Combos de pagamento moram em /financeiro, mas são um módulo à parte: quem só
// tem Combos (ex.: o sócio que pede saque) entra aqui sem ter o Financeiro. A
// trava do Financeiro fica em cada página — e é lá que ela precisa estar de
// qualquer jeito, porque o layout não roda de novo na navegação entre telas.
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireModuleAny(["financeiro", "combos"]);
  return <>{children}</>;
}
