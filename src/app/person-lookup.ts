"use server";

import { prisma } from "@/lib/prisma";
import { canUseFormLookup } from "@/lib/guards";
import { docKey, nameKey } from "@/lib/person-keys";
import { lerEndereco, type Endereco } from "@/lib/endereco";

export type PersonLookup =
  | { found: false }
  | {
      found: true;
      source: "cliente" | "fornecedor";
      data: {
        name: string;
        document: string;
        phone: string;
        email: string;
        address: string;
        endereco: Endereco | null;
      };
      /**
       * Dados bancários do cadastro de FORNECEDOR com esse documento (o cliente
       * não guarda conta). Vem mesmo quando a pessoa foi achada como cliente:
       * quem é cliente e fornecedor tem a conta no cadastro de fornecedor.
       */
      banco: DadosBancarios | null;
    };

export type DadosBancarios = {
  /** Como o fornecedor foi achado: pelo CPF/CNPJ ou, sem documento no cadastro, pelo nome. */
  origem?: "documento" | "nome";
  bankName: string;
  bankAgency: string;
  bankAccount: string;
  /** "corrente" | "poupanca" | "" (como no cadastro de fornecedor). */
  bankAccountType: string;
  pixKey: string;
};

/**
 * Procura uma pessoa já cadastrada (cliente OU fornecedor) pelo CPF/CNPJ, para
 * reaproveitar os dados. Assim, ao cadastrar um fornecedor cujo documento já é
 * de um cliente (ou o contrário), os mesmos dados são trazidos.
 */
/** Nome de empresa sem o tipo societário: "MEGA RENT A CAR LTDA ME" = "Mega Rent a Car Ltda". */
function nomeEmpresaKey(nome: string | null | undefined): string {
  const sem = (nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.\/&-]/g, " ")
    .replace(/\b(ltda|me|epp|eireli|mei|s ?a|cia|limitada)\b/g, " ");
  return nameKey(sem);
}

export async function findPersonByDocument(documentRaw: string, nomeRaw?: string): Promise<PersonLookup> {
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
    prisma.customer.findMany({ select: { name: true, document: true, phone: true, email: true, address: true, endereco: true } }),
    prisma.supplier.findMany({
      select: {
        name: true,
        document: true,
        phone: true,
        email: true,
        address: true,
        endereco: true,
        bankName: true,
        bankAgency: true,
        bankAccount: true,
        bankAccountType: true,
        pixKey: true,
      },
    }),
  ]);
  const customer = customers.find((c) => docKey(c.document) === key) ?? null;
  const supplierDoc = suppliers.find((s) => docKey(s.document) === key) ?? null;
  // Fornecedor cadastrado SEM CPF/CNPJ (comum em cadastro rápido): casa pelo
  // nome da pessoa — o informado na tela ou o do cliente achado —, ignorando
  // LTDA/ME/EPP. Só quando há exatamente um candidato.
  let supplier = supplierDoc;
  if (!supplier) {
    const nomes = new Set([nomeEmpresaKey(nomeRaw), nomeEmpresaKey(customer?.name)].filter((k) => k.length >= 4));
    const candidatos = suppliers.filter((s) => !docKey(s.document) && nomes.has(nomeEmpresaKey(s.name)));
    if (candidatos.length === 1) supplier = candidatos[0];
  }
  const person = customer ?? supplierDoc ?? null;
  if (!person && !supplier) return { found: false };
  const banco: DadosBancarios | null =
    supplier && (supplier.bankName || supplier.bankAccount || supplier.pixKey)
      ? {
          origem: supplierDoc ? "documento" : "nome",
          bankName: supplier.bankName ?? "",
          bankAgency: supplier.bankAgency ?? "",
          bankAccount: supplier.bankAccount ?? "",
          bankAccountType: supplier.bankAccountType ?? "",
          pixKey: supplier.pixKey ?? "",
        }
      : null;

  const quem = person ?? supplier!;
  return {
    found: true,
    source: customer ? "cliente" : "fornecedor",
    data: {
      name: quem.name,
      document: quem.document || document,
      // O cliente achado primeiro pode estar incompleto: o que faltar vem do
      // cadastro de fornecedor da mesma pessoa.
      phone: quem.phone || supplier?.phone || "",
      email: quem.email || supplier?.email || "",
      address: quem.address || supplier?.address || "",
      endereco: lerEndereco(quem.endereco) ?? lerEndereco(supplier?.endereco ?? null),
    },
    banco,
  };
}
