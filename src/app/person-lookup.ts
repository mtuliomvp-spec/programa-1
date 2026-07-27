"use server";

import { prisma } from "@/lib/prisma";
import { canUseFormLookup } from "@/lib/guards";

export type PersonLookup =
  | { found: false }
  | {
      found: true;
      source: "cliente" | "fornecedor";
      data: { name: string; document: string; phone: string; email: string; address: string };
    };

/**
 * Procura uma pessoa já cadastrada (cliente OU fornecedor) pelo CPF/CNPJ, para
 * reaproveitar os dados. Assim, ao cadastrar um fornecedor cujo documento já é
 * de um cliente (ou o contrário), os mesmos dados são trazidos.
 */
export async function findPersonByDocument(documentRaw: string): Promise<PersonLookup> {
  const document = (documentRaw || "").trim();
  if (!document) return { found: false };
  // Consulta de dados cadastrais: exige permissão de criar/editar em algum
  // dos formulários que a usam; senão degrada como "não encontrado".
  if (!(await canUseFormLookup())) return { found: false };

  const [customer, supplier] = await Promise.all([
    prisma.customer.findFirst({ where: { document } }),
    prisma.supplier.findFirst({ where: { document } }),
  ]);
  const person = customer ?? supplier;
  if (!person) return { found: false };

  return {
    found: true,
    source: customer ? "cliente" : "fornecedor",
    data: {
      name: person.name,
      document: person.document ?? "",
      phone: person.phone ?? "",
      email: person.email ?? "",
      address: person.address ?? "",
    },
  };
}
