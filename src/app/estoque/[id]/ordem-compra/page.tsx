import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";

export const dynamic = "force-dynamic";

export default async function OrdemCompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <LinkButton variant="secondary" href={`/estoque/${vehicle.id}`}>
          ← Voltar
        </LinkButton>
        <PrintButton />
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        <CompanyDocHeader
          company={company}
          right={
            <>
              <p className="font-bold">ORDEM DE COMPRA</p>
              <p className="text-slate-500">Nº {vehicle.id.slice(-8).toUpperCase()}</p>
              <p className="text-slate-500">Data da compra: {formatDate(vehicle.entryDate)}</p>
            </>
          }
        />

        <section className="mb-5">
          <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Vendedor (origem do veículo)
          </h2>
          {s ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <p><span className="text-slate-500">Nome:</span> <strong>{s.name}</strong></p>
              <p><span className="text-slate-500">CPF/CNPJ:</span> {s.document || "—"}</p>
              <p><span className="text-slate-500">Telefone:</span> {s.phone || "—"}</p>
              <p><span className="text-slate-500">E-mail:</span> {s.email || "—"}</p>
              <p className="sm:col-span-2"><span className="text-slate-500">Endereço:</span> {s.address || "—"}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Particular / sem fornecedor cadastrado.</p>
          )}
        </section>

        <section className="mb-5">
          <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Veículo
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <p><span className="text-slate-500">Marca/Modelo:</span> <strong>{vehicle.brand} {vehicle.model}</strong></p>
            <p><span className="text-slate-500">Versão:</span> {vehicle.version || "—"}</p>
            <p><span className="text-slate-500">Ano:</span> {vehicle.manufactureYear}/{vehicle.modelYear}</p>
            <p><span className="text-slate-500">Placa:</span> <strong>{vehicle.plate}</strong></p>
            <p><span className="text-slate-500">Chassi:</span> {vehicle.chassi || "—"}</p>
            <p><span className="text-slate-500">Cor:</span> {vehicle.color || "—"}</p>
            <p><span className="text-slate-500">KM:</span> {vehicle.km.toLocaleString("pt-BR")}</p>
            <p><span className="text-slate-500">Combustível:</span> {vehicle.fuel || "—"}</p>
            <p><span className="text-slate-500">Câmbio:</span> {vehicle.transmission || "—"}</p>
          </div>
        </section>

        <section className="mb-5">
          <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            Condições da compra
          </h2>
          <p className="text-sm">
            <span className="text-slate-500">Valor de compra:</span>{" "}
            <strong>{formatCurrency(vehicle.purchasePrice)}</strong>
          </p>
          {vehicle.payables.length > 0 ? (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
                  <th className="py-1">Pagamento</th>
                  <th className="py-1">Vencimento</th>
                  <th className="py-1">Situação</th>
                  <th className="py-1 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {vehicle.payables.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-1">{p.description.replace(` - placa ${vehicle.plate}`, "")}</td>
                    <td className="py-1">{formatDate(p.dueDate)}</td>
                    <td className="py-1">{p.status === "PAGO" ? "Pago" : "Pendente"}</td>
                    <td className="py-1 text-right tabular-nums">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>

        {vehicle.notes ? (
          <section className="mb-5 text-sm">
            <h2 className="mb-2 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Observações
            </h2>
            <p>{vehicle.notes}</p>
          </section>
        ) : null}

        <p className="mb-10 mt-8 text-xs text-slate-500">
          O vendedor declara que o veículo está livre e desembaraçado de quaisquer ônus, alienações,
          multas ou restrições judiciais até a data desta negociação, responsabilizando-se por débitos
          anteriores à entrega.
        </p>

        <div className="grid grid-cols-2 gap-10 pt-6 text-center text-sm">
          <div>
            <div className="border-t border-slate-400 pt-2">{s?.name || "Vendedor"}</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2">{company.razaoSocial} (comprador)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
