import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/demo-mode";
import { getSessionUser } from "@/lib/auth";
import { VISITANTE_EMAIL } from "@/lib/demo-visitante";

/**
 * Aviso no painel de que esta é uma instalação de demonstração, com atalho
 * para a tela que carrega os dados fictícios. Some por completo (renderiza
 * nada) fora do modo demonstração — ou seja, na instalação de produção.
 */
export default async function DemoBanner() {
  if (!isDemoMode()) return null;

  // Interessado testando pelo /assinar: aviso de ambiente compartilhado e o
  // caminho de volta para contratar — sem o atalho de recarregar os dados.
  const user = await getSessionUser();
  if (user?.email === VISITANTE_EMAIL) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900">🧪 Você está na demonstração do Fincore360</p>
          <p className="text-xs text-emerald-800">
            Dados fictícios, em ambiente compartilhado com outros interessados — não cadastre dados reais.
          </p>
        </div>
        <Link
          href="/assinar#pedido"
          className="shrink-0 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Quero assinar
        </Link>
      </div>
    );
  }
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
