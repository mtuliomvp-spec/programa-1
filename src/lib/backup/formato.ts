/**
 * Formato do arquivo de backup (lido também no navegador, que monta e lê o
 * arquivo em lotes). Uma linha JSON por registro, depois de uma linha de
 * cabeçalho: `{"app":"MVP Veículos","formato":3,"modo":...}`.
 */
export type ModoBackup = "completo" | "demonstracao";
export const APP_BACKUP = "MVP Veículos";
export const FORMATO_BACKUP = 3;
