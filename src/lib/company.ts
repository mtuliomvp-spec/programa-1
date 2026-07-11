import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Parâmetros da empresa (linha única, id fixo "company").
 * getCompany() sempre devolve um registro — cria o padrão na primeira vez.
 */
export async function getCompany() {
  const existing = await prisma.companySettings.findUnique({ where: { id: "company" } });
  if (existing) return existing;
  return prisma.companySettings.create({ data: { id: "company" } });
}
