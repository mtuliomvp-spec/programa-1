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

/** Chassi normalizado: maiúsculas, só letras e números. */
export function normalizeChassi(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** RENAVAM normalizado: só dígitos. */
export function normalizeRenavam(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Igual às funções acima, mas devolve `null` quando fica vazio (para o banco). */
export const chassiOrNull = (v: string | null | undefined) => normalizeChassi(v) || null;
export const renavamOrNull = (v: string | null | undefined) => normalizeRenavam(v) || null;

/**
 * Tamanho fora do padrão. É AVISO, nunca bloqueio: carro antigo, importado ou
 * documento atípico não pode travar uma venda por causa de contagem de
 * caracteres. Vazio não é "estranho" — é a validação de obrigatório que cuida.
 */
export const CHASSI_LENGTH = 17;
export const RENAVAM_LENGTH = 11;

export function chassiLooksOdd(value: string | null | undefined): boolean {
  const v = normalizeChassi(value);
  return v.length > 0 && v.length !== CHASSI_LENGTH;
}

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
}): ("RENAVAM" | "chassi")[] {
  const faltando: ("RENAVAM" | "chassi")[] = [];
  if (!normalizeRenavam(vehicle.renavam)) faltando.push("RENAVAM");
  if (!normalizeChassi(vehicle.chassi)) faltando.push("chassi");
  return faltando;
}

/** Mensagem única de bloqueio, para todos os caminhos darem o mesmo recado. */
export function missingVehicleDocsError(faltando: string[]): string {
  return `Informe ${faltando.join(" e ")} do veículo antes de registrar a venda (ficha do veículo → Editar).`;
}
