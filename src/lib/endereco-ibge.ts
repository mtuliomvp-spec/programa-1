import { prisma } from "@/lib/prisma";
import { completarIbgePeloCep } from "@/lib/cep-lookup";
import { lerEndereco, type Endereco } from "@/lib/endereco";

/**
 * Endereço de fornecedor/cliente para a NF-e. Cadastro com CEP mas sem o
 * código IBGE do município (veio da consulta do CNPJ pela ReceitaWS, ou é
 * antigo): completa pelo CEP e GRAVA no cadastro, uma vez só — a nota exige o
 * código e o usuário não teria como digitá-lo (o campo é oculto).
 */
export async function enderecoNfeDoCadastro(
  tipo: "fornecedor" | "cliente",
  id: string,
  bruto: unknown,
): Promise<Endereco | null> {
  const end = lerEndereco(bruto);
  if (!end || /^\d{7}$/.test(end.ibge)) return end;
  const completo = await completarIbgePeloCep(end);
  if (completo.ibge === end.ibge) return end;
  const data = { endereco: completo };
  if (tipo === "fornecedor") await prisma.supplier.update({ where: { id }, data }).catch(() => null);
  else await prisma.customer.update({ where: { id }, data }).catch(() => null);
  return completo;
}
