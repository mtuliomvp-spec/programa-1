import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

const categoryLabel = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  DEVOLUCAO_CLIENTE: "Devolução ao cliente",
  OUTROS: "Outros",
} as const;

const statusLabel = { PENDENTE: "Pendente", ATRASADO: "Atrasado", PAGO: "Pago" } as const;

/**
 * Página PÚBLICA de verificação de autenticidade da Ordem de Pagamento,
 * acessada pelo QR Code. Confirma que o documento foi emitido pelo sistema e
 * mostra os dados essenciais para conferência. Não expõe dados bancários.
 */
export default async function VerificarPagamentoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [payable, company] = await Promise.all([
    prisma.payable.findUnique({
      where: { publicToken: token },
      include: { supplier: { select: { name: true, document: true } } },
    }),
    getCompany().catch(() => null),
  ]);

  const empresa = company?.nomeFantasia || "MVP Veículos";

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      {!payable ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-3 text-xl font-bold text-rose-800">Documento não encontrado</h1>
          <p className="mt-2 text-sm text-rose-700">
            Este código de verificação não corresponde a nenhuma Ordem de Pagamento emitida pelo sistema.
            Verifique se leu o QR Code corretamente.
          </p>
        </div>
      ) : (
        (() => {
          const effective = effectivePayableStatus(payable.status, payable.dueDate);
          return (
            <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
              <div className="bg-emerald-600 px-6 py-5 text-center text-white">
                <p className="text-3xl">✅</p>
                <h1 className="mt-1 text-lg font-bold">Documento autêntico</h1>
                <p className="text-sm text-emerald-50">Ordem de Pagamento emitida por {empresa}</p>
              </div>
              <div className="p-6">
                <dl className="divide-y divide-slate-100">
                  {[
                    ["Descrição", payable.description],
                    ["Categoria", payable.categoryLabel || categoryLabel[payable.category]],
                    ["Fornecedor", payable.supplier?.name || "—"],
                    ["CPF/CNPJ", payable.supplier?.document || "—"],
                    ["Valor", formatCurrency(payable.amount)],
                    ["Vencimento", formatDate(payable.dueDate)],
                    ["Situação", statusLabel[effective]],
                    ["Emitido em", formatDate(payable.createdAt)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
                      <dt className="shrink-0 text-slate-500">{label}</dt>
                      <dd className="text-right font-medium text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 text-center text-xs text-slate-400">
                  Verificação gerada pelo Sistema Financeiro {empresa}. Os dados acima refletem o título
                  no momento desta consulta.
                </p>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
