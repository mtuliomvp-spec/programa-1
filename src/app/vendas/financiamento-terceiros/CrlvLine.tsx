import { formatDate } from "@/lib/format";

type Crlv = { id: string; description: string; filename: string; createdAt: Date };

/**
 * Linha do documento do veículo nas fichas do financiamento de terceiros
 * (pré-venda e operação): CRLV do usado ou nota fiscal do 0 km lida no
 * formulário, com Abrir/Baixar.
 */
export default function CrlvLine({ crlvs }: { crlvs: Crlv[] }) {
  if (crlvs.length === 0) {
    return (
      <p className="sm:col-span-2">
        <span className="text-slate-500">CRLV / nota fiscal:</span>{" "}
        <span className="text-slate-400">não anexado</span>
      </p>
    );
  }
  return (
    <div className="space-y-0.5 sm:col-span-2">
      {crlvs.map((c) => (
        <p key={c.id} className="flex flex-wrap items-center gap-x-3">
          <span>
            <span className="text-slate-500">{c.description}:</span> 📎 {c.filename}
            <span className="ml-1 text-xs text-slate-400">({formatDate(c.createdAt)})</span>
          </span>
          <a href={`/anexos/${c.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">
            Abrir
          </a>
          <a href={`/anexos/${c.id}?download=1`} className="font-medium text-blue-700 hover:underline">
            Baixar
          </a>
        </p>
      ))}
    </div>
  );
}
