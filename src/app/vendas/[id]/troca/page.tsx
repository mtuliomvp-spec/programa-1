import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "à vista", PARCELADO: "parcelado", FINANCIADO: "financiado" } as const;

/**
 * Documento único de TROCA: reúne, numa só folha, a venda do veículo da loja
 * ao cliente e a compra do veículo que o cliente entregou como parte do
 * pagamento, com o encontro de contas e as cláusulas de responsabilidade.
 */
export default async function DocumentoTrocaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      vehicle: true,
      tradeInVehicle: true,
      customer: true,
      receivables: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!sale || !sale.tradeInVehicle) notFound();

  const company = await getCompany();
  const v = sale.vehicle; // veículo vendido pela loja
  const ti = sale.tradeInVehicle; // veículo recebido em troca
  const c = sale.customer;

  const tiLiquido = Math.max(
    0,
    Math.round((ti.purchasePrice - ti.payoffAmount - ti.debtsAmount) * 100) / 100,
  );
  const saldoAPagar = Math.max(0, Math.round((sale.totalAmount - tiLiquido) * 100) / 100);
  const companyCity = company.city ? `${company.city}${company.uf ? `/${company.uf}` : ""}` : null;
  // Parcelas da venda que não são a entrada em troca.
  const parcelasVenda = sale.receivables.filter(
    (r) => !r.description.includes("Entrada em troca"),
  );

  const Blank = ({ w = "8rem" }: { w?: string }) => (
    <span className="inline-block border-b border-slate-400 align-baseline" style={{ minWidth: w }}>
      &nbsp;
    </span>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <LinkButton variant="secondary" href={`/vendas/${sale.id}`}>
          ← Voltar
        </LinkButton>
        <PrintButton />
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        <CompanyDocHeader
          company={company}
          right={
            <>
              <p className="font-bold">TERMO DE TROCA</p>
              <p className="text-slate-500">Nº {String(sale.orderNumber).padStart(4, "0")}</p>
              <p className="text-slate-500">Data: {formatDate(sale.saleDate)}</p>
            </>
          }
        />

        <h1 className="mb-4 text-center text-base font-black uppercase tracking-tight">
          Termo de Compra e Venda com Troca de Veículos
        </h1>

        <section className="mb-4 text-sm leading-relaxed">
          <p>
            <strong>{company.razaoSocial.toUpperCase()}</strong>, CNPJ nº{" "}
            {company.cnpj || <Blank w="10rem" />}
            {company.address ? `, com endereço em ${company.address}${companyCity ? `, ${companyCity}` : ""}` : ""},
            doravante <strong>LOJA</strong>; e{" "}
            <strong>{c.name}</strong>, CPF/CNPJ nº {c.document || <Blank w="9rem" />}, telefone{" "}
            {c.phone || <Blank />}, endereço {c.address || <Blank w="14rem" />}, doravante{" "}
            <strong>CLIENTE</strong>, ajustam a presente troca:
          </p>
        </section>

        <section className="space-y-3 text-sm leading-relaxed">
          <div>
            <p className="font-bold">Cláusula 1ª — Do veículo vendido pela LOJA ao CLIENTE</p>
            <p>
              A LOJA vende ao CLIENTE o veículo{" "}
              <strong>
                {v.brand} {v.model}
              </strong>
              {v.version ? `, ${v.version}` : ""}, ano {v.manufactureYear}/{v.modelYear}, placa{" "}
              <strong>{v.plate}</strong>, chassi {v.chassi || <Blank w="10rem" />}, cor{" "}
              {v.color || <Blank />}, {v.km.toLocaleString("pt-BR")} km, pelo preço de{" "}
              <strong>{formatCurrency(sale.totalAmount)}</strong>, na forma{" "}
              <strong>{paymentLabel[sale.paymentMethod]}</strong>.
            </p>
          </div>

          <div>
            <p className="font-bold">Cláusula 2ª — Do veículo dado em troca pelo CLIENTE</p>
            <p>
              O CLIENTE entrega à LOJA, como parte do pagamento, o veículo{" "}
              <strong>
                {ti.brand} {ti.model}
              </strong>
              , ano {ti.manufactureYear}/{ti.modelYear}, placa <strong>{ti.plate}</strong>, chassi{" "}
              {ti.chassi || <Blank w="10rem" />}, cor {ti.color || <Blank />},{" "}
              {ti.km.toLocaleString("pt-BR")} km, avaliado em{" "}
              <strong>{formatCurrency(ti.purchasePrice)}</strong>.
            </p>
            {ti.payoffAmount > 0 || ti.debtsAmount > 0 ? (
              <p className="mt-1">
                Do valor avaliado, a LOJA assume e quitará diretamente:{" "}
                {ti.payoffAmount > 0 ? (
                  <>
                    o saldo devedor do financiamento de{" "}
                    <strong>{formatCurrency(ti.payoffAmount)}</strong>
                    {ti.payoffTo ? ` junto a ${ti.payoffTo}` : ""}
                  </>
                ) : null}
                {ti.payoffAmount > 0 && ti.debtsAmount > 0 ? " e " : ""}
                {ti.debtsAmount > 0 ? (
                  <>
                    os débitos do veículo (IPVA, licenciamento e multas) de{" "}
                    <strong>{formatCurrency(ti.debtsAmount)}</strong>
                  </>
                ) : null}
                , resultando no valor líquido de{" "}
                <strong className="text-emerald-700">{formatCurrency(tiLiquido)}</strong>, aproveitado
                como entrada da compra descrita na Cláusula 1ª.
              </p>
            ) : (
              <p className="mt-1">
                O valor de <strong>{formatCurrency(tiLiquido)}</strong> é aproveitado como entrada da
                compra descrita na Cláusula 1ª.
              </p>
            )}
          </div>

          <div>
            <p className="font-bold">Cláusula 3ª — Do encontro de contas</p>
            <p>
              Preço da venda {formatCurrency(sale.totalAmount)} − entrada pela troca{" "}
              {formatCurrency(tiLiquido)} ={" "}
              <strong>saldo a pagar pelo CLIENTE de {formatCurrency(saldoAPagar)}</strong>
              {saldoAPagar > 0
                ? `, na forma ${paymentLabel[sale.paymentMethod]}, conforme abaixo:`
                : ", ficando a venda integralmente quitada pela troca."}
            </p>
            {saldoAPagar > 0 && parcelasVenda.length > 0 ? (
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
                    <th className="py-1">Parcela</th>
                    <th className="py-1">Vencimento</th>
                    <th className="py-1 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {parcelasVenda.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="py-1">
                        {r.installmentNumber === 0
                          ? "Entrada"
                          : r.installmentNumber
                            ? `${r.installmentNumber}/${r.totalInstallments}`
                            : "Única"}
                      </td>
                      <td className="py-1">{formatDate(r.dueDate)}</td>
                      <td className="py-1 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>

          <div>
            <p className="font-bold">Cláusula 4ª — Da responsabilidade por débitos anteriores</p>
            <p>
              Cada parte responde pelos débitos, tributos e multas cujo fato gerador seja anterior à
              entrega do respectivo veículo (art. 502 do Código Civil): a LOJA, quanto ao veículo
              vendido; o CLIENTE, quanto ao veículo dado em troca. Havendo débito anterior de
              responsabilidade de uma parte pago pela outra, o valor poderá ser compensado, cobrado
              ou executado, atualizado, com juros de 1% ao mês e multa de 10%.
            </p>
          </div>

          <div>
            <p className="font-bold">Cláusula 5ª — Da entrega e da transferência</p>
            <p>
              Ambos os veículos são entregues nesta data, com os respectivos documentos de
              transferência (CRV/ATPV-e) assinados, obrigando-se as partes ao cumprimento dos arts.
              123 e 134 do Código de Trânsito Brasileiro. Cada parte recebe o veículo no estado de
              uso e conservação em que se encontra, por ela vistoriado.
            </p>
          </div>

          <div>
            <p className="font-bold">Cláusula 6ª — Do foro</p>
            <p>
              Fica eleito o foro da comarca de {companyCity || <Blank w="10rem" />} para dirimir
              dúvidas oriundas deste termo.
            </p>
          </div>
        </section>

        <p className="mt-6 text-sm">
          E por estarem justas e contratadas, assinam em 2 (duas) vias de igual teor, na presença
          das testemunhas.
        </p>
        <p className="mt-3 text-sm">
          {companyCity || <Blank w="10rem" />}, {formatDate(sale.saleDate)}.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-sm">
          <div>
            <div className="border-t border-slate-400 pt-2">
              {company.razaoSocial}
              <p className="text-xs text-slate-500">LOJA</p>
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2">
              {c.name}
              <p className="text-xs text-slate-500">CLIENTE</p>
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-10 text-sm">
          <div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-medium">Testemunha 1</p>
              <p className="mt-1 text-xs text-slate-500">Nome / CPF: <Blank w="9rem" /></p>
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-medium">Testemunha 2</p>
              <p className="mt-1 text-xs text-slate-500">Nome / CPF: <Blank w="9rem" /></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
