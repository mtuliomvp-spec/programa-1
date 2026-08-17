/**
 * Constantes e utilitários do módulo "Veículos avaliados".
 *
 * O usuário avalia um veículo (fotos, dados FIPE, opcionais, checklist e preço
 * de avaliação) e, quando o carro é entregue na loja para efetivar o negócio,
 * faz uma CONFERÊNCIA re-marcando o MESMO checklist — o sistema aponta o que
 * mudou em relação à avaliação. Nada aqui mexe no financeiro/estoque.
 */

/** Lista PADRÃO fixa do checklist do veículo (marcável na avaliação e na entrega). */
export const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "lataria", label: "Lataria / funilaria" },
  { key: "pintura", label: "Pintura" },
  { key: "vidros", label: "Vidros e retrovisores" },
  { key: "farois", label: "Faróis e lanternas" },
  { key: "pneus", label: "Pneus" },
  { key: "estepe", label: "Estepe e ferramentas" },
  { key: "rodas", label: "Rodas" },
  { key: "motor", label: "Motor" },
  { key: "cambio", label: "Câmbio" },
  { key: "suspensao", label: "Suspensão" },
  { key: "freios", label: "Freios" },
  { key: "eletrica", label: "Sistema elétrico" },
  { key: "arcondicionado", label: "Ar-condicionado" },
  { key: "interior", label: "Interior / bancos / forração" },
  { key: "multimidia", label: "Painel / multimídia" },
  { key: "documentacao", label: "Documentação" },
  { key: "chavereserva", label: "Chave reserva" },
];

/** Lista PREDEFINIDA de opcionais (marcável). Extras livres também são aceitos. */
export const OPTIONALS: string[] = [
  "Ar-condicionado",
  "Direção hidráulica",
  "Direção elétrica",
  "Vidros elétricos",
  "Travas elétricas",
  "Airbag",
  "Freios ABS",
  "Central multimídia",
  "Câmbio automático",
  "Sensor de estacionamento",
  "Câmera de ré",
  "Rodas de liga leve",
  "Bancos em couro",
  "Piloto automático",
  "Faróis de LED",
  "Faróis de neblina",
  "Start/Stop",
  "Partida por botão",
  "Teto solar",
  "Engate",
];

export type ChecklistState = "OK" | "ATENCAO" | "PROBLEMA";

export const CHECKLIST_STATES: { value: ChecklistState; label: string }[] = [
  { value: "OK", label: "OK" },
  { value: "ATENCAO", label: "Atenção" },
  { value: "PROBLEMA", label: "Problema" },
];

export const STATE_LABEL: Record<ChecklistState, string> = {
  OK: "OK",
  ATENCAO: "Atenção",
  PROBLEMA: "Problema",
};

/** Classes Tailwind para o selo de cada estado (badge). */
export const STATE_TONE: Record<ChecklistState, string> = {
  OK: "bg-emerald-100 text-emerald-800",
  ATENCAO: "bg-amber-100 text-amber-800",
  PROBLEMA: "bg-rose-100 text-rose-800",
};

export type ChecklistEntry = { state: ChecklistState; obs?: string };
export type ChecklistMap = Record<string, ChecklistEntry>;

function isState(v: unknown): v is ChecklistState {
  return v === "OK" || v === "ATENCAO" || v === "PROBLEMA";
}

/** Lê um checklist gravado (Json) de forma defensiva, só com as chaves padrão. */
export function parseChecklist(json: unknown): ChecklistMap {
  const out: ChecklistMap = {};
  const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  for (const item of CHECKLIST_ITEMS) {
    const raw = obj[item.key];
    if (raw && typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      const state = isState(r.state) ? r.state : "OK";
      const obs = typeof r.obs === "string" && r.obs.trim() ? r.obs.trim() : undefined;
      out[item.key] = { state, obs };
    } else {
      out[item.key] = { state: "OK" };
    }
  }
  return out;
}

/** Lê a lista de opcionais gravada (Json/array) como strings. */
export function parseOptionals(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}

export type ChecklistDiff = {
  key: string;
  label: string;
  from: ChecklistState;
  to: ChecklistState;
};

/**
 * Compara a marcação da AVALIAÇÃO com a da ENTREGA e devolve só os itens cujo
 * estado mudou — é o que responde "o carro está do mesmo jeito em que foi
 * avaliado?".
 */
export function diffChecklist(appraisal: ChecklistMap, delivery: ChecklistMap): ChecklistDiff[] {
  const diffs: ChecklistDiff[] = [];
  for (const item of CHECKLIST_ITEMS) {
    const from = appraisal[item.key]?.state ?? "OK";
    const to = delivery[item.key]?.state ?? "OK";
    if (from !== to) diffs.push({ key: item.key, label: item.label, from, to });
  }
  return diffs;
}

export type AppraisalStatus = "AVALIADO" | "CONFERIDO";
