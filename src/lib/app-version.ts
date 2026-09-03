/**
 * Versão do sistema (número do PR mesclado na produção) e data do build,
 * fixadas em tempo de build pelo next.config.ts. Seguras no cliente.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
export const APP_BUILD_DATE = process.env.NEXT_PUBLIC_APP_BUILD_DATE || "";

/** "Versão 362" (ou "Versão 7d1da6c" / "Versão dev" fora de um merge de PR). */
export function versaoLabel(): string {
  return `Versão ${APP_VERSION}`;
}

/** Data do build em dd/mm/aaaa, para o título (tooltip) do contador. */
export function buildDateLabel(): string {
  const m = APP_BUILD_DATE.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
