import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Vínculo 1:1 entre um usuário do sistema e um beneficiário do capital.
 * Quando vinculados, os nomes ficam SINCRONIZADOS: ao vincular, o beneficiário
 * adota o nome do usuário; renomear qualquer um dos dois reflete no par.
 */

/** Vincula um beneficiário a um usuário e iguala os nomes (nome do usuário). */
export async function linkBeneficiaryToUser(beneficiaryId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw new Error("Usuário não encontrado.");
  await prisma.$transaction([
    // Garante 1:1 — solta qualquer beneficiário que já estivesse com este usuário.
    prisma.capitalBeneficiary.updateMany({
      where: { userId, id: { not: beneficiaryId } },
      data: { userId: null },
    }),
    prisma.capitalBeneficiary.update({
      where: { id: beneficiaryId },
      data: { userId, name: user.name },
    }),
  ]);
}

/** Desfaz o vínculo do beneficiário (os nomes ficam como estão). */
export async function unlinkBeneficiary(beneficiaryId: string) {
  await prisma.capitalBeneficiary.update({
    where: { id: beneficiaryId },
    data: { userId: null },
  });
}

/**
 * Renomeia um registro (beneficiário OU usuário) e, se houver vínculo, mantém o
 * par com o mesmo nome. Informe exatamente um dos dois ids.
 */
export async function renameLinkedPair(
  source: { beneficiaryId?: string; userId?: string },
  name: string,
) {
  const clean = name.trim();
  if (!clean) throw new Error("Informe o nome.");

  if (source.beneficiaryId) {
    const b = await prisma.capitalBeneficiary.findUnique({
      where: { id: source.beneficiaryId },
      select: { userId: true },
    });
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.capitalBeneficiary.update({ where: { id: source.beneficiaryId }, data: { name: clean } }),
    ];
    if (b?.userId) ops.push(prisma.user.update({ where: { id: b.userId }, data: { name: clean } }));
    await prisma.$transaction(ops);
    return;
  }

  if (source.userId) {
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.user.update({ where: { id: source.userId }, data: { name: clean } }),
    ];
    const linked = await prisma.capitalBeneficiary.findUnique({
      where: { userId: source.userId },
      select: { id: true },
    });
    if (linked) ops.push(prisma.capitalBeneficiary.update({ where: { id: linked.id }, data: { name: clean } }));
    await prisma.$transaction(ops);
    return;
  }

  throw new Error("Informe o beneficiário ou o usuário.");
}
