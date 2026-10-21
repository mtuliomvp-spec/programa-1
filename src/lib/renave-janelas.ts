/**
 * Piloto nacional do Renave de usados: o sistema só recebe registros nas
 * janelas abaixo (horário de Brasília), sem divisão por UF, até o
 * funcionamento integral. Cronograma divulgado às lojas em out/2026 (repassado
 * por banco parceiro) — confirmar mudanças com o SERPRO.
 */
export const RENAVE_JANELAS: { dia: string; inicio: number; fim: number }[] = [
  { dia: "2026-10-13", inicio: 5, fim: 12 },
  { dia: "2026-10-15", inicio: 5, fim: 18 },
  { dia: "2026-10-20", inicio: 5, fim: 12 },
  { dia: "2026-10-22", inicio: 5, fim: 18 },
  { dia: "2026-11-03", inicio: 5, fim: 23 },
  { dia: "2026-11-05", inicio: 5, fim: 23 },
  { dia: "2026-11-10", inicio: 5, fim: 23 },
  { dia: "2026-11-12", inicio: 5, fim: 23 },
  { dia: "2026-11-17", inicio: 5, fim: 23 },
];

/** A partir deste dia o Renave funciona o tempo todo. */
export const RENAVE_FULL_DESDE = "2026-11-20";

export type JanelaRenave = { dia: string; inicio: number; fim: number };

export type SituacaoJanela =
  | { estado: "FULL" }
  | { estado: "ABERTO"; janela: JanelaRenave }
  | { estado: "FECHADO"; proxima: JanelaRenave | null; full: string };

/** Dia (AAAA-MM-DD) e hora em Brasília. */
function agoraBrasilia(d: Date): { dia: string; hora: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")) + Number(v("minute")) / 60 };
}

export function situacaoJanelaRenave(agora: Date = new Date()): SituacaoJanela {
  const { dia, hora } = agoraBrasilia(agora);
  if (dia >= RENAVE_FULL_DESDE) return { estado: "FULL" };
  const hoje = RENAVE_JANELAS.find((j) => j.dia === dia);
  if (hoje && hora >= hoje.inicio && hora < hoje.fim) return { estado: "ABERTO", janela: hoje };
  const proxima =
    RENAVE_JANELAS.find((j) => j.dia > dia || (j.dia === dia && hora < j.inicio)) ?? null;
  return { estado: "FECHADO", proxima, full: RENAVE_FULL_DESDE };
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "qui 15/10" */
export function diaCurto(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const sem = SEMANA[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
  return `${sem} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function horario(j: JanelaRenave): string {
  return `${String(j.inicio).padStart(2, "0")}h às ${String(j.fim).padStart(2, "0")}h`;
}
