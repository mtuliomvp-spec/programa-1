import { requireModule } from "@/lib/guards";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireModule("pecas");
  return <>{children}</>;
}
