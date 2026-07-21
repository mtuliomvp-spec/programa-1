import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import SaleContractDocument from "@/components/SaleContractDocument";

export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default async function ContratoVendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { vehicle: true, tradeInVehicle: true, customer: true, receivables: true, financerAccount: true },
  });
  if (!sale) notFound();

  const company = await getCompany();
  const ti = sale.tradeInVehicle;
  const tiLiquido = ti ? Math.max(0, round2(ti.purchasePrice - ti.payoffAmount - ti.debtsAmount)) : 0;

  // Sinal já recebido (adiantamentos), pelo mesmo critério da ordem de venda.
  const sinal = sale.receivables
    .filter((r) => r.status === "RECEBIDO" && r.description.toLowerCase().includes("sinal"))
    .reduce((s, r) => s + r.amount, 0);

  const total = sale.totalAmount;
  const financiado = sale.paymentMethod === "FINANCIADO" ? sale.financedAmount ?? 0 : 0;
  const entrada = sale.paymentMethod === "PARCELADO" ? sale.downPayment : 0;
  const saldo = Math.max(0, round2(total - tiLiquido - sinal - financiado - entrada));
  const parcelaValor =
    sale.paymentMethod === "PARCELADO" && sale.installmentsCount > 0 ? round2(saldo / sale.installmentsCount) : 0;

  return (
    <SaleContractDocument
      company={company}
      buyer={{
        name: sale.customer.name,
        document: sale.customer.document,
        phone: sale.customer.phone,
        address: sale.customer.address,
      }}
      vehicle={sale.vehicle}
      number={sale.orderNumber}
      date={sale.saleDate}
      paymentMethod={sale.paymentMethod}
      total={total}
      tiLiquido={tiLiquido}
      sinal={sinal}
      entrada={entrada}
      financiado={financiado}
      financerName={sale.financerName ?? sale.financerAccount?.name ?? null}
      saldo={saldo}
      installmentsCount={sale.installmentsCount}
      parcelaValor={parcelaValor}
      installmentsInfo={
        sale.installmentsInfoCount && sale.installmentsInfoAmount
          ? { count: sale.installmentsInfoCount, amount: sale.installmentsInfoAmount }
          : null
      }
      tradeIn={
        ti
          ? {
              label: `${ti.brand} ${ti.model} ${ti.plate}`.trim(),
              negotiated: ti.purchasePrice,
              payoff: ti.payoffAmount,
              payoffTo: ti.payoffTo,
              debts: ti.debtsAmount,
              liquido: tiLiquido,
            }
          : null
      }
      notes={sale.notes}
      backHref={`/vendas/${sale.id}`}
    />
  );
}
