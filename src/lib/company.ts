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

/**
 * Garante que a empresa dos Parâmetros exista como beneficiária no módulo
 * Capital (igual ao Agrasty). Idempotente: se já existir, só sincroniza o
 * nome com a razão social atual.
 */
export async function ensureCompanyBeneficiary() {
  const company = await prisma.companySettings.findUnique({ where: { id: "company" } });
  if (!company) return null;
  const existing = await prisma.capitalBeneficiary.findFirst({ where: { isCompany: true } });
  if (existing) {
    if (existing.name !== company.razaoSocial) {
      return prisma.capitalBeneficiary.update({
        where: { id: existing.id },
        data: { name: company.razaoSocial },
      });
    }
    return existing;
  }
  return prisma.capitalBeneficiary.create({
    data: {
      name: company.razaoSocial,
      isCompany: true,
      notes: "Empresa — criada automaticamente a partir dos Parâmetros",
    },
  });
}
