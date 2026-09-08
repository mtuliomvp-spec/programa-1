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
