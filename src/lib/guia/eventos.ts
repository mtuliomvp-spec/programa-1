/**
 * Ponte entre as telas e o modo guia: depois de uma operação que deu certo, a
 * tela chama `guiaFeito` com o que aconteceu. Com o guia desligado (ou fora do
 * demo) ninguém escuta o evento e nada aparece.
 */
export const EVENTO_GUIA_FEITO = "fincore:guia-feito";

export type GuiaFeitoDetalhe = { id: string; linhas: string[] };

export function guiaFeito(id: string, linhas: string[]): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<GuiaFeitoDetalhe>(EVENTO_GUIA_FEITO, { detail: { id, linhas } }));
}

const CHAVE_PENDENTE = "fincore-guia-pendente";

type Pendente = GuiaFeitoDetalhe & { destino: string; origem: string; ate: number };

/**
 * Para operações que terminam MUDANDO de página (o servidor redireciona, ex.:
 * cadastrar veículo → ficha): guarda o "o que foi feito" e o guia mostra ao
 * chegar numa página que começa com `destino`. Vale por 2 minutos; se a
 * operação falhar, a tela chama `cancelarGuiaPendente`.
 */
export function guiaFeitoAoChegar(id: string, linhas: string[], destino: string): void {
  if (typeof window === "undefined") return;
  const p: Pendente = { id, linhas, destino, origem: window.location.pathname, ate: Date.now() + 120_000 };
  try {
    sessionStorage.setItem(CHAVE_PENDENTE, JSON.stringify(p));
  } catch {
    // Sem armazenamento: o guia só não mostra o resumo depois.
  }
}

export function cancelarGuiaPendente(): void {
  try {
    sessionStorage.removeItem(CHAVE_PENDENTE);
  } catch {
    // nada a fazer
  }
}

/** Chamado pelo guia a cada troca de página: entrega o pendente, se for a hora. */
export function entregarGuiaPendente(caminho: string): void {
  let p: Pendente | null = null;
  try {
    const bruto = sessionStorage.getItem(CHAVE_PENDENTE);
    p = bruto ? (JSON.parse(bruto) as Pendente) : null;
  } catch {
    return;
  }
  if (!p) return;
  if (Date.now() > p.ate) {
    cancelarGuiaPendente();
    return;
  }
  if (caminho === p.origem || !caminho.startsWith(p.destino)) return;
  cancelarGuiaPendente();
  guiaFeito(p.id, p.linhas);
}
