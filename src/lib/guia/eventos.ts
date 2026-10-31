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
