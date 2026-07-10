import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "À vista", PARCELADO: "Parcelado", FINANCIADO: "Financiado" } as const;

export default async function DocumentoVendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { vehicle: true, customer: true, receivables: { orderBy: { dueDate: "asc" } } },
  });
  if (!sale) notFound();

  const v = sale.vehicle;
  const c = sale.customer;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <LinkButton variant="secondary" href={`/vendas/${sale.id}`}>
          ← Voltar
        </LinkButton>
        <PrintButton />
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        <header className="mb-6 flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">MVP VEÍCULOS</h1>
            <p className="text-sm text-slate-500">Gestão de seminovos</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold">ORDEM DE VENDA</p>
            <p className="text-slate-500">Nº {sale.id.slice(-8).toUpperCase()}</p>
            <p className="text-slate-500">Emissão: {formatDate(sale.saleDate)}</p>
          </div>
        </header>

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
          </div>
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

        <div className="grid grid-cols-2 gap-10 pt-6 text-center text-sm">
          <div>
            <div className="border-t border-slate-400 pt-2">MVP Veículos (vendedor)</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2">{c.name} (comprador)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
