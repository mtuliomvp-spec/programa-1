import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const paymentLabel = { A_VISTA: "À vista", PARCELADO: "Parcelado", FINANCIADO: "Financiado" } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Página PÚBLICA de verificação da Ficha de Negócio (pré-venda), acessada pelo
 * QR Code. Confirma que o documento foi emitido pelo sistema e mostra os dados
 * essenciais da negociação para conferência do cliente. NÃO expõe dados internos
 * (comissão, indicação, transferência, margem).
 */
export default async function VerificarFichaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [pre, company] = await Promise.all([
    prisma.preSale.findUnique({ where: { publicToken: token } }),
    getCompany().catch(() => null),
  ]);

  const empresa = company?.nomeFantasia || "MVP Veículos";

  const [vehicle, customer] = pre
    ? await Promise.all([
        prisma.vehicle.findUnique({
          where: { id: pre.vehicleId },
          select: { brand: true, model: true, plate: true },
        }),
        prisma.customer.findUnique({ where: { id: pre.customerId }, select: { name: true } }),
      ])
    : [null, null];

  const tiLiquido =
    pre && pre.tradeIn
      ? Math.max(0, round2((pre.tiNegotiated ?? 0) - (pre.tiPayoff ?? 0) - (pre.tiDebts ?? 0)))
      : 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      {!pre ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-3 text-xl font-bold text-rose-800">Documento não encontrado</h1>
          <p className="mt-2 text-sm text-rose-700">
            Este código de verificação não corresponde a nenhuma ficha de negócio emitida pelo sistema.
            Verifique se leu o QR Code corretamente.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
          <div className="bg-emerald-600 px-6 py-5 text-center text-white">
            <p className="text-3xl">✅</p>
            <h1 className="mt-1 text-lg font-bold">Documento autêntico</h1>
            <p className="text-sm text-emerald-50">
              Ficha de Negócio (pré-venda) Nº {String(pre.number).padStart(4, "0")} emitida por {empresa}
            </p>
          </div>
          <div className="p-6">
            <dl className="divide-y divide-slate-100">
              {[
                ["Veículo", vehicle ? `${vehicle.brand} ${vehicle.model} — ${vehicle.plate}` : "—"],
                ["Cliente", customer?.name || "—"],
                ["Data", formatDate(pre.saleDate)],
                ["Forma de pagamento", paymentLabel[pre.paymentMethod]],
                ...(tiLiquido > 0 ? [["Entrada com veículo em troca", formatCurrency(tiLiquido)] as [string, string]] : []),
                ["Valor da venda", formatCurrency(pre.totalAmount)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
                  <dt className="shrink-0 text-slate-500">{label}</dt>
                  <dd className="text-right font-medium text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-center text-xs text-slate-400">
              Verificação gerada pelo sistema de {empresa}. Os dados acima refletem a negociação no
              momento desta consulta. Documento de resumo — não é o contrato de compra e venda.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
