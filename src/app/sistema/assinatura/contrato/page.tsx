import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { getSubscription } from "@/lib/subscription";
import { formatCurrency, formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Campo ausente vira [PLACEHOLDER] para ser preenchido à mão na via impressa. */
const ou = (valor: string | null | undefined, marcador: string) => valor?.trim() || `[${marcador}]`;

function Clausula({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-900">
        Cláusula {n}ª — {titulo}
      </h2>
      <div className="mt-2 space-y-2 text-justify text-[12.5px] leading-relaxed text-slate-800">{children}</div>
    </section>
  );
}

export default async function ContratoAssinaturaPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/");

  const [sub, company] = await Promise.all([getSubscription(), getCompany()]);

  const contratanteCidade = company.city
    ? `${company.city}${company.uf ? `/${company.uf}` : ""}`
    : "[CIDADE/UF]";
  const foro = company.city ? `${company.city}${company.uf ? `/${company.uf}` : ""}` : "[COMARCA]";
  const hoje = new Date();

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <LinkButton href="/sistema/assinatura" variant="secondary">
          ← Voltar
        </LinkButton>
        <PrintButton title="Contrato de licenciamento de software (SaaS)" rootSelector="#contrato" subtitle="" />
        <span className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600">
          Placeholders entre [colchetes] devem ser preenchidos
        </span>
      </div>

      <article id="contrato" className="mx-auto max-w-3xl bg-white p-8 text-slate-900 print:p-0">
        <h1 className="text-center text-[15px] font-bold uppercase leading-snug">
          Contrato de prestação de serviço de licenciamento de software em modelo SaaS
        </h1>

        <p className="mt-5 text-justify text-[12.5px] leading-relaxed">
          Pelo presente instrumento particular, de um lado{" "}
          <strong>{ou(sub.providerName, "RAZÃO SOCIAL DA FORNECEDORA")}</strong>, inscrita no CNPJ sob o nº{" "}
          <strong>{ou(sub.providerDocument, "CNPJ DA FORNECEDORA")}</strong>, com endereço em{" "}
          {ou(sub.providerAddress, "ENDEREÇO DA FORNECEDORA")}, doravante denominada{" "}
          <strong>CONTRATADA</strong>; e de outro lado{" "}
          <strong>{ou(company.razaoSocial, "RAZÃO SOCIAL DA CONTRATANTE")}</strong>, inscrita no CNPJ sob o nº{" "}
          {ou(company.cnpj, "CNPJ DA CONTRATANTE")}, com endereço em {ou(company.address, "ENDEREÇO")},{" "}
          {contratanteCidade}, doravante denominada <strong>CONTRATANTE</strong>, têm entre si justo e contratado
          o presente contrato, que se regerá pelas cláusulas seguintes e pela legislação brasileira aplicável —
          Código Civil, Código de Defesa do Consumidor (quando aplicável), Marco Civil da Internet (Lei
          12.965/2014) e Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>

        <Clausula n={1} titulo="Do objeto">
          <p>
            A CONTRATADA licencia à CONTRATANTE, de forma não exclusiva e intransferível, o uso do sistema de
            gestão <strong>Fincore360 ERP</strong>, disponibilizado em modelo SaaS (software como serviço),
            acessível pela internet, incluindo os módulos de estoque de veículos, vendas, financeiro,
            capital dos sócios, relatórios e os recursos de leitura automática de documentos.
          </p>
          <p>
            O licenciamento não implica cessão ou transferência de propriedade do software, do código-fonte ou
            de qualquer direito de propriedade intelectual da CONTRATADA.
          </p>
        </Clausula>

        <Clausula n={2} titulo="Do prazo">
          <p>
            O contrato vigora por prazo indeterminado a partir de{" "}
            <strong>{sub.startedAt ? formatDate(sub.startedAt) : "[DATA DE INÍCIO]"}</strong>, podendo ser
            denunciado por qualquer das partes, a qualquer tempo, mediante aviso prévio de 30 (trinta) dias,
            sem multa rescisória.
          </p>
        </Clausula>

        <Clausula n={3} titulo="Do preço e das condições de pagamento">
          <p>
            Pelo licenciamento, a CONTRATANTE pagará à CONTRATADA a mensalidade de{" "}
            <strong>{sub.monthlyAmount > 0 ? formatCurrency(sub.monthlyAmount) : "[VALOR DA MENSALIDADE]"}</strong>{" "}
            referente ao plano <strong>{ou(sub.planName, "PLANO")}</strong>, com vencimento todo dia{" "}
            <strong>{sub.dueDay}</strong> de cada mês.
          </p>
          <p>
            O atraso no pagamento sujeita a CONTRATANTE a multa de 2% (dois por cento) e juros de mora de 1% (um
            por cento) ao mês, calculados pro rata die. Persistindo o atraso por mais de 30 (trinta) dias, a
            CONTRATADA poderá suspender o acesso ao sistema, mediante aviso prévio, preservados os dados da
            CONTRATANTE pelo prazo da Cláusula 8ª.
          </p>
          <p>
            Os valores serão reajustados anualmente pela variação do IPCA/IBGE, ou por índice que venha a
            substituí-lo, salvo condição diversa registrada entre as partes.
          </p>
        </Clausula>

        <Clausula n={4} titulo="Das obrigações da contratada">
          <p>
            Manter o sistema disponível pela internet em regime de melhores esforços; disponibilizar as
            atualizações e melhorias desenvolvidas para a plataforma, sem custo adicional; prestar suporte
            técnico pelos canais informados; e manter sigilo sobre os dados da CONTRATANTE.
          </p>
          <p>
            As atualizações do sistema são publicadas para todos os clientes simultaneamente e não dependem de
            instalação pela CONTRATANTE.
          </p>
        </Clausula>

        <Clausula n={5} titulo="Das obrigações da contratante">
          <p>
            Pagar a mensalidade nas datas ajustadas; utilizar o sistema conforme a legislação vigente; zelar
            pelo sigilo das credenciais de acesso de seus usuários, respondendo pelos atos praticados com elas;
            e manter seus dados cadastrais atualizados.
          </p>
          <p>
            A CONTRATANTE é a única responsável pela veracidade, licitude e exatidão das informações que insere
            no sistema, inclusive dados de terceiros.
          </p>
        </Clausula>

        <Clausula n={6} titulo="Da propriedade dos dados">
          <p>
            <strong>Todos os dados inseridos no sistema são de propriedade exclusiva da CONTRATANTE.</strong> A
            CONTRATADA os trata na condição de operadora, exclusivamente para prestar o serviço contratado,
            sendo vedado qualquer uso para finalidade diversa.
          </p>
          <p>
            A CONTRATANTE pode solicitar a exportação integral de seus dados a qualquer momento, em formato
            legível por máquina, sem custo.
          </p>
        </Clausula>

        <Clausula n={7} titulo="Da proteção de dados pessoais (LGPD)">
          <p>
            As partes se obrigam a observar a Lei 13.709/2018. Para os dados pessoais tratados no sistema, a
            CONTRATANTE figura como <strong>controladora</strong> e a CONTRATADA como{" "}
            <strong>operadora</strong>, tratando os dados apenas conforme as instruções da controladora e para
            a execução deste contrato.
          </p>
          <p>
            A CONTRATADA adota medidas técnicas e administrativas de segurança compatíveis, incluindo controle
            de acesso por usuário e senha, permissões granulares por função e transmissão criptografada. Em caso
            de incidente de segurança relevante, comunicará a CONTRATANTE sem demora injustificada.
          </p>
        </Clausula>

        <Clausula n={8} titulo="Da infraestrutura e da guarda dos dados">
          <p>
            O sistema opera sobre infraestrutura de terceiros gerenciada, contratada pela CONTRATADA:
            hospedagem da aplicação, repositório do código-fonte e banco de dados em provedores de nuvem
            reconhecidos. A CONTRATANTE declara ciência de que a operação depende desses provedores.
          </p>
          <p>
            A base de dados é copiada automaticamente pela infraestrutura contratada, com retenção conforme o
            plano vigente do provedor. Encerrado o contrato, os dados ficam disponíveis para exportação pelo
            prazo de <strong>30 (trinta) dias</strong>, após o qual poderão ser eliminados.
          </p>
        </Clausula>

        <Clausula n={9} titulo="Da limitação de responsabilidade">
          <p>
            A CONTRATADA não responde por indisponibilidades decorrentes de falhas dos provedores de
            infraestrutura, da conexão de internet da CONTRATANTE, de caso fortuito ou força maior.
          </p>
          <p>
            A responsabilidade da CONTRATADA, em qualquer hipótese, fica limitada ao valor correspondente às 3
            (três) últimas mensalidades efetivamente pagas.
          </p>
          <p>
            Os recursos de leitura automática de documentos por inteligência artificial são auxiliares: as
            informações extraídas devem ser <strong>conferidas pela CONTRATANTE</strong> antes de qualquer
            efeito contábil ou fiscal.
          </p>
        </Clausula>

        <Clausula n={10} titulo="Da rescisão">
          <p>
            O contrato poderá ser rescindido por qualquer das partes mediante aviso prévio de 30 (trinta) dias;
            imediatamente, em caso de descumprimento de cláusula não sanado em 15 (quinze) dias após
            notificação; ou de pleno direito, em caso de falência ou recuperação judicial.
          </p>
        </Clausula>

        <Clausula n={11} titulo="Do foro">
          <p>
            As partes elegem o foro da comarca de <strong>{foro}</strong> para dirimir as questões oriundas
            deste contrato, com renúncia a qualquer outro, por mais privilegiado que seja.
          </p>
          <p>
            E, por estarem justas e contratadas, firmam o presente instrumento em 2 (duas) vias de igual teor.
          </p>
        </Clausula>

        <p className="mt-6 text-[12.5px]">
          {contratanteCidade === "[CIDADE/UF]" ? "[CIDADE]" : contratanteCidade}, {formatDate(hoje)}.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div className="text-center">
            <div className="border-t border-slate-900 pt-2 text-[12px]">
              <p className="font-semibold">{ou(sub.providerName, "RAZÃO SOCIAL DA FORNECEDORA")}</p>
              <p className="text-slate-600">CONTRATADA</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-slate-900 pt-2 text-[12px]">
              <p className="font-semibold">{ou(company.razaoSocial, "RAZÃO SOCIAL DA CONTRATANTE")}</p>
              <p className="text-slate-600">CONTRATANTE</p>
            </div>
          </div>
        </div>
      </article>

      <p className="mx-auto mt-6 max-w-3xl text-xs text-slate-500 print:hidden">
        Modelo de contrato para uso comercial — recomendamos revisão por advogado antes da assinatura. Os dados
        da contratada são preenchidos em{" "}
        <Link href="/sistema/assinatura" className="font-medium text-blue-700 hover:underline">
          Assinatura › Editar contrato
        </Link>
        ; os da contratante vêm dos Parâmetros da empresa.
      </p>
    </div>
  );
}
