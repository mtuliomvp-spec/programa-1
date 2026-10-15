/**
 * Avisos da leitura do comprovante de uma transferência que deixam de valer
 * quando ela é informada: só se grava com as duas contas (diferentes) e a data
 * escolhidas — "não identifiquei a conta DEBITADA… escolha abaixo" perde o
 * sentido depois da escolha.
 */
export function avisoResolvido(aviso: string): boolean {
  return /não identifiquei a (conta (DEBITADA|CREDITADA)|data)|MESMA conta/i.test(aviso);
}

/** O aviso guardado sem as partes já resolvidas (vazio = nada a mostrar). */
export function avisoVigente(note: string | null | undefined): string {
  return (note ?? "")
    .split(" · ")
    .map((a) => a.trim())
    .filter((a) => a && !avisoResolvido(a))
    .join(" · ");
}
