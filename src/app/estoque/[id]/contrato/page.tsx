import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { describeAcquisition } from "@/lib/acquisition";
import { formatCurrency, formatDate } from "@/lib/format";
import { chaveNfeValida, detranOperando, formatChaveNfe, RENAVE_NORMA } from "@/lib/renave";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Linha para preencher à mão, quando o dado não está no cadastro. */
function Blank({ w = "8rem" }: { w?: string }) {
  return (
    <span className="inline-block border-b border-slate-400 align-baseline" style={{ minWidth: w }}>
      &nbsp;
    </span>
  );
}

/**
 * Contrato particular de compra e venda de veículo usado (loja como
 * COMPRADORA), com cláusula de responsabilidade do vendedor por débitos
 * anteriores à tradição e força de título executivo extrajudicial
 * (art. 784, III, do CPC — assinatura do devedor + 2 testemunhas).
 */
export default async function ContratoCompraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ modelo?: string }>;
}) {
  const { id } = await params;
  const { modelo } = await searchParams;
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      supplier: true,
      payables: { where: { category: "COMPRA_VEICULO" }, orderBy: { dueDate: "asc" } },
    },
  });
  if (!vehicle) notFound();

  const company = await getCompany();
  const s = vehicle.supplier;
  const acquisition = describeAcquisition(vehicle);
  const allPaid = vehicle.payables.length > 0 && vehicle.payables.every((p) => p.status === "PAGO");
  // Consignado: o carro é de terceiro (o consignante = VENDEDOR). Não há compra
  // (purchasePrice 0); o "preço" do contrato é o valor a devolver ao dono,
  // pagável só quando o carro for vendido a terceiro.
  const isConsigned = vehicle.consigned;
  const preco = isConsigned ? vehicle.ownerRefundAmount : vehicle.purchasePrice;
  const today = new Date();
  /**
   * Duas redações da cláusula da transferência. A do Renave só descreve a
   * realidade onde o DETRAN do estado já opera o Renave de usados — antes
   * disso, ela promete um registro que a loja não consegue fazer. Por padrão
   * sai a que corresponde à situação do estado; `?modelo=` força a outra, para
   * mostrar a quem quiser conhecer, sempre com a tarja de que não está valendo.
   */
  const renaveVigente = detranOperando(company.detranRenaveStatus);
  const forcado = modelo === "renave" ? true : modelo === "classico" ? false : null;
  const usaRenave = forcado ?? renaveVigente;
  const previa = usaRenave !== renaveVigente;

  const companyCity = company.city
    ? `${company.city}${company.uf ? `/${company.uf}` : ""}`
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap justify-end gap-2 print:hidden">
        <LinkButton variant="secondary" href={`/estoque/${vehicle.id}`}>
          ← Voltar
        </LinkButton>
        <LinkButton
          variant="secondary"
          href={`/estoque/${vehicle.id}/contrato?modelo=${usaRenave ? "classico" : "renave"}`}
        >
          {usaRenave ? "📄 Ver o modelo atual" : "👁️ Ver o modelo do Renave"}
        </LinkButton>
        <PrintButton />
      </div>

      {/* Tarja SEM print:hidden de propósito: se este modelo for impresso ou
          virar PDF, tem de sair marcado — é um contrato que ainda não vale. */}
      {previa ? (
        <div className="mb-4 rounded-xl border-2 border-dashed border-amber-500 bg-amber-50 px-4 py-3 text-center">
          <p className="text-sm font-bold uppercase tracking-wide text-amber-900">
            Modelo de demonstração — ainda não está valendo
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            {usaRenave ? (
              <>
                Esta versão traz as cláusulas do Renave ({RENAVE_NORMA}), que passam a valer quando o DETRAN
                {company.uf ? ` do ${company.uf}` : " do estado"} aderir ao Renave de veículos usados. Serve
                para conhecer o que vem por aí — <strong>não use para assinatura</strong> enquanto isso.
              </>
            ) : (
              <>
                Esta é a redação anterior ao Renave, mantida apenas para consulta. O contrato válido para a
                loja hoje é o do modelo do Renave — <strong>não use este para assinatura</strong>.
              </>
            )}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        <header className="mb-6 border-b-2 border-slate-900 pb-4 text-center">
          <h1 className="text-lg font-black uppercase tracking-tight">
            Contrato Particular de Compra e Venda de Veículo Usado
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Instrumento nº {String(vehicle.orderNumber).padStart(4, "0")} · com força de título
            executivo extrajudicial (art. 784, III, do Código de Processo Civil)
          </p>
        </header>

        <section className="mb-4 text-sm leading-relaxed">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Vendedor(a)
          </h2>
          {s ? (
            <p>
              <strong>{s.name}</strong>, CPF/CNPJ nº {s.document || <Blank />}, telefone{" "}
              {s.phone || <Blank />}, e-mail {s.email || <Blank w="12rem" />}, com endereço em{" "}
              {s.address || <Blank w="16rem" />}, doravante denominado(a) simplesmente{" "}
              <strong>VENDEDOR(A)</strong>.
            </p>
          ) : (
            <p>
              Nome: <Blank w="20rem" />, CPF/CNPJ nº <Blank w="10rem" />, telefone <Blank />,
              endereço: <Blank w="20rem" />, doravante denominado(a) simplesmente{" "}
              <strong>VENDEDOR(A)</strong>.
            </p>
          )}
        </section>

        <section className="mb-4 text-sm leading-relaxed">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Comprador(a)
          </h2>
          <p>
            <strong>{company.razaoSocial.toUpperCase()}</strong>
            {company.nomeFantasia && company.nomeFantasia !== company.razaoSocial
              ? ` (nome fantasia ${company.nomeFantasia})`
              : ""}
            , CNPJ nº {company.cnpj || <Blank w="10rem" />}
            {company.inscricaoEstadual ? `, inscrição estadual nº ${company.inscricaoEstadual}` : ""}
            , com endereço em{" "}
            {company.address ? (
              <>
                {company.address}
                {companyCity ? `, ${companyCity}` : ""}
              </>
            ) : (
              <Blank w="20rem" />
            )}
            , neste ato representada na forma de seus atos constitutivos, doravante denominada
            simplesmente <strong>COMPRADORA</strong>.
          </p>
        </section>

        <section className="mb-4 text-sm leading-relaxed">
          <p>
            As partes acima identificadas celebram o presente Contrato de Compra e Venda, nos termos
            dos arts. 481 e seguintes do Código Civil, mediante as cláusulas seguintes:
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <div>
            <p className="font-bold">Cláusula 1ª — Do objeto</p>
            <p>
              O(A) VENDEDOR(A) vende à COMPRADORA o veículo usado:{" "}
              <strong>
                {vehicle.brand} {vehicle.model}
              </strong>
              {vehicle.version ? `, versão ${vehicle.version}` : ""}, ano de fabricação{" "}
              {vehicle.manufactureYear}, ano modelo {vehicle.modelYear}, placa{" "}
              <strong>{vehicle.plate}</strong>, chassi {vehicle.chassi || <Blank w="12rem" />},
              RENAVAM {vehicle.renavam || <Blank w="8rem" />}, cor {vehicle.color || <Blank />},
              combustível {vehicle.fuel || <Blank />}, com {vehicle.km.toLocaleString("pt-BR")} km,
              no estado de uso e conservação vistoriado pelas partes.
            </p>
          </div>

          <div>
            <p className="font-bold">Cláusula 2ª — Do preço e da forma de pagamento</p>
            {isConsigned ? (
              <>
                <p>
                  O(A) VENDEDOR(A) entrega o veículo em <strong>consignação</strong> para venda pela
                  COMPRADORA. O valor certo e ajustado entre as partes é de{" "}
                  <strong>{formatCurrency(preco)}</strong>, devido e pagável{" "}
                  <strong>quando da venda do veículo a terceiro</strong> pela COMPRADORA.
                </p>
                {vehicle.payoffAmount > 0 || vehicle.debtsAmount > 0 ? (
                  <p className="mt-1">
                    Do valor acertado, a COMPRADORA reterá e quitará diretamente:{" "}
                    {vehicle.payoffAmount > 0 ? (
                      <>
                        o saldo devedor do financiamento de{" "}
                        <strong>{formatCurrency(vehicle.payoffAmount)}</strong>
                        {vehicle.payoffTo ? ` junto a ${vehicle.payoffTo}` : ""}
                      </>
                    ) : null}
                    {vehicle.payoffAmount > 0 && vehicle.debtsAmount > 0 ? " e " : ""}
                    {vehicle.debtsAmount > 0 ? (
                      <>
                        os débitos do veículo (IPVA, licenciamento e multas) de{" "}
                        <strong>{formatCurrency(vehicle.debtsAmount)}</strong>
                      </>
                    ) : null}
                    , cabendo ao(à) VENDEDOR(A) receber o valor líquido de{" "}
                    <strong>
                      {formatCurrency(
                        Math.max(0, preco - vehicle.payoffAmount - vehicle.debtsAmount),
                      )}
                    </strong>
                    .
                  </p>
                ) : null}
              </>
            ) : (
              <p>
                O preço certo e ajustado é de <strong>{formatCurrency(preco)}</strong>,
                na forma de pagamento <strong>{acquisition.forma.toLowerCase()}</strong>
                {vehicle.acquisitionType !== "A_VISTA" && vehicle.downPayment > 0
                  ? `, com entrada de ${formatCurrency(vehicle.downPayment)}`
                  : ""}
                {vehicle.acquisitionType !== "A_VISTA"
                  ? ` e ${Math.max(1, vehicle.installmentsCount)} parcela(s)`
                  : ""}
                {vehicle.financerName ? `, por meio de ${vehicle.financerName}` : ""}
                {allPaid
                  ? `. Valor pago integralmente pela COMPRADORA na data de ${formatDate(vehicle.entryDate)}, servindo este contrato como recibo de quitação.`
                  : ", conforme o cronograma abaixo:"}
              </p>
            )}
            {vehicle.payoffAmount > 0 || vehicle.debtsAmount > 0 ? (
              <p className="mt-1">
                Do valor negociado, a COMPRADORA reterá e quitará diretamente:{" "}
                {vehicle.payoffAmount > 0 ? (
                  <>
                    o saldo devedor do financiamento de{" "}
                    <strong>{formatCurrency(vehicle.payoffAmount)}</strong>
                    {vehicle.payoffTo ? ` junto a ${vehicle.payoffTo}` : ""}
                  </>
                ) : null}
                {vehicle.payoffAmount > 0 && vehicle.debtsAmount > 0 ? " e " : ""}
                {vehicle.debtsAmount > 0 ? (
                  <>
                    os débitos do veículo (IPVA, licenciamento e multas) de{" "}
                    <strong>{formatCurrency(vehicle.debtsAmount)}</strong>
                  </>
                ) : null}
                , cabendo ao(à) VENDEDOR(A) receber o valor líquido de{" "}
                <strong>
                  {formatCurrency(
                    Math.max(
                      0,
                      vehicle.purchasePrice - vehicle.payoffAmount - vehicle.debtsAmount,
                    ),
                  )}
                </strong>
                .
              </p>
            ) : null}
            {chaveNfeValida(vehicle.entryNfeKey) ? (
              <p className="mt-1">
                A operação está documentada pela Nota Fiscal Eletrônica nº {vehicle.entryNfeNumber},
                série {vehicle.entryNfeSerie}, chave de acesso{" "}
                <span className="tabular-nums">{formatChaveNfe(vehicle.entryNfeKey)}</span>.
              </p>
            ) : null}
            {!allPaid && vehicle.payables.length > 0 ? (
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
                    <th className="py-1">Parcela</th>
                    <th className="py-1">Vencimento</th>
                    <th className="py-1">Situação</th>
                    <th className="py-1 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicle.payables.map((p, i) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="py-1">{i + 1}ª</td>
                      <td className="py-1">{formatDate(p.dueDate)}</td>
                      <td className="py-1">{p.status === "PAGO" ? "Paga" : "A pagar"}</td>
                      <td className="py-1 text-right tabular-nums">{formatCurrency(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>

          <div>
            <p className="font-bold">
              Cláusula 3ª — Da entrega {isConsigned ? "(posse)" : "(tradição)"}
            </p>
            {isConsigned ? (
              <p>
                O veículo é entregue à COMPRADORA nesta data, com todos os seus pertences e
                acessórios, livre de pessoas e coisas, <strong>a título de consignação</strong>, para
                exposição e venda, <strong>sem transferência da propriedade</strong>, que permanece
                com o(a) VENDEDOR(A) (consignante) até a venda a terceiro.
              </p>
            ) : (
              <p>
                O veículo é entregue à COMPRADORA nesta data, com todos os seus pertences e
                acessórios, juntamente com o Certificado de Registro do Veículo (CRV/ATPV-e)
                devidamente assinado pelo(a) VENDEDOR(A), livre de pessoas e coisas.
              </p>
            )}
          </div>

          <div>
            <p className="font-bold">
              Cláusula 4ª — Das declarações do(a) vendedor(a) e dos débitos anteriores
            </p>
            <p>
              O(A) VENDEDOR(A) declara, sob as penas da lei, que o veículo se encontra livre e
              desembaraçado de quaisquer ônus, gravames, alienação fiduciária, arrendamento,
              penhora, restrições judiciais ou administrativas, e que inexistem débitos de IPVA,
              licenciamento, seguro obrigatório, multas de trânsito, pedágios ou taxas incidentes
              sobre o veículo até esta data.
            </p>
            <p className="mt-1">
              <strong>Parágrafo primeiro.</strong> São de exclusiva responsabilidade do(a)
              VENDEDOR(A) todos os débitos, tributos, multas e penalidades cujo{" "}
              <strong>fato gerador seja anterior à tradição</strong> do veículo, ainda que lançados,
              notificados ou cobrados após esta data, nos termos do art. 502 do Código Civil.
            </p>
            <p className="mt-1">
              <strong>Parágrafo segundo.</strong> Caso a COMPRADORA venha a pagar qualquer débito de
              responsabilidade do(a) VENDEDOR(A), poderá, à sua escolha: (a) compensar o valor com
              parcelas ainda não pagas do preço; (b) cobrar o reembolso administrativamente; ou (c){" "}
              <strong>executar o presente contrato</strong>, que as partes reconhecem como título
              executivo extrajudicial (art. 784, III, do CPC), pelo valor desembolsado, atualizado
              monetariamente, acrescido de juros de mora de 1% (um por cento) ao mês e multa de 10%
              (dez por cento).
            </p>
          </div>

          <div>
            <p className="font-bold">Cláusula 5ª — Da evicção e dos vícios</p>
            <p>
              O(A) VENDEDOR(A) responde pela evicção de direito (arts. 447 a 457 do Código Civil) e
              pelos vícios ocultos existentes até a tradição (arts. 441 a 446 do Código Civil),
              respondendo a COMPRADORA pelos desgastes naturais de uso do veículo usado por ela
              vistoriado.
            </p>
          </div>

          <div>
            <p className="font-bold">
              Cláusula 6ª —{" "}
              {usaRenave
                ? "Da transferência, do registro no Renave e da comunicação de venda"
                : "Da transferência e comunicação de venda"}
            </p>
            {isConsigned && usaRenave ? (
              <>
                <p>
                  A consignação será formalizada por <strong>contrato eletrônico</strong> registrado
                  no <strong>Registro Nacional de Veículos em Estoque — Renave</strong>, assinado
                  digitalmente pelas partes, na forma do art. 20 da Resolução Contran nº 1.026, de 26
                  de junho de 2026, servindo o presente instrumento como o ajuste particular entre as
                  partes.
                </p>
                <p className="mt-1">
                  <strong>Parágrafo primeiro.</strong> Realizada a venda a terceiro, o(a) VENDEDOR(A)
                  obriga-se a assinar a Autorização para Transferência de Propriedade do Veículo em
                  Meio Digital (ATPV-e) <strong>no prazo de 30 (trinta) dias</strong> contados do
                  contrato eletrônico de consignação, sob pena de cancelamento da venda e restituição
                  do veículo, nos termos do § 7º do referido art. 20.
                </p>
                <p className="mt-1">
                  <strong>Parágrafo segundo.</strong> A propriedade do veículo permanece com o(a)
                  VENDEDOR(A) até a transferência ao comprador final, respondendo a COMPRADORA pelas
                  infrações de trânsito cometidas no período em que detiver a posse.
                </p>
              </>
            ) : isConsigned ? (
              <>
                <p>
                  A consignação é ajustada entre as partes por este instrumento. A propriedade do
                  veículo <strong>permanece com o(a) VENDEDOR(A)</strong> até a venda a terceiro,
                  ocasião em que assinará a autorização para transferência de propriedade
                  (CRV/ATPV-e) em favor do comprador final.
                </p>
                <p className="mt-1">
                  <strong>Parágrafo único.</strong> A COMPRADORA responde pelas infrações de trânsito
                  cometidas no período em que detiver a posse do veículo, obrigando-se as partes, no
                  que couber, ao cumprimento dos arts. 123 e 134 do Código de Trânsito Brasileiro.
                </p>
              </>
            ) : usaRenave ? (
              <>
                <p>
                  O(A) VENDEDOR(A) entrega nesta data a autorização para transferência de propriedade
                  (CRV/ATPV-e) assinada, com firma reconhecida ou mediante assinatura eletrônica
                  avançada ou qualificada, nos termos do art. 123, § 4º, do Código de Trânsito
                  Brasileiro e da Lei nº 14.063, de 23 de setembro de 2020.
                </p>
                <p className="mt-1">
                  <strong>Parágrafo primeiro.</strong> A COMPRADORA, estabelecimento que exerce a
                  atividade de compra e venda de veículos, procederá ao <strong>registro eletrônico
                  de entrada</strong> do veículo em seu estoque no{" "}
                  <strong>Registro Nacional de Veículos em Estoque — Renave</strong>, na forma da
                  Resolução Contran nº 1.026, de 26 de junho de 2026, do que decorre a anotação de
                  &quot;veículo em estoque&quot; no cadastro do veículo, dispensada a expedição de
                  novo Certificado de Registro de Veículo em nome da COMPRADORA enquanto o veículo
                  permanecer em estoque para revenda.
                </p>
                <p className="mt-1">
                  <strong>Parágrafo segundo.</strong> O(A) VENDEDOR(A) obriga-se a fornecer os
                  documentos e as informações necessários ao registro e declara estar ciente de que
                  ele somente se realiza sobre veículo <strong>sem restrições impeditivas e sem
                  débitos não liquidados</strong> (art. 11, § 2º, da referida Resolução),
                  respondendo, na forma da Cláusula 4ª, pelo que for anterior à tradição.
                </p>
                <p className="mt-1">
                  <strong>Parágrafo terceiro.</strong> As partes obrigam-se, no que couber, ao
                  cumprimento dos arts. 123 e 134 do Código de Trânsito Brasileiro.
                </p>
              </>
            ) : (
              <>
                <p>
                  O(A) VENDEDOR(A) entrega nesta data a autorização para transferência de propriedade
                  (CRV/ATPV-e) assinada, com firma reconhecida ou mediante assinatura eletrônica
                  avançada ou qualificada, nos termos do art. 123, § 4º, do Código de Trânsito
                  Brasileiro e da Lei nº 14.063, de 23 de setembro de 2020.
                </p>
                <p className="mt-1">
                  <strong>Parágrafo único.</strong> Cabe à COMPRADORA providenciar a regularização do
                  registro do veículo na forma da legislação aplicável, obrigando-se as partes, no que
                  couber, ao cumprimento dos arts. 123 e 134 do Código de Trânsito Brasileiro.
                </p>
              </>
            )}
          </div>

          <div>
            <p className="font-bold">Cláusula 7ª — Da cláusula penal</p>
            <p>
              O descumprimento de qualquer obrigação deste contrato sujeita a parte infratora à
              multa de 10% (dez por cento) sobre o valor do negócio, sem prejuízo de perdas e danos
              e da execução específica das obrigações.
            </p>
          </div>

          <div>
            <p className="font-bold">Cláusula 8ª — Do foro</p>
            <p>
              Fica eleito o foro da comarca de {companyCity || <Blank w="12rem" />}, com renúncia a
              qualquer outro, por mais privilegiado que seja, para dirimir dúvidas oriundas deste
              contrato.
            </p>
          </div>
        </section>

        <p className="mt-6 text-sm">
          E por estarem justas e contratadas, as partes assinam o presente em 2 (duas) vias de igual
          teor, na presença das testemunhas abaixo.
        </p>

        <p className="mt-4 text-sm">
          {companyCity || <Blank w="12rem" />}, {formatDate(today)}.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-sm">
          <div>
            <div className="border-t border-slate-400 pt-2">
              {s?.name || "Vendedor(a)"}
              <p className="text-xs text-slate-500">VENDEDOR(A)</p>
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2">
              {company.razaoSocial}
              <p className="text-xs text-slate-500">COMPRADORA</p>
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
          <div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-medium">Testemunha 1</p>
              <p className="mt-1 text-xs text-slate-500">
                Nome: <Blank w="10rem" />
              </p>
              <p className="mt-1 text-xs text-slate-500">
                CPF: <Blank w="8rem" />
              </p>
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-medium">Testemunha 2</p>
              <p className="mt-1 text-xs text-slate-500">
                Nome: <Blank w="10rem" />
              </p>
              <p className="mt-1 text-xs text-slate-500">
                CPF: <Blank w="8rem" />
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
