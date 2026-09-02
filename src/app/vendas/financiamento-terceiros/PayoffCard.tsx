import { Card, CardHeader } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";

type Boleto = { id: string; filename: string; size: number; createdAt: Date };

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Cartão "Quitação do financiamento anterior" da ficha (pré-venda e operação):
 * banco credor, valor, código de barras, vencimento e os boletos anexados ao
 * veículo de terceiro. Só aparece quando a operação tem quitação.
 */
export default function PayoffCard({
  payoff,
  boletos,
  className,
}: {
  payoff: { bank: string | null; amount: number | null; barcode: string | null; dueDate: Date | null };
  boletos: Boleto[];
  className?: string;
}) {
  if (!payoff.amount && boletos.length === 0) return null;
  return (
    <Card className={className}>
      <CardHeader
        title="Quitação do financiamento anterior"
        description="Parte do valor financiado paga o boleto do banco credor do veículo — consta no contrato de intermediação."
      />
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 p-5 text-sm sm:grid-cols-2">
        <p><span className="text-slate-500">Banco credor:</span> <strong>{payoff.bank || "—"}</strong></p>
        <p><span className="text-slate-500">Valor da quitação:</span> <strong>{payoff.amount != null ? formatCurrency(payoff.amount) : "—"}</strong></p>
        <p className="sm:col-span-2 break-all"><span className="text-slate-500">Código de barras:</span> {payoff.barcode || "—"}</p>
        <p><span className="text-slate-500">Vencimento:</span> {payoff.dueDate ? formatDate(payoff.dueDate) : "—"}</p>
      </div>
      {boletos.length > 0 ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 px-5">
          {boletos.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 truncate text-slate-700">
                📎 {b.filename}
                <span className="ml-2 text-xs text-slate-400">
                  {humanSize(b.size)} · {formatDate(b.createdAt)}
                </span>
              </span>
              <span className="flex shrink-0 gap-3 text-sm font-medium">
                <a href={`/anexos/${b.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
                  Abrir
                </a>
                <a href={`/anexos/${b.id}?download=1`} className="text-blue-700 hover:underline">
                  Baixar
                </a>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Nenhum boleto anexado — use “Editar” na pré-venda para anexar o arquivo.
        </p>
      )}
    </Card>
  );
}
