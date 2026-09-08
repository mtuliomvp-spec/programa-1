/**
 * Competência/referência do título — o PERÍODO a que o gasto se refere.
 *
 * Boleto de concessionária, mensalidade e condomínio trazem impressa a
 * referência do que está sendo cobrado: a conta de luz de AGO/2026 vence em
 * setembro, a mensalidade de "Setembro/2026" vence no dia 10. O vencimento
 * sozinho não conta essa história — dois boletos da Equatorial pagos no mesmo
 * mês podem ser de meses de consumo diferentes.
 *
 * O texto é INFORMATIVO: a despesa continua entrando no resultado pelo regime
 * de CAIXA, na data do pagamento. Por isso a competência é guardada como veio
 * impressa (só arrumada), sem virar data nem mudar nenhum cálculo.
 */

/** Limite do campo — referência é rótulo curto, não observação. */
const MAX = 40;

/** Rótulo que a IA (ou o usuário) às vezes traz junto: "Referência: 08/2026". */
const ROTULO =
  /^(m[eê]s\s+(de\s+)?)?(compet[êe]ncia|refer[êe]ncia|refer\.?|ref\.?|per[íi]odo|m[eê]s)\s*[:\-–]?\s*/i;

/** Texto que não é referência nenhuma. */
const VAZIO = /^(null|nulo|n\/?a|nao informado|não informado|-{1,}|—)$/i;

/** yyyy-mm-dd → dd/mm/aaaa (sem passar pelo fuso). */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Arruma o texto da competência para guardar/mostrar. Devolve `null` quando não
 * sobrou nada aproveitável.
 *
 * `vencimento` (yyyy-mm-dd) é opcional e serve de defesa: a confusão mais fácil
 * de a IA cometer é devolver o próprio vencimento como referência — a conta de
 * agosto que vence em 10/09 tem referência 08/2026, não 10/09/2026. Quando o
 * texto é exatamente a data de vencimento, ele é descartado.
 */
export function normalizarCompetencia(
  raw: string | null | undefined,
  vencimento?: string | null,
): string | null {
  let texto = String(raw ?? "")
    // Espaço fixo do PDF e quebras viram espaço comum antes de colapsar.
    .replace(/[\u0000-\u001f\u00a0\u2007\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”.;,]+$/g, "")
    .trim();
  texto = texto.replace(ROTULO, "").trim();
  if (!texto || VAZIO.test(texto)) return null;
  // Precisa ter ao menos um dígito ou uma letra — "//" e "--" não são referência.
  if (!/[0-9\p{L}]/u.test(texto)) return null;

  // Formato de máquina vira formato de gente: "2026-08" → "08/2026".
  const mesIso = texto.match(/^(\d{4})-(\d{2})$/);
  if (mesIso) texto = `${mesIso[2]}/${mesIso[1]}`;
  const dataIso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dataIso) texto = dataBr(texto);

  // O vencimento não é competência.
  if (vencimento && /^\d{4}-\d{2}-\d{2}$/.test(vencimento) && texto === dataBr(vencimento)) {
    return null;
  }

  return texto.slice(0, MAX).trim() || null;
}

/**
 * Competência que é um MÊS ("08/2026") — a das contas de consumo, que andam de
 * mês em mês. É a forma que a recorrência precisa entender para numerar sozinha
 * as ocorrências seguintes; texto livre (um período, um exercício) não serve
 * aqui e volta `null`.
 *
 * Aceita como a pessoa escreve: 08/2026, 8/2026, 08-2026, 2026-08, ago/2026.
 */
const MESES_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export function parseCompetenciaMes(raw: string | null | undefined): { ano: number; mes: number } | null {
  const texto = normalizarCompetencia(raw);
  if (!texto) return null;
  const limpo = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const numerico = limpo.match(/^(\d{1,2})\s*[/-]\s*(\d{4})$/);
  if (numerico) {
    const mes = Number(numerico[1]);
    if (mes >= 1 && mes <= 12) return { ano: Number(numerico[2]), mes };
    return null;
  }
  const iso = limpo.match(/^(\d{4})\s*[/-]\s*(\d{1,2})$/);
  if (iso) {
    const mes = Number(iso[2]);
    if (mes >= 1 && mes <= 12) return { ano: Number(iso[1]), mes };
    return null;
  }
  // "ago/2026", "agosto de 2026", "setembro/2026"
  const porNome = limpo.match(/^([a-z]{3,9})\.?\s*(?:de\s*)?[/-]?\s*(\d{4})$/);
  if (porNome) {
    const idx = MESES_PT.findIndex((m) => porNome[1].startsWith(m));
    if (idx >= 0) return { ano: Number(porNome[2]), mes: idx + 1 };
  }
  return null;
}

/** {ano, mes} → "08/2026", que é como a competência aparece nas telas. */
export function formatCompetenciaMes(ano: number, mes: number): string {
  return `${String(mes).padStart(2, "0")}/${ano}`;
}

/**
 * A competência `meses` à frente da primeira ("08/2026" + 1 → "09/2026").
 * Devolve `null` quando a primeira não é um mês — aí não há o que numerar.
 */
export function competenciaMaisMeses(primeira: string | null | undefined, meses: number): string | null {
  const base = parseCompetenciaMes(primeira);
  if (!base) return null;
  const idx = base.ano * 12 + (base.mes - 1) + Math.round(meses);
  if (idx < 0) return null;
  return formatCompetenciaMes(Math.floor(idx / 12), (idx % 12) + 1);
}
