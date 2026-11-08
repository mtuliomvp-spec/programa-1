import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import SystemLockWatcher from "@/components/SystemLockWatcher";
import PaymentBlockScreen from "@/components/PaymentBlockScreen";
import { getSessionUser } from "@/lib/auth";
import { nomeDaLoja } from "@/lib/nome-loja";
import { isDemoMode } from "@/lib/demo-mode";
import ModoGuia from "@/components/guia/ModoGuia";
import ChatAjuda from "@/components/ChatAjuda";
import { situacaoDaLoja } from "@/lib/tenant";

/** Endereço sem loja (multi-loja) ou loja desativada: aviso, não erro. */
const AVISOS = {
  "sem-loja": [
    "Nenhuma loja neste endereço",
    "Confira o endereço digitado. Cada loja do Fincore360 tem o seu próprio endereço.",
  ],
  suspensa: ["Loja desativada", "O acesso a esta loja está desativado. Fale com o suporte do Fincore360."],
  preparando: [
    "Sua loja está sendo preparada",
    "Estamos montando o sistema da sua loja. Isso leva alguns minutos — recarregue a página daqui a pouco.",
  ],
} as const;

function AvisoDaLoja({ situacao }: { situacao: keyof typeof AVISOS }) {
  const [titulo, texto] = AVISOS[situacao];
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-800">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-semibold">{titulo}</p>
          <p className="mt-2 text-sm text-slate-600">{texto}</p>
        </div>
      </body>
    </html>
  );
}

/** Título da aba com o nome da loja dos Parâmetros (cada instalação é de um cliente). */
export async function generateMetadata(): Promise<Metadata> {
  const situacao = await situacaoDaLoja();
  if (situacao === "plataforma") return { title: "Fincore360 — Plataforma", robots: { index: false } };
  if (situacao !== "ok") return { title: "Fincore360" };
  const { getCompany } = await import("@/lib/company");
  const nome = nomeDaLoja(await getCompany().catch(() => null));
  return {
    title: `${nome} — Gestão de Seminovos`,
    description: `Sistema de gestão da ${nome}: estoque, vendas, custos, financeiro e relatórios integrados`,
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const situacao = await situacaoDaLoja();
  // Painel da plataforma: sem loja, sem moldura do sistema.
  if (situacao === "plataforma") {
    return (
      <html lang="pt-BR" className="h-full antialiased">
        <body className="min-h-screen bg-slate-50 text-slate-900">{children}</body>
      </html>
    );
  }
  if (situacao !== "ok") return <AvisoDaLoja situacao={situacao} />;
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
    name: nomeDaLoja(company),
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
      <body
        className="flex h-full min-h-screen bg-[var(--background)] text-[var(--foreground)]"
        data-loja={brand.name}
      >
        <SystemLockWatcher initialLocked={systemLocked} isAdmin={isAdmin} />
        <Sidebar user={sessionUser} brand={brand} systemLocked={systemLocked} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <MobileNav user={sessionUser} brand={brand} systemLocked={systemLocked} />
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
            {isDemoMode() || company?.modoGuia ? <ModoGuia /> : null}
            {children}
          </main>
        </div>
        <ChatAjuda />
      </body>
    </html>
  );
}
