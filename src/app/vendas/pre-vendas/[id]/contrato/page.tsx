import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import SaleContractDocument from "@/components/SaleContractDocument";

export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round(n * 100) / 100;

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

  const total = pre.totalAmount;
  const tiLiquido = pre.tradeIn
    ? Math.max(0, round2((pre.tiNegotiated ?? 0) - (pre.tiPayoff ?? 0) - (pre.tiDebts ?? 0)))
    : 0;
  const sinal = advanceRow._sum.amount ?? 0;
  const financiado = pre.paymentMethod === "FINANCIADO" ? pre.financedAmount ?? 0 : 0;
  const entrada = pre.paymentMethod === "PARCELADO" ? pre.downPayment : 0;
  const saldo = Math.max(0, round2(total - tiLiquido - sinal - financiado - entrada));
  // Devolução ao comprador: a pré-venda ainda não gerou o lançamento, então
  // calcula-se pelo excedente das entradas sobre o preço.
  const devolucao = Math.max(0, round2(tiLiquido + sinal + financiado + entrada - total));
  const parcelaValor =
    pre.paymentMethod === "PARCELADO" && pre.installmentsCount > 0 ? round2(saldo / pre.installmentsCount) : 0;

  return (
    <SaleContractDocument
      company={company}
      buyer={{ name: customer.name, document: customer.document, phone: customer.phone, address: customer.address }}
      vehicle={vehicle}
      number={pre.number}
      date={pre.saleDate}
      paymentMethod={pre.paymentMethod}
      total={total}
      tiLiquido={tiLiquido}
      sinal={sinal}
      entrada={entrada}
      financiado={financiado}
      financerName={financer?.name ?? null}
      saldo={saldo}
      devolucao={devolucao}
      buyerBank={{
        name: pre.buyerBankName,
        agency: pre.buyerBankAgency,
        account: pre.buyerBankAccount,
        accountType: pre.buyerBankAccountType,
        pixKey: pre.buyerPixKey,
      }}
      installmentsCount={pre.installmentsCount}
      parcelaValor={parcelaValor}
      installmentsInfo={
        pre.installmentsInfoCount && pre.installmentsInfoAmount
          ? { count: pre.installmentsInfoCount, amount: pre.installmentsInfoAmount }
          : null
      }
      tradeIn={
        pre.tradeIn
          ? {
              label: [pre.tiBrand, pre.tiModel, pre.tiPlate].filter(Boolean).join(" ") || "—",
              negotiated: pre.tiNegotiated ?? 0,
              payoff: pre.tiPayoff ?? 0,
              payoffTo: pre.tiPayoffTo,
              debts: pre.tiDebts ?? 0,
              liquido: tiLiquido,
            }
          : null
      }
      notes={pre.notes}
      backHref={`/vendas/pre-vendas/${pre.id}`}
    />
  );
}
