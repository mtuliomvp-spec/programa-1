/**
 * Recorrência do plano de saúde CASF Saúde (Caixa de Assistência dos
 * Funcionários do Banco da Amazônia) — boleto mensal, vencimento dia 05,
 * competência = mês anterior ao vencimento. O débito sai do CAPITAL do sócio
 * Marco Antonio (a baixa vira retirada dele).
 *
 * O valor MUDA todo mês: além da mensalidade das 3 pessoas do plano
 * (Marco Antonio, Adriana e Marcelo Sobrinho), entra a coparticipação de quem
 * usou o plano. Por isso o título de cada mês deve ser conferido com o boleto
 * e ajustado antes da baixa.
 *
 * Primeira ocorrência: boleto de 05/08/2026 (competência 07/2026), lançada
 * junto com a importação. As seguintes são geradas pelo motor de recorrências.
 */

export const CASF_DESCRIPTION = "Plano de saúde CASF — competência {competencia}";
export const CASF_SUPPLIER = "CASF — Caixa de Assistência dos Funcionários do Banco da Amazônia";
export const CASF_BENEFICIARIO_NOME = "Marco Antonio Marao Viana Pereira";
/** Termos (sem acento, minúsculos) para achar o beneficiário já cadastrado. */
export const CASF_BENEFICIARIO_BUSCA = "marco antonio";
export const CASF_DAY_OF_MONTH = 5;
export const CASF_START_DATE = "2026-08-05";
/** Valor-base da recorrência (boleto 05/08/2026 — muda todo mês). */
export const CASF_AMOUNT = 3370.17;
export const CASF_FIRST_DOC = "285819";
export const CASF_NOTES =
  "O valor muda todo mês: mensalidade das 3 pessoas do plano (Marco Antonio, Adriana e Marcelo Sobrinho) + coparticipação de quem usou. Confira o boleto do mês e ajuste o valor do título (Editar) antes de pagar. A baixa vira retirada do capital do Marco Antonio.";

/** Composição do boleto de 05/08/2026 (mostrada na página do import). */
export const CASF_BOLETO_AGOSTO = {
  total: 3370.17,
  mensalidade: 2986.87,
  coparticipacao: 383.3,
  pessoas: [
    { nome: "Marco Antonio Marão Viana Pereira", mensalidade: 1739.58, coparticipacao: 0 },
    { nome: "Adriana Maria Rodrigues Marão Viana Pereira", mensalidade: 957.36, coparticipacao: 320.37 },
    { nome: "Marcelo Matos Viana Pereira Sobrinho", mensalidade: 289.93, coparticipacao: 62.93 },
  ],
};
