"use server";

import { prisma } from "@/lib/prisma";
import { canUseFormLookup } from "@/lib/guards";
import { docKey } from "@/lib/person-keys";

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

  // Compara só os dígitos: o documento é gravado como veio digitado, então
  // "22.763.502/0076-24" e "22763502007624" precisam achar um ao outro.
  const key = docKey(document);
  if (!key) return { found: false };
  const [customers, suppliers] = await Promise.all([
    prisma.customer.findMany({ select: { name: true, document: true, phone: true, email: true, address: true } }),
    prisma.supplier.findMany({ select: { name: true, document: true, phone: true, email: true, address: true } }),
  ]);
  const customer = customers.find((c) => docKey(c.document) === key) ?? null;
  const supplier = suppliers.find((s) => docKey(s.document) === key) ?? null;
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
