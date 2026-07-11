import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "MVP Veículos — Gestão de Seminovos",
  description:
    "Sistema de gestão da MVP Veículos: estoque, vendas, custos, financeiro e relatórios integrados",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();

  if (!user) {
    // Sem sessão (tela de login): renderiza sem a moldura do sistema.
    return (
      <html lang="pt-BR" className="h-full antialiased">
        <body className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
          {children}
        </body>
      </html>
    );
  }

  const sessionUser = { name: user.name, role: user.role, permissions: user.permissions };
  const { getCompany } = await import("@/lib/company");
  const company = await getCompany().catch(() => null);
  const brand = {
    name: company?.nomeFantasia || "MVP Veículos",
    logoDataUrl: company?.logoDataUrl || null,
  };

  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex h-full min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Sidebar user={sessionUser} brand={brand} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <MobileNav user={sessionUser} brand={brand} />
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
