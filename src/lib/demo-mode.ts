/**
 * Modo demonstração: ligado só quando a variável de ambiente DEMO_MODE existe
 * e está com um valor afirmativo. A instalação de produção não tem essa
 * variável, então a tela /demo (que apaga os dados de negócio para recriar os
 * fictícios) simplesmente não existe lá.
 *
 * Arquivo puro (sem `server-only`): lido por páginas e actions do servidor.
 */
export function isDemoMode(): boolean {
  const v = (process.env.DEMO_MODE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "sim" || v === "on";
}
