import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { ALL_PERMISSIONS } from "@/lib/permissions";

/**
 * Visitante da demonstração: o login que os interessados usam pelo botão
 * "Testar o sistema" da página /assinar. É UM usuário para todos — o ambiente
 * é compartilhado e os dados são fictícios.
 *
 * Operador com quase tudo liberado, menos o que tem custo ou valor legal fora
 * do sistema (Renave no SERPRO, NF-e e NFS-e). Telas de administrador
 * (Usuários, Parâmetros, Sistema, Super) continuam fechadas pelo papel.
 * A senha é aleatória e trocada a cada entrada: não se entra por senha.
 */
export const VISITANTE_EMAIL = "visitante@demo.fincore360";

const BLOQUEADAS = new Set([
  "estoque.renavews",
  "estoque.nfe",
  "estoque.nfecancelar",
  "financeiro.nfse",
  "financeiro.nfsecancelar",
]);

export const VISITANTE_PERMISSOES = ALL_PERMISSIONS.filter((p) => !BLOQUEADAS.has(p));

/** Cria ou atualiza o visitante e devolve o que a sessão precisa. */
export async function garantirVisitante() {
  const dados = {
    name: "Visitante (demonstração)",
    role: "OPERADOR" as const,
    permissions: VISITANTE_PERMISSOES,
    passwordHash: hashPassword(randomBytes(24).toString("base64url")),
    active: true,
  };
  return prisma.user.upsert({
    where: { email: VISITANTE_EMAIL },
    create: { email: VISITANTE_EMAIL, ...dados },
    update: dados,
    select: { id: true, name: true, role: true },
  });
}
