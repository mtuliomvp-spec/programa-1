import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Contrato particular de compra e venda de veículo usado (loja como
 * COMPRADORA), com cláusula de responsabilidade do vendedor por débitos
 * anteriores à tradição e força de título executivo extrajudicial
 * (art. 784, III, do CPC — assinatura do devedor + 2 testemunhas).
 */
export default async function ContratoCompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      supplier: true,
      payables: { where: { category: "COMPRA_VEICULO" }, orderBy: { dueDate: "asc" } },
    },
  });
  if (!vehicle) notFound();

  const s = vehicle.supplier;
  const allPaid = vehicle.payables.length > 0 && vehicle.payables.every((p) => p.status === "PAGO");
  const today = new Date();

  const Blank = ({ w = "8rem" }: { w?: string }) => (
    <span className="inline-block border-b border-slate-400 align-baseline" style={{ minWidth: w }}>
      &nbsp;
    </span>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <LinkButton variant="secondary" href={`/estoque/${vehicle.id}`}>
          ← Voltar
        </LinkButton>
        <PrintButton />
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        <header className="mb-6 border-b-2 border-slate-900 pb-4 text-center">
          <h1 className="text-lg font-black uppercase tracking-tight">
            Contrato Particular de Compra e Venda de Veículo Usado
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Instrumento nº {vehicle.id.slice(-8).toUpperCase()} · com força de título executivo
            extrajudicial (art. 784, III, do Código de Processo Civil)
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
            <strong>MVP VEÍCULOS</strong>, CNPJ nº <Blank w="10rem" />, com endereço em{" "}
            <Blank w="20rem" />, neste ato representada na forma de seus atos constitutivos,
            doravante denominada simplesmente <strong>COMPRADORA</strong>.
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
              <strong>{vehicle.plate}</strong>, chassi {vehicle.chassi || <Blank w="12rem" />}, cor{" "}
              {vehicle.color || <Blank />}, combustível {vehicle.fuel || <Blank />}, com{" "}
              {vehicle.km.toLocaleString("pt-BR")} km, no estado de uso e conservação vistoriado
              pelas partes.
            </p>
          </div>

          <div>
            <p className="font-bold">Cláusula 2ª — Do preço e da forma de pagamento</p>
            <p>
              O preço certo e ajustado é de <strong>{formatCurrency(vehicle.purchasePrice)}</strong>
              {allPaid
                ? `, pago integralmente pela COMPRADORA na data de ${formatDate(vehicle.entryDate)}, servindo este contrato como recibo de quitação do valor pago.`
                : ", a ser pago conforme o cronograma abaixo:"}
            </p>
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
            <p className="font-bold">Cláusula 3ª — Da entrega (tradição)</p>
            <p>
              O veículo é entregue à COMPRADORA nesta data, com todos os seus pertences e
              acessórios, juntamente com o Certificado de Registro do Veículo (CRV/ATPV-e)
              devidamente assinado pelo(a) VENDEDOR(A), livre de pessoas e coisas.
            </p>
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
            <p className="font-bold">Cláusula 6ª — Da transferência e comunicação de venda</p>
            <p>
              O(A) VENDEDOR(A) entrega nesta data a autorização para transferência de propriedade
              (CRV/ATPV-e) assinada. A COMPRADORA, revendedora de veículos usados, fica dispensada
              da averbação imediata na forma da regulamentação do CONTRAN aplicável a estoque de
              revenda, obrigando-se as partes, no que couber, ao cumprimento dos arts. 123 e 134 do
              Código de Trânsito Brasileiro.
            </p>
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
              Fica eleito o foro da comarca de <Blank w="12rem" />, com renúncia a qualquer outro,
              por mais privilegiado que seja, para dirimir dúvidas oriundas deste contrato.
            </p>
          </div>
        </section>

        <p className="mt-6 text-sm">
          E por estarem justas e contratadas, as partes assinam o presente em 2 (duas) vias de igual
          teor, na presença das testemunhas abaixo.
        </p>

        <p className="mt-4 text-sm">
          <Blank w="12rem" />, {formatDate(today)}.
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
              MVP Veículos
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
