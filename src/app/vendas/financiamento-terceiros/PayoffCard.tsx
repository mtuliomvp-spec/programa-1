import { Card, CardHeader } from "@/components/ui";
import CopyBarcode from "@/components/CopyBarcode";
import { formatCurrency, formatDate } from "@/lib/format";

type Boleto = { id: string; filename: string; size: number; createdAt: Date };

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Cartão de QUITAÇÃO da ficha (pré-venda e operação): o que parte do valor
 * financiado vai pagar, com o documento anexado ao veículo de terceiro. Serve
 * para as duas quitações da operação, que têm a mesma mecânica:
 *  - o financiamento anterior (boleto do banco credor);
 *  - os débitos do veículo — IPVA, multas, licenciamento (guia do órgão).
 * Só aparece quando a operação tem aquela quitação.
 */
export default function PayoffCard({
  payoff,
  boletos,
  className,
  titulo = "Quitação do financiamento anterior",
  descricao = "Parte do valor financiado paga o boleto do banco credor do veículo — consta no contrato de intermediação.",
  rotuloCredor = "Banco credor",
  rotuloDocumento = "boleto",
  detalhe = null,
}: {
  payoff: { bank: string | null; amount: number | null; barcode: string | null; dueDate: Date | null };
  boletos: Boleto[];
  className?: string;
  titulo?: string;
  descricao?: string;
  rotuloCredor?: string;
  /** Como o papel se chama nas mensagens: "boleto" ou "guia". */
  rotuloDocumento?: string;
  /** Linha extra (ex.: o que está sendo quitado nos débitos). */
  detalhe?: { rotulo: string; valor: string | null } | null;
}) {
  if (!payoff.amount && boletos.length === 0) return null;
  return (
    <Card className={className}>
      <CardHeader title={titulo} description={descricao} />
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 p-5 text-sm sm:grid-cols-2">
        <p><span className="text-slate-500">{rotuloCredor}:</span> <strong>{payoff.bank || "—"}</strong></p>
        <p><span className="text-slate-500">Valor da quitação:</span> <strong>{payoff.amount != null ? formatCurrency(payoff.amount) : "—"}</strong></p>
        {detalhe ? (
          <p className="sm:col-span-2"><span className="text-slate-500">{detalhe.rotulo}:</span> {detalhe.valor || "—"}</p>
        ) : null}
        <p><span className="text-slate-500">Vencimento:</span> {payoff.dueDate ? formatDate(payoff.dueDate) : "—"}</p>
        {/* Linha digitável com o botão de copiar: é daqui que ela vai para o
            leitor do banco, então copia só os dígitos. */}
        {payoff.barcode ? (
          <div className="sm:col-span-2">
            <CopyBarcode value={payoff.barcode} />
          </div>
        ) : (
          <p className="sm:col-span-2">
            <span className="text-slate-500">Código de barras:</span> —
          </p>
        )}
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
          Nenhum {rotuloDocumento} anexado — use “Editar” na pré-venda para anexar o arquivo.
        </p>
      )}
    </Card>
  );
}
