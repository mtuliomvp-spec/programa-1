import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export const metadata: Metadata = {
  title: "AutoVendas - Gestão de Loja de Seminovos",
  description: "Controle de estoque, vendas, peças e financeiro integrado",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex h-full min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <MobileNav />
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
