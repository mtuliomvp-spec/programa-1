"use server";

import { getSessionUser } from "@/lib/auth";
import { registrarVisita } from "@/lib/showroom-visits";

/**
 * Marca a visita a um anúncio da vitrine. Chamada pelo navegador do visitante
 * quando a página do anúncio termina de carregar — assim o contador mede gente
 * olhando o carro, e não robô de busca nem o carregamento antecipado de link
 * que o navegador faz por conta própria — e também quando ele toca em "Tenho
 * interesse"/WhatsApp (`contato = true`), inclusive direto no card da vitrine,
 * que não passa pela página do anúncio.
 *
 * É pública de propósito (a vitrine não tem login). Quem está logado no
 * sistema é ignorado: a equipe conferindo o próprio anúncio não é visita.
 */
export async function registrarVisitaAction(alvo: string, contato = false): Promise<void> {
  try {
    const usuario = await getSessionUser();
    if (usuario) return;
    await registrarVisita(alvo, contato === true);
  } catch {
    // Contador nunca pode atrapalhar o anúncio: falhou, segue sem contar.
  }
}
