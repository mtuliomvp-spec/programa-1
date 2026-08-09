import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "À vista", PARCELADO: "Parcelado", FINANCIADO: "Financiado" } as const;

export default async function DocumentoVendaPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!sale) notFound();

  const company = await getCompany();
  const v = sale.vehicle;
  const c = sale.customer;
  const ti = sale.tradeInVehicle;
  const tiLiquido = ti
    ? Math.max(0, Math.round((ti.purchasePrice - ti.payoffAmount - ti.debtsAmount) * 100) / 100)
    : 0;

  // Sinal já recebido e devolução ao cliente (quando as entradas superam o preço).
  const sinalRecebido = sale.receivables
    .filter((r) => r.description.toLowerCase().includes("sinal"))
    .reduce((s, r) => s + r.amount, 0);
  const devolucaoRow = await prisma.payable.aggregate({
    _sum: { amount: true },
    where: { vehicleId: sale.vehicleId, category: "DEVOLUCAO_CLIENTE" },
  });
  const devolucao = devolucaoRow._sum.amount ?? 0;

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
              <p className="font-bold">ORDEM DE VENDA</p>
              <p className="text-slate-500">Nº {String(sale.orderNumber).padStart(4, "0")}</p>
              <p className="text-slate-500">Emissão: {formatDate(sale.saleDate)}</p>
            </>
          }
        />

        <section className="mb-5">
          <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Comprador
          </h2>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">Nome:</span> <strong>{c.name}</strong></p>
            <p><span className="text-slate-500">CPF/CNPJ:</span> {c.document || "—"}</p>
            <p><span className="text-slate-500">Telefone:</span> {c.phone || "—"}</p>
            <p><span className="text-slate-500">E-mail:</span> {c.email || "—"}</p>
            <p className="sm:col-span-2"><span className="text-slate-500">Endereço:</span> {c.address || "—"}</p>
          </div>
        </section>

        <section className="mb-5">
          <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Veículo
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <p><span className="text-slate-500">Marca/Modelo:</span> <strong>{v.brand} {v.model}</strong></p>
            <p><span className="text-slate-500">Versão:</span> {v.version || "—"}</p>
            <p><span className="text-slate-500">Ano:</span> {v.manufactureYear}/{v.modelYear}</p>
            <p><span className="text-slate-500">Placa:</span> <strong>{v.plate}</strong></p>
            <p><span className="text-slate-500">Chassi:</span> {v.chassi || "—"}</p>
            <p><span className="text-slate-500">Cor:</span> {v.color || "—"}</p>
            <p><span className="text-slate-500">KM:</span> {v.km.toLocaleString("pt-BR")}</p>
            <p><span className="text-slate-500">Combustível:</span> {v.fuel || "—"}</p>
            <p><span className="text-slate-500">Câmbio:</span> {v.transmission || "—"}</p>
          </div>
        </section>

        <section className="mb-5">
          <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Condições da venda
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <p><span className="text-slate-500">Valor total:</span> <strong>{formatCurrency(sale.totalAmount)}</strong></p>
            <p><span className="text-slate-500">Forma:</span> {paymentLabel[sale.paymentMethod]}</p>
            {sale.downPayment > 0 ? (
              <p><span className="text-slate-500">Entrada:</span> {formatCurrency(sale.downPayment)}</p>
            ) : null}
            {sale.installmentsCount > 0 ? (
              <p><span className="text-slate-500">Parcelas:</span> {sale.installmentsCount}x</p>
            ) : null}
            <p><span className="text-slate-500">Vendedor:</span> {sale.sellerName || "—"}</p>
            {tiLiquido > 0 ? (
              <p><span className="text-slate-500">Entrada pela troca:</span> {formatCurrency(tiLiquido)}</p>
            ) : null}
            {sinalRecebido > 0 ? (
              <p><span className="text-slate-500">Sinal já recebido:</span> {formatCurrency(sinalRecebido)}</p>
            ) : null}
          </div>
          {devolucao > 0 ? (
            <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              Devolução ao CLIENTE: {formatCurrency(devolucao)} — as entradas (troca, sinal e
              financiamento) superam o preço da venda e a diferença será devolvida ao cliente.
            </p>
          ) : null}
          {sale.receivables.length > 1 ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
                  <th className="py-1">Parcela</th>
                  <th className="py-1">Vencimento</th>
                  <th className="py-1 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {sale.receivables.map((r) => (
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
        </section>

        {ti ? (
          <section className="mb-5">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Veículo recebido em troca (parte do pagamento)
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <p><span className="text-slate-500">Marca/Modelo:</span> <strong>{ti.brand} {ti.model}</strong></p>
              <p><span className="text-slate-500">Ano:</span> {ti.manufactureYear}/{ti.modelYear}</p>
              <p><span className="text-slate-500">Placa:</span> <strong>{ti.plate}</strong></p>
              <p><span className="text-slate-500">Cor:</span> {ti.color || "—"}</p>
              <p><span className="text-slate-500">KM:</span> {ti.km.toLocaleString("pt-BR")}</p>
              <p><span className="text-slate-500">Chassi:</span> {ti.chassi || "—"}</p>
              <p><span className="text-slate-500">Avaliação:</span> {formatCurrency(ti.purchasePrice)}</p>
              {ti.payoffAmount > 0 ? (
                <p><span className="text-slate-500">Quitação{ti.payoffTo ? ` (${ti.payoffTo})` : ""}:</span> − {formatCurrency(ti.payoffAmount)}</p>
              ) : null}
              {ti.debtsAmount > 0 ? (
                <p><span className="text-slate-500">Débitos:</span> − {formatCurrency(ti.debtsAmount)}</p>
              ) : null}
              <p className="sm:col-span-3">
                <span className="text-slate-500">Valor aproveitado como entrada:</span>{" "}
                <strong className="text-emerald-700">{formatCurrency(tiLiquido)}</strong>
              </p>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              O(A) comprador(a) entrega o veículo acima como parte do pagamento. A COMPRADORA
              (MVP Veículos) assume a quitação do financiamento e os débitos indicados, cabendo ao
              comprador o valor líquido aproveitado como entrada desta venda.
            </p>
          </section>
        ) : null}

        {sale.notes ? (
          <section className="mb-5 text-sm">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Observações
            </h2>
            <p>{sale.notes}</p>
          </section>
        ) : null}

        <p className="mb-10 mt-8 text-xs text-slate-500">
          O veículo é vendido no estado em que se encontra, tendo o comprador examinado e aceito suas
          condições. A transferência de propriedade junto ao órgão de trânsito deverá ser realizada no
          prazo legal de 30 dias a contar desta data.
        </p>

        {/*
          Documento interno da revenda — não é entregue ao cliente. Por isso só
          há a assinatura da loja: quem assina com o comprador é o contrato.
        */}
        <div className="pt-6 text-center text-sm">
          <div className="mx-auto w-64 border-t border-slate-400 pt-2">
            {company.razaoSocial} (vendedor)
          </div>
        </div>
      </div>
    </div>
  );
}
