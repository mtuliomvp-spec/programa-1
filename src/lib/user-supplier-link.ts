import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Fornecedor-espelho de um usuário do sistema: todo usuário também pode ser
 * escolhido como fornecedor. O espelho (`Supplier.userId`) tem nome e dados
 * bancários SINCRONIZADOS a partir do usuário (fonte de verdade = Usuários),
 * então a Ordem de Pagamento funciona quando o fornecedor-usuário é escolhido.
 */

const userSelect = {
  id: true,
  name: true,
  document: true,
  phone: true,
  email: true,
  bankName: true,
  bankAgency: true,
  bankAccount: true,
  bankAccountType: true,
  pixKey: true,
} as const;

type UserMirror = {
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAgency: string | null;
  bankAccount: string | null;
  bankAccountType: string | null;
  pixKey: string | null;
};

function mirrorData(u: UserMirror) {
  return {
    name: u.name,
    document: u.document,
    phone: u.phone,
    email: u.email,
    bankName: u.bankName,
    bankAgency: u.bankAgency,
    bankAccount: u.bankAccount,
    bankAccountType: u.bankAccountType,
    pixKey: u.pixKey,
  };
}

/** Cria/atualiza o fornecedor-espelho de um usuário. */
export async function syncUserSupplier(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) return;
  const data = mirrorData(user);
  await prisma.supplier.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  revalidatePath("/fornecedores");
}

/** Garante o espelho de todos os usuários (auto-heal / cobre criações fora dos fluxos). */
export async function syncAllUserSuppliers() {
  const users = await prisma.user.findMany({ select: userSelect });
  for (const user of users) {
    const data = mirrorData(user);
    await prisma.supplier.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
  }
}
