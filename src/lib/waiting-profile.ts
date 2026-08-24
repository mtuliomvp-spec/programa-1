import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Perfil de ESPERA — onde cai quem se cadastrou sozinho e teve o acesso
 * aprovado.
 *
 * A aprovação diz apenas "esta pessoa é da casa"; ela **não** decide o que a
 * pessoa pode fazer. Antes, aprovar já entregava "visualizar" em todos os
 * módulos, então um cadastro recém-aprovado enxergava o sistema inteiro sem
 * ninguém ter decidido nada. Agora o aprovado entra sem nenhuma permissão e
 * fica visível na tela de Usuários até o gestor atribuir o perfil de verdade.
 *
 * É um Profile comum (aparece na lista de perfis e no seletor "Perfil"), só que
 * criado pelo próprio sistema quando falta. Se alguém apagar, ele volta na
 * próxima aprovação.
 */
export const WAITING_PROFILE_NAME = "Em espera";

/** Devolve o perfil de espera, criando-o se ainda não existir. */
export async function ensureWaitingProfile(): Promise<{ id: string; permissions: string[] }> {
  const profile = await prisma.profile.upsert({
    where: { name: WAITING_PROFILE_NAME },
    // Já existe: não mexe. As permissões dele são do administrador (se ele
    // quiser que "Em espera" libere alguma coisa, é escolha da loja).
    update: {},
    create: { name: WAITING_PROFILE_NAME, permissions: [] },
    select: { id: true, permissions: true },
  });
  return profile;
}
