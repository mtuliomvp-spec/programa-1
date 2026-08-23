import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { Card, PageHeader } from "@/components/ui";
import LoadDemoButton from "./LoadDemoButton";

export const dynamic = "force-dynamic";
// A carga faz muitos lançamentos em sequência; o padrão de 10s não basta.
export const maxDuration = 60;

/**
 * Tela de preparação da instalação de DEMONSTRAÇÃO. Só existe quando a
 * variável de ambiente DEMO_MODE está ligada — na instalação de produção a
 * rota devolve 404.
 */
export default async function DemoPage() {
  if (!isDemoMode()) notFound();

  const user = await getSessionUser();
  const [veiculos, vendas] = await Promise.all([prisma.vehicle.count(), prisma.sale.count()]);
  const temDados = veiculos > 0 || vendas > 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Instalação de demonstração"
        description="Preencha o sistema com dados fictícios para apresentar a plataforma"
      />

      <Card className="p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">🧪 Esta é uma instalação de demonstração</p>
          <p className="mt-1">
            Nenhum dado real de clientes deve ser cadastrado aqui. Esta tela só aparece porque a
            variável <code className="rounded bg-amber-100 px-1">DEMO_MODE</code> está ligada nesta
            instalação — na instalação de produção ela não existe.
          </p>
        </div>

        <h2 className="mt-6 text-base font-semibold text-slate-900">O que será criado</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          <li>• 6 veículos fictícios (em estoque, reservado e vendidos), com placa, chassi e RENAVAM</li>
          <li>• Vendas à vista, parcelada e financiada, com comissão e repasse da financeira</li>
          <li>• Contas a pagar e a receber, despesas, recorrentes e peças com venda de balcão</li>
          <li>• Contas bancárias, capital de dois sócios com aportes e pró-labore</li>
          <li>• Uma avaliação de veículo e dois carros publicados na vitrine pública</li>
        </ul>

        <p className="mt-4 text-sm text-slate-600">
          Ao final, o sistema confere o próprio <strong>farol de integridade</strong> e só conclui
          se os dois checks ficarem verdes. Seus <strong>usuários</strong> e os{" "}
          <strong>Parâmetros da empresa</strong> não são tocados.
        </p>

        {temDados ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Este sistema já tem <strong>{veiculos} veículo(s)</strong> e{" "}
            <strong>{vendas} venda(s)</strong> cadastrados. Recarregar vai{" "}
            <strong>apagar</strong> esses lançamentos e recriar os dados fictícios originais — útil
            para zerar a demonstração depois de uma apresentação.
          </p>
        ) : null}

        <div className="mt-6">
          {!user ? (
            <p className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
              Faça o <Link href="/login" className="font-semibold text-blue-700 underline">login como administrador</Link>{" "}
              para liberar o botão de carga.
            </p>
          ) : user.role !== "SUPER_ADMIN" ? (
            <p className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
              Acesso restrito ao Super Admin.
            </p>
          ) : (
            <LoadDemoButton temDados={temDados} />
          )}
        </div>
      </Card>
    </div>
  );
}
