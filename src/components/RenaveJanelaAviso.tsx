import {
  RENAVE_FULL_DESDE,
  RENAVE_JANELAS,
  diaCurto,
  horario,
  situacaoJanelaRenave,
} from "@/lib/renave-janelas";

/**
 * O Renave está recebendo registros agora? No piloto nacional ele só abre em
 * janelas (terças e quintas, horário crescente) até o funcionamento integral —
 * o aviso evita a equipe tentar registrar com o sistema fechado.
 */
export default function RenaveJanelaAviso({ className = "" }: { className?: string }) {
  const s = situacaoJanelaRenave();
  if (s.estado === "FULL") return null;

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const proximas = RENAVE_JANELAS.filter((j) => j.dia >= hoje);

  return (
    <div
      className={`rounded-xl border px-4 py-3 print:hidden ${
        s.estado === "ABERTO" ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50"
      } ${className}`}
    >
      {s.estado === "ABERTO" ? (
        <p className="text-sm font-semibold text-emerald-900">
          🟢 Renave aberto agora — hoje até {String(s.janela.fim).padStart(2, "0")}h
        </p>
      ) : (
        <p className="text-sm font-semibold text-slate-800">
          🔴 Renave fechado agora
          {s.proxima ? ` — próxima janela: ${diaCurto(s.proxima.dia)}, ${horario(s.proxima)}` : ""}
        </p>
      )}
      <p className="mt-0.5 text-xs text-slate-600">
        Piloto nacional: o Renave só recebe registros nas janelas do cronograma (horário de Brasília). Funcionamento
        integral a partir de <strong>{diaCurto(RENAVE_FULL_DESDE)}</strong>. Deixe os dados prontos na ficha e
        registre na próxima janela.
      </p>
      {proximas.length ? (
        <details className="mt-1 text-xs text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">Ver o cronograma</summary>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
            {proximas.map((j) => (
              <li key={j.dia}>
                {diaCurto(j.dia)} · {horario(j)}
              </li>
            ))}
            <li>
              {diaCurto(RENAVE_FULL_DESDE)} · <strong>integral</strong>
            </li>
          </ul>
        </details>
      ) : null}
    </div>
  );
}
