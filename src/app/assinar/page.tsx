import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UFS } from "@/lib/endereco";
import { isDemoMode } from "@/lib/demo-mode";
import {
  DIAS_ANALISE,
  FRANQUIA_LEITURAS,
  PRECO_LEITURA_EXCEDENTE,
  PRECO_MENSAL,
  TAXA_IMPLANTACAO,
  emailComercial,
  paginaAssinaturaAtiva,
} from "@/lib/assinatura-fincore";
import PedidoForm from "./PedidoForm";
import { entrarNaDemoAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fincore360 | Sistema para revendas de veículos com integração ao Renave",
  description:
    "Sistema de gestão para revendas de carros novos e seminovos: estoque, vendas, financeiro, notas, títulos e integração com o Renave. Teste o sistema antes de contratar. Assinatura mensal, cadastro analisado em até 3 dias corridos.",
  openGraph: {
    title: "Fincore360 — sistema para revendas de veículos",
    description: "Estoque, vendas, financeiro e Renave num só sistema.",
    siteName: "Fincore360",
    locale: "pt_BR",
    type: "website",
  },
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });

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

// O que a mensalidade cobre (serviços que a Fincore contrata e paga) e o que é
// da loja — o anúncio diz "certificado e emissor de notas à parte", e esta
// lista é o detalhe. Mudou um fornecedor? Atualize aqui e no anúncio.
const INCLUIDO: string[] = [
  "Hospedagem, banco de dados, cópias de segurança e atualizações do sistema",
  `Leitura automática de documentos com inteligência artificial (CRLV, notas, boletos e guias): até ${FRANQUIA_LEITURAS} por mês`,
  "E-mails do sistema (acesso liberado, redefinição de senha)",
  "Busca de CEP e CNPJ e tabela FIPE pública por marca, modelo e ano",
  "Vitrine online dos seus carros no endereço do sistema",
  "Configuração dos serviços que a loja contratar (certificado, emissor de notas, consulta por placa)",
];

const DA_LOJA: { titulo: string; texto: string; obrigatorio?: boolean }[] = [
  {
    titulo: "Certificado digital e-CNPJ (A1)",
    texto: "Exigido para operar o Renave. Comprado numa autoridade certificadora de sua escolha e renovado todo ano.",
    obrigatorio: true,
  },
  {
    titulo: "Acesso ao Renave",
    texto: "Adesão e contrato da loja com o SERPRO, conforme o DETRAN do seu estado. Eventuais tarifas são cobradas pelo SERPRO.",
    obrigatorio: true,
  },
  {
    titulo: "Emissor de NF-e e NFS-e",
    texto: "Plano da loja na Focus NFe, só se for emitir notas pelo sistema. A regra fiscal é definida pelo seu contador.",
  },
  {
    titulo: "Consulta por placa e débitos",
    texto: "Créditos num provedor de consulta veicular. Sem ela, os dados do carro vêm do CRLV e a FIPE, da tabela pública.",
  },
  {
    titulo: "Domínio próprio e Google Ads",
    texto: "Endereço da loja (ex.: sualoja.com.br) para a vitrine e anúncios no Google, se quiser.",
  },
];

const PASSOS: { titulo: string; texto: string }[] = [
  {
    titulo: "Envie o seu pedido",
    texto: "Pelo formulário abaixo ou por e-mail — de preferência depois de testar a demonstração. O seu cadastro começa a ser analisado.",
  },
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
  const podeTestar = isDemoMode();
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
                {podeTestar ? (
                  <a href="#testar" className={`${btn} border border-[#2BD18A] text-[#2BD18A] hover:bg-[#2BD18A]/10`}>
                    Testar o sistema
                  </a>
                ) : null}
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
                <li>Inclui até {FRANQUIA_LEITURAS} leituras automáticas de documentos por mês</li>
                <li>Leitura excedente: {brl(PRECO_LEITURA_EXCEDENTE)} cada</li>
                <li>Cadastro analisado em até {DIAS_ANALISE} dias corridos</li>
                <li className="text-slate-300">
                  Certificado digital, Renave/SERPRO e emissor de notas são contratados pela loja —{" "}
                  <a href="#incluido" className="font-semibold text-[#2BD18A] underline-offset-4 hover:underline">
                    veja o que está incluído
                  </a>
                </li>
              </ul>
              <p className="mt-5 border-t border-[#2A3B57] pt-4 text-sm text-slate-300">
                Implantação: <strong className="text-white">{brl(TAXA_IMPLANTACAO)}</strong> (pagamento único) —
                configuração, cadastro inicial e treinamento da equipe.
              </p>
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

        <section id="incluido" className="scroll-mt-6 border-t border-slate-200" aria-labelledby="incluido-titulo">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="incluido-titulo" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              O que está incluído e o que a loja contrata
            </h2>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6">
                <h3 className="text-lg font-bold">Incluído nos {brl(PRECO_MENSAL)} por mês</h3>
                <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-slate-700">
                  {INCLUIDO.map((t) => (
                    <li key={t} className="flex gap-2.5">
                      <span className="mt-0.5 font-bold text-emerald-700" aria-hidden="true">✓</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 p-6">
                <h3 className="text-lg font-bold">Contratado pela loja, pago direto ao fornecedor</h3>
                <ul className="mt-4 space-y-3.5 text-sm leading-relaxed text-slate-700">
                  {DA_LOJA.map((d) => (
                    <li key={d.titulo}>
                      <p className="font-semibold text-slate-900">
                        {d.titulo}{" "}
                        <span
                          className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            d.obrigatorio ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {d.obrigatorio ? "necessário para o Renave" : "opcional"}
                        </span>
                      </p>
                      <p className="mt-0.5">{d.texto}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="mt-6 text-sm leading-relaxed text-slate-600">
              Os valores desses serviços são cobrados pelos próprios fornecedores e não fazem parte da assinatura.
              Na implantação, ajudamos a contratar e deixamos tudo configurado no seu sistema.
            </p>
          </div>
        </section>

        {podeTestar ? (
          <section id="testar" className="scroll-mt-6 border-y border-emerald-200 bg-emerald-50" aria-labelledby="testar-titulo">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-6">
              <div className="max-w-2xl">
                <h2 id="testar-titulo" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  Teste o sistema antes de contratar
                </h2>
                <p className="mt-3 leading-relaxed text-slate-700">
                  Entre agora na demonstração, já preenchida com veículos, vendas e lançamentos fictícios, e
                  experimente à vontade: cadastre um carro, faça uma venda, veja o financeiro e os relatórios.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  O ambiente de demonstração é <strong>compartilhado com outros interessados</strong>: não
                  cadastre dados reais de clientes. Renave, NF-e e NFS-e ficam desligados aqui.
                </p>
              </div>
              <form action={entrarNaDemoAction}>
                <button type="submit" className={`${btn} bg-[#0F1B2D] text-white hover:bg-[#1A3D8F]`}>
                  Entrar na demonstração
                </button>
              </form>
            </div>
          </section>
        ) : null}

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
