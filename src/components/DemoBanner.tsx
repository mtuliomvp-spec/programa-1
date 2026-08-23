import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/demo-mode";

/**
 * Aviso no painel de que esta é uma instalação de demonstração, com atalho
 * para a tela que carrega os dados fictícios. Some por completo (renderiza
 * nada) fora do modo demonstração — ou seja, na instalação de produção.
 */
export default async function DemoBanner() {
  if (!isDemoMode()) return null;
  const veiculos = await prisma.vehicle.count();
  const vazio = veiculos === 0;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-900">
          🧪 Instalação de demonstração
          {vazio ? " — ainda sem dados" : ""}
        </p>
        <p className="text-xs text-amber-800">
          {vazio
            ? "Carregue os dados fictícios para apresentar o sistema já preenchido."
            : "Os dados aqui são fictícios. Você pode recarregá-los a qualquer momento para zerar a apresentação."}
        </p>
      </div>
      <Link
        href="/demo"
        className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
      >
        {vazio ? "Carregar dados de demonstração" : "Gerenciar demonstração"}
      </Link>
    </div>
  );
}
