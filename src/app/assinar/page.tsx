import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UFS } from "@/lib/endereco";
import { DIAS_ANALISE, PRECO_MENSAL, emailComercial, paginaAssinaturaAtiva } from "@/lib/assinatura-fincore";
import PedidoForm from "./PedidoForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fincore360 | Sistema para revendas de veículos com integração ao Renave",
  description:
    "Sistema de gestão para revendas de carros novos e seminovos: estoque, vendas, financeiro, notas, títulos e integração com o Renave. Assinatura mensal, cadastro analisado em até 3 dias corridos.",
  openGraph: {
    title: "Fincore360 — sistema para revendas de veículos",
    description: "Estoque, vendas, financeiro e Renave num só sistema.",
    siteName: "Fincore360",
    locale: "pt_BR",
    type: "website",
  },
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

// Só o que o sistema faz hoje — o anúncio e esta página não prometem além disso.
const RECURSOS: { titulo: string; texto: string }[] = [
  {
    titulo: "Renave",
    texto:
      "Entradas e saídas de veículos registradas no Renave pelo próprio sistema, com o contrato SERPRO e o certificado e-CNPJ da sua loja. Antes de enviar, ele aponta o que está faltando.",
  },
  {
    titulo: "Estoque e custos",
    texto: "Cadastro do veículo a partir do CRLV, consulta FIPE, custos por carro e guias e débitos do DETRAN.",
  },
  {
    titulo: "Vendas",
    texto: "Venda à vista, parcelada ou financiada, com troca, comissões e repasse da financeira.",
  },
  {
    titulo: "Financeiro",
    texto: "Contas a pagar e a receber, caixa, extrato bancário e fechamento do mês.",
  },
  {
    titulo: "Notas e títulos",
    texto: "Importação de NF-e, boletos e guias com leitura automática e linha digitável pronta para pagar.",
  },
  {
    titulo: "Vitrine online",
    texto: "Seus carros num site público com botão de WhatsApp, pronto para anunciar no Google.",
  },
];

const PASSOS: { titulo: string; texto: string }[] = [
  { titulo: "Envie o seu pedido", texto: "Pelo formulário abaixo ou por e-mail. O seu cadastro começa a ser analisado." },
  {
    titulo: `Análise em até ${DIAS_ANALISE} dias corridos`,
    texto: "Terminada a análise, entramos em contato pelo WhatsApp ou e-mail informado.",
  },
  { titulo: "Acesso liberado", texto: "Liberamos o seu acesso ao Fincore360 e ajudamos na configuração inicial." },
];

/**
 * Página de venda do Fincore360 — destino do anúncio do sistema. Pública, e
 * só existe onde `paginaAssinaturaAtiva()` (instalação de demonstração).
 */
export default function AssinarPage() {
  if (!paginaAssinaturaAtiva()) notFound();
  const email = emailComercial();
  const btn =
    "inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-semibold transition-colors";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="bg-[#0F1B2D] text-white">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6 sm:pb-20">
          <div className="flex items-center justify-between gap-4">
            <p className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2BD18A] text-lg text-[#0F1B2D]" aria-hidden="true">
                F
              </span>
              Fincore360
            </p>
            <Link href="/login" className="text-sm font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline">
              Já sou cliente
            </Link>
          </div>

          <div className="mt-12 grid items-center gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div>
              <p className="text-sm font-semibold tracking-wider text-[#2BD18A] uppercase">
                Para revendas de carros novos e seminovos
              </p>
              <h1 className="mt-4 text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
                Renave na sua revenda, sem complicação.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
                Caro lojista, boas notícias: o Fincore360 chega ao mercado com um sistema completo para a sua
                revenda atender à exigência do Renave — e organizar estoque, vendas e financeiro no mesmo lugar.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href="#pedido" className={`${btn} bg-[#2BD18A] text-[#0F1B2D] hover:bg-[#5BE3A8]`}>
                  Solicite seu acesso
                </a>
                <a
                  href="/documentos/fincore360-apresentacao.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${btn} border border-slate-500 text-white hover:bg-white/10`}
                >
                  Ver a apresentação (PDF)
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-[#2A3B57] bg-[#17263D] p-6 sm:p-8">
              <p className="text-sm font-semibold tracking-wider text-[#2BD18A] uppercase">Assinatura</p>
              <p className="mt-2 text-5xl font-extrabold tracking-tight">
                {brl(PRECO_MENSAL)}
                <span className="text-lg font-semibold text-slate-300"> por mês</span>
              </p>
              <ul className="mt-5 space-y-2 text-slate-200">
                <li>Sistema completo, 100% online</li>
                <li>Cadastro analisado em até {DIAS_ANALISE} dias corridos</li>
                <li>Ajuda na configuração inicial</li>
              </ul>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="recursos">
          <h2 id="recursos" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            O que o sistema faz pela sua loja
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map((r) => (
              <div key={r.titulo} className="rounded-xl border border-slate-200 p-5">
                <h3 className="text-lg font-bold">{r.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{r.texto}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm leading-relaxed text-slate-600">
            O Renave de veículos usados funciona conforme a adesão do DETRAN de cada estado. O Fincore360 é um
            software privado, sem vínculo com o SENATRAN, o SERPRO ou os DETRANs.
          </p>
        </section>

        <section className="bg-slate-50" aria-labelledby="como">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="como" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Como contratar
            </h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {PASSOS.map((p, i) => (
                <li key={p.titulo} className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0F1B2D] font-bold text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 text-lg font-bold">{p.titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pedido" className="mx-auto max-w-3xl scroll-mt-6 px-4 py-14 sm:px-6" aria-labelledby="pedido-titulo">
          <h2 id="pedido-titulo" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Solicite seu acesso
          </h2>
          <p className="mt-2 text-slate-600">
            Não perca a oportunidade — aguardamos o seu contato. Se preferir, escreva para{" "}
            <a href={`mailto:${email}`} className="font-semibold text-blue-700 underline">
              {email}
            </a>
            .
          </p>
          <div className="mt-6 rounded-2xl border border-slate-200 p-5 sm:p-7">
            <PedidoForm ufs={UFS} email={email} dias={DIAS_ANALISE} />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:px-6">
          <p>Fincore360 · Software privado, sem vínculo com órgãos públicos.</p>
          <p className="flex flex-wrap gap-4">
            <a href={`mailto:${email}`} className="hover:text-slate-800 hover:underline">
              {email}
            </a>
            <Link href="/assinar/privacidade" className="hover:text-slate-800 hover:underline">
              Política de privacidade
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
