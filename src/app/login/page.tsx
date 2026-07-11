import { prisma } from "@/lib/prisma";
import BrandMark from "@/components/BrandMark";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    icon: "🚗",
    title: "Estoque inteligente",
    description: "Cadastro pela placa com dados e valor FIPE, custos por veículo e margem real",
  },
  {
    icon: "🧾",
    title: "Vendas e documentos",
    description: "À vista, parcelado ou financiado, com ordem de compra e venda para imprimir",
  },
  {
    icon: "💰",
    title: "Financeiro completo",
    description: "Contas a pagar e receber, livro caixa, recorrentes e conciliação bancária",
  },
  {
    icon: "📈",
    title: "Relatórios gerenciais",
    description: "DRE mensal, lucro por veículo, tempo de estoque e despesas por categoria",
  },
  {
    icon: "👥",
    title: "Equipe e permissões",
    description: "Folha de pagamento e usuários com acesso controlado por módulo",
  },
  {
    icon: "🏗️",
    title: "Outros negócios",
    description: "Consórcios, combustíveis, capital dos sócios, obras e imóveis",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const userCount = await prisma.user.count();
  const isSetup = userCount === 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <BrandMark />
          <a
            href="#entrar"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
          >
            🔒 Entrar
          </a>
        </div>
      </header>

      {/* Chamada principal */}
      <section className="mx-auto max-w-3xl px-4 pb-12 pt-14 text-center sm:pt-20">
        <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl">
          Gestão completa para sua loja de veículos
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-500">
          Estoque com FIPE pela placa, vendas, custos por veículo, financeiro com conciliação
          bancária, folha, consórcios e relatórios — tudo em um só sistema, no computador e no
          celular.
        </p>
        <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
          <a
            href="#entrar"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3.5 text-base font-semibold text-white shadow-md hover:bg-blue-600"
          >
            🔒 Entrar no sistema
          </a>
          <p className="text-sm text-slate-400">Acesso restrito à equipe da MVP Veículos</p>
        </div>
      </section>

      {/* O que está incluído */}
      <section className="border-y border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            O que está incluído
          </h2>
          <p className="mt-2 text-center text-slate-500">
            Módulos integrados em uma única plataforma.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <span className="text-2xl" aria-hidden>
                  {f.icon}
                </span>
                <p className="mt-2 font-semibold text-slate-900">{f.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Formulário de acesso */}
      <section id="entrar" className="mx-auto max-w-md scroll-mt-20 px-4 py-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <h2 className="text-lg font-bold text-slate-900">
            {isSetup ? "Bem-vindo! Crie o administrador" : "Entrar no sistema"}
          </h2>
          <p className="mb-5 mt-1 text-sm text-slate-500">
            {isSetup
              ? "Primeiro acesso: crie o usuário dono do sistema. Só você poderá cadastrar outros usuários."
              : "Use seu e-mail e senha cadastrados."}
          </p>
          <LoginForm isSetup={isSetup} next={params.next} />
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        MVP Veículos · Gestão de seminovos · acesso restrito
      </footer>
    </div>
  );
}
