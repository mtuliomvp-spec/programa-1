/**
 * Documentos do veículo: chassi (VIN) e RENAVAM.
 *
 * O sistema não tinha nenhuma normalização desses dois campos — só a placa era
 * passada para maiúsculas. Chassi e RENAVAM iam crus para o banco (minúsculas,
 * espaços, pontos), o que atrapalha comparar, achar duplicado e imprimir em
 * contrato.
 *
 * Arquivo puro (sem `server-only`): usado no formulário e nas actions.
 */

/**
 * Chassi normalizado: maiúsculas, só letras, números e `*`.
 *
 * O `*` é preservado de propósito: a consulta por placa devolve o chassi
 * MASCARADO (ex.: `*****39578`) e é assim que ele fica gravado. Apagar a
 * máscara transformaria um dado incompleto num número curto com cara de
 * válido — e o veículo passaria na exigência da venda com o chassi pela metade.
 */
export function normalizeChassi(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9*]/g, "");
}

/** RENAVAM normalizado: só dígitos. */
export function normalizeRenavam(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Igual às funções acima, mas devolve `null` quando fica vazio (para o banco). */
export const chassiOrNull = (v: string | null | undefined) => normalizeChassi(v) || null;
export const renavamOrNull = (v: string | null | undefined) => normalizeRenavam(v) || null;

export const CHASSI_LENGTH = 17;
export const RENAVAM_LENGTH = 11;

/**
 * Chassi completo: 17 caracteres, sem máscara. Todo veículo fabricado de 1981
 * em diante tem exatamente 17 — por isso aqui a regra é dura, ao contrário do
 * RENAVAM (ver abaixo).
 */
export function isChassiComplete(value: string | null | undefined): boolean {
  return /^[A-Z0-9]{17}$/.test(normalizeChassi(value));
}

/** Tem alguma coisa, mas não é um chassi completo (mascarado ou cortado). */
export function isChassiPartial(value: string | null | undefined): boolean {
  const v = normalizeChassi(value);
  return v.length > 0 && !isChassiComplete(v);
}

/**
 * RENAVAM fora de 11 dígitos é AVISO, nunca bloqueio: documento antigo (antes
 * de 2012) traz 9 dígitos, e não se trava uma venda por causa disso.
 */
export function renavamLooksOdd(value: string | null | undefined): boolean {
  const v = normalizeRenavam(value);
  return v.length > 0 && v.length !== RENAVAM_LENGTH;
}

/**
 * Quais documentos faltam no veículo. Usado para pedir só o que falta no
 * formulário de venda e para travar o registro da venda.
 */
export function missingVehicleDocs(vehicle: {
  chassi?: string | null;
  renavam?: string | null;
}): string[] {
  const faltando: string[] = [];
  if (!normalizeRenavam(vehicle.renavam)) faltando.push("o RENAVAM");
  // Parcial conta como faltando: o chassi mascarado da consulta por placa não
  // serve para contrato nem para identificar o carro.
  if (isChassiPartial(vehicle.chassi)) {
    faltando.push(`o chassi COMPLETO (o cadastrado está incompleto: ${normalizeChassi(vehicle.chassi)})`);
  } else if (!isChassiComplete(vehicle.chassi)) {
    faltando.push(`o chassi (${CHASSI_LENGTH} caracteres)`);
  }
  return faltando;
}

/** Mensagem única de bloqueio, para todos os caminhos darem o mesmo recado. */
export function missingVehicleDocsError(faltando: string[]): string {
  return `Informe ${faltando.join(" e ")} antes de registrar a venda (ficha do veículo → Editar).`;
}
