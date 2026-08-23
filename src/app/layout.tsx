import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import SystemLockWatcher from "@/components/SystemLockWatcher";
import PaymentBlockScreen from "@/components/PaymentBlockScreen";
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

  // Rótulo do cargo mostrado no rodapé do menu: administrador, o nome do perfil
  // (ex.: "Vendedor") quando houver, ou "Operador" como padrão.
  const roleLabel =
    user.role === "SUPER_ADMIN"
      ? "Super Admin"
      : user.role === "ADMIN"
        ? "Administrador"
        : user.profile?.name || "Operador";
  const sessionUser = {
    name: user.name,
    role: user.role,
    permissions: user.permissions,
    roleLabel,
  };
  const { getCompany } = await import("@/lib/company");
  const company = await getCompany().catch(() => null);
  const brand = {
    name: company?.nomeFantasia || "MVP Veículos",
    logoDataUrl: company?.logoDataUrl || null,
  };
  const systemLocked = !!company?.systemLocked;
  const isSuper = user.role === "SUPER_ADMIN";
  // O Super Admin atravessa a manutenção como o administrador atravessa.
  const isAdmin = user.role === "ADMIN" || isSuper;

  // Bloqueio por FALTA DE PAGAMENTO: para a loja inteira, inclusive o
  // administrador. Só o Super Admin (dono do sistema) continua entrando — é
  // ele quem libera depois de regularizada a mensalidade.
  if (company?.paymentBlocked && !isSuper) {
    const { getSubscription } = await import("@/lib/subscription");
    const { PAYMENT_BLOCK_MESSAGE } = await import("@/lib/system-lock");
    const sub = await getSubscription().catch(() => null);
    return (
      <html lang="pt-BR" className="h-full antialiased">
        <body className="min-h-screen bg-slate-950">
          <PaymentBlockScreen
            message={company.paymentBlockedMessage || PAYMENT_BLOCK_MESSAGE}
            contato={{
              nome: sub?.providerName ?? null,
              telefone: sub?.providerPhone ?? null,
              email: sub?.providerEmail ?? null,
            }}
          />
        </body>
      </html>
    );
  }

  // Bloqueio do sistema: não-admin com o sistema bloqueado não recebe o app —
  // só a tela de manutenção (defesa no servidor; o watcher recarrega sozinho
  // quando o administrador desbloquear).
  if (systemLocked && !isAdmin) {
    return (
      <html lang="pt-BR" className="h-full antialiased">
        <body className="min-h-screen bg-slate-950">
          <SystemLockWatcher initialLocked isAdmin={false} />
        </body>
      </html>
    );
  }

  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex h-full min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <SystemLockWatcher initialLocked={systemLocked} isAdmin={isAdmin} />
        <Sidebar user={sessionUser} brand={brand} systemLocked={systemLocked} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <MobileNav user={sessionUser} brand={brand} systemLocked={systemLocked} />
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
