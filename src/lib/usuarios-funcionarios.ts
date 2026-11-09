import "server-only";
import { prisma } from "@/lib/prisma";

/** Usuário do sistema que pode virar (ou já é) funcionário, com os dados que preenchem a ficha. */
export type UsuarioFuncionario = {
  id: string;
  name: string;
  email: string;
  cpf: string;
  pixKey: string;
  cargo: string;
  /** Data de entrada no sistema (sugestão de admissão, a confirmar). */
  desde: string;
};

const CARGO_DO_PAPEL: Record<string, string> = { ADMIN: "Administrador", OPERADOR: "" };

/**
 * Usuários ativos que ainda não têm ficha de funcionário (mais o já ligado a
 * `incluirEmployeeId`, na edição). Fica de fora o Super Admin (dono do
 * sistema, invisível para a loja) e quem ainda está em espera.
 */
export async function usuariosParaFuncionario(incluirEmployeeId?: string): Promise<UsuarioFuncionario[]> {
  const users = await prisma.user.findMany({
    where: {
      active: true,
      pending: false,
      role: { not: "SUPER_ADMIN" },
      OR: [{ employee: null }, ...(incluirEmployeeId ? [{ employee: { id: incluirEmployeeId } }] : [])],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, document: true, pixKey: true, role: true, createdAt: true, profile: { select: { name: true } } },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    cpf: u.document ?? "",
    pixKey: u.pixKey ?? "",
    cargo: u.profile?.name || CARGO_DO_PAPEL[u.role] || "",
    desde: u.createdAt.toISOString().slice(0, 10),
  }));
}
