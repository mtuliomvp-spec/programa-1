import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "à vista", PARCELADO: "parcelado", FINANCIADO: "financiado" } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Cláusula numerada do contrato. */
function Clausula({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 text-sm leading-relaxed text-slate-800">
      <h2 className="mb-1 font-bold">
        CLÁUSULA {n}ª — {titulo}
      </h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export default async function ContratoPreVendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pre = await prisma.preSale.findUnique({ where: { id } });
  if (!pre) notFound();

  const [company, vehicle, customer, financer, advanceRow] = await Promise.all([
    getCompany(),
    prisma.vehicle.findUnique({ where: { id: pre.vehicleId } }),
    prisma.customer.findUnique({ where: { id: pre.customerId } }),
    pre.financerAccountId
      ? prisma.financialAccount.findUnique({ where: { id: pre.financerAccountId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.receivable.aggregate({
      _sum: { amount: true },
      where: { vehicleId: pre.vehicleId, saleId: null, status: "RECEBIDO" },
    }),
  ]);
  if (!vehicle || !customer) notFound();

  // Composição do pagamento (mesma base da ficha de negócio).
  const total = pre.totalAmount;
  const tiLiquido = pre.tradeIn
    ? Math.max(0, round2((pre.tiNegotiated ?? 0) - (pre.tiPayoff ?? 0) - (pre.tiDebts ?? 0)))
    : 0;
  const sinal = advanceRow._sum.amount ?? 0;
  const financiado = pre.paymentMethod === "FINANCIADO" ? pre.financedAmount ?? 0 : 0;
  const entrada = pre.paymentMethod === "PARCELADO" ? pre.downPayment : 0;
  const saldo = Math.max(0, round2(total - tiLiquido - sinal - financiado - entrada));
  const parcelaValor =
    pre.paymentMethod === "PARCELADO" && pre.installmentsCount > 0
      ? round2(saldo / pre.installmentsCount)
      : 0;

  const cidadeData = company.city
    ? `${company.city}${company.uf ? `/${company.uf}` : ""}, ${formatDate(pre.saleDate)}`
    : formatDate(pre.saleDate);

  // Numeração das cláusulas (algumas são condicionais).
  let n = 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <LinkButton variant="secondary" href={`/vendas/pre-vendas/${pre.id}`}>
          ← Voltar
        </LinkButton>
        <PrintButton />
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        <CompanyDocHeader
          company={company}
          right={
            <>
              <p className="font-bold">CONTRATO DE COMPRA E VENDA</p>
              <p className="text-slate-500">Nº {String(pre.number).padStart(4, "0")}</p>
              <p className="text-slate-500">{formatDate(pre.saleDate)}</p>
            </>
          }
        />

        <h1 className="mb-5 text-center text-base font-bold uppercase tracking-wide">
          Contrato particular de compra e venda de veículo automotor
        </h1>

        <section className="mb-5 space-y-2 text-sm leading-relaxed text-slate-800">
          <p>
            <strong>VENDEDORA:</strong> {company.razaoSocial}
            {company.cnpj ? `, inscrita no CNPJ sob o nº ${company.cnpj}` : ""}
            {company.address ? `, com endereço em ${company.address}` : ""}
            {company.city ? ` — ${company.city}${company.uf ? `/${company.uf}` : ""}` : ""}.
          </p>
          <p>
            <strong>COMPRADOR(A):</strong> {customer.name}
            {customer.document ? `, portador(a) do CPF/CNPJ nº ${customer.document}` : ""}
            {customer.phone ? `, telefone ${customer.phone}` : ""}
            {customer.address ? `, residente em ${customer.address}` : ""}.
          </p>
          <p>
            As partes acima qualificadas têm, entre si, justo e contratado o presente Contrato de
            Compra e Venda de Veículo Automotor, que se regerá pelas cláusulas seguintes.
          </p>
        </section>

        <Clausula n={++n} titulo="Do objeto">
          <p>
            O presente contrato tem por objeto a venda do veículo abaixo descrito, de propriedade da
            VENDEDORA:
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-slate-50 p-3 sm:grid-cols-3">
            <p><span className="text-slate-500">Marca/Modelo:</span> <strong>{vehicle.brand} {vehicle.model}</strong></p>
            <p><span className="text-slate-500">Versão:</span> {vehicle.version || "—"}</p>
            <p><span className="text-slate-500">Ano fab./mod.:</span> {vehicle.manufactureYear}/{vehicle.modelYear}</p>
            <p><span className="text-slate-500">Placa:</span> <strong>{vehicle.plate}</strong></p>
            <p><span className="text-slate-500">Chassi:</span> {vehicle.chassi || "—"}</p>
            <p><span className="text-slate-500">Cor:</span> {vehicle.color || "—"}</p>
            <p><span className="text-slate-500">KM:</span> {vehicle.km.toLocaleString("pt-BR")}</p>
            <p><span className="text-slate-500">Combustível:</span> {vehicle.fuel || "—"}</p>
            <p><span className="text-slate-500">Câmbio:</span> {vehicle.transmission || "—"}</p>
          </div>
        </Clausula>

        <Clausula n={++n} titulo="Do preço e da forma de pagamento">
          <p>
            O preço total, certo e ajustado para a presente venda é de{" "}
            <strong>{formatCurrency(total)}</strong>, pago da forma <strong>{paymentLabel[pre.paymentMethod]}</strong>,
            conforme a composição abaixo:
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-1">Valor total da venda</td>
                <td className="py-1 text-right tabular-nums font-medium">{formatCurrency(total)}</td>
              </tr>
              {tiLiquido > 0 ? (
                <tr className="border-b border-slate-100">
                  <td className="py-1">(−) Entrada com veículo em troca{pre.tiPlate ? ` (placa ${pre.tiPlate})` : ""}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(tiLiquido)}</td>
                </tr>
              ) : null}
              {sinal > 0 ? (
                <tr className="border-b border-slate-100">
                  <td className="py-1">(−) Sinal já pago</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(sinal)}</td>
                </tr>
              ) : null}
              {entrada > 0 ? (
                <tr className="border-b border-slate-100">
                  <td className="py-1">(−) Entrada</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(entrada)}</td>
                </tr>
              ) : null}
              {financiado > 0 ? (
                <tr className="border-b border-slate-100">
                  <td className="py-1">(−) Financiamento{financer?.name ? ` — ${financer.name}` : ""}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(financiado)}</td>
                </tr>
              ) : null}
              <tr className="border-t border-slate-300">
                <td className="py-1 font-bold">= Saldo a pagar</td>
                <td className="py-1 text-right tabular-nums font-bold">{formatCurrency(saldo)}</td>
              </tr>
            </tbody>
          </table>
          {pre.paymentMethod === "PARCELADO" && pre.installmentsCount > 0 ? (
            <p className="mt-2">
              O saldo será pago em <strong>{pre.installmentsCount}</strong> parcela(s) de{" "}
              <strong>{formatCurrency(parcelaValor)}</strong>.
            </p>
          ) : null}
        </Clausula>

        {pre.tradeIn ? (
          <Clausula n={++n} titulo="Do veículo recebido em troca">
            <p>
              A VENDEDORA recebe, como parte do pagamento, o veículo{" "}
              <strong>{[pre.tiBrand, pre.tiModel, pre.tiPlate].filter(Boolean).join(" ") || "—"}</strong>,
              avaliado em {formatCurrency(pre.tiNegotiated ?? 0)}
              {(pre.tiPayoff ?? 0) > 0 ? `, com quitação de ${formatCurrency(pre.tiPayoff ?? 0)}${pre.tiPayoffTo ? ` junto a ${pre.tiPayoffTo}` : ""}` : ""}
              {(pre.tiDebts ?? 0) > 0 ? ` e débitos de ${formatCurrency(pre.tiDebts ?? 0)}` : ""}, resultando no valor
              líquido de <strong>{formatCurrency(tiLiquido)}</strong> aproveitado como entrada desta venda. O(A)
              COMPRADOR(A) declara que o veículo dado em troca é de sua legítima propriedade e está livre de
              quaisquer ônus além dos aqui declarados.
            </p>
          </Clausula>
        ) : null}

        <Clausula n={++n} titulo="Do estado do veículo">
          <p>
            O veículo é vendido no estado em que se encontra, tendo o(a) COMPRADOR(A) examinado e
            aceito suas condições de funcionamento, lataria, pintura e demais itens, nada tendo a
            reclamar posteriormente quanto ao seu estado aparente e de conservação.
          </p>
        </Clausula>

        <Clausula n={++n} titulo="Da transferência e dos débitos">
          <p>
            A transferência da propriedade junto ao órgão de trânsito (DETRAN) será providenciada pelo(a)
            COMPRADOR(A) no prazo legal de 30 (trinta) dias, correndo por sua conta as despesas de
            transferência. Os débitos (IPVA, licenciamento, multas) até a data deste contrato são de
            responsabilidade da VENDEDORA; a partir desta data, do(a) COMPRADOR(A).
          </p>
        </Clausula>

        <Clausula n={++n} titulo="Do foro">
          <p>
            As partes elegem o foro da comarca de{" "}
            {company.city ? `${company.city}${company.uf ? `/${company.uf}` : ""}` : "___________________"} para
            dirimir quaisquer dúvidas oriundas deste contrato, renunciando a qualquer outro, por mais
            privilegiado que seja.
          </p>
        </Clausula>

        {pre.notes ? (
          <Clausula n={++n} titulo="Das observações">
            <p className="whitespace-pre-wrap">{pre.notes}</p>
          </Clausula>
        ) : null}

        <p className="mb-8 mt-6 text-sm">
          E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em duas
          vias de igual teor.
        </p>

        <p className="mb-10 text-sm">{cidadeData}.</p>

        <div className="grid grid-cols-2 gap-10 text-center text-sm">
          <div>
            <div className="border-t border-slate-400 pt-2">{company.razaoSocial}</div>
            <p className="text-xs text-slate-500">VENDEDORA</p>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2">{customer.name}</div>
            <p className="text-xs text-slate-500">COMPRADOR(A)</p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-slate-500">
          <div className="border-t border-slate-400 pt-1">Testemunha 1 — Nome / CPF</div>
          <div className="border-t border-slate-400 pt-1">Testemunha 2 — Nome / CPF</div>
        </div>
      </div>
    </div>
  );
}
