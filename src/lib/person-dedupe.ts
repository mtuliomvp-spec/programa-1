import "server-only";
import { prisma } from "@/lib/prisma";
import { docKey, nameKey } from "@/lib/person-keys";

/**
 * Consultas de identidade usadas pelas travas de cadastro: duas pessoas são a
 * mesma quando têm o mesmo `nameKey` OU o mesmo `docKey` (ver person-keys.ts).
 *
 * Busca em dois níveis para não varrer a tabela à toa: primeiro o nome exato
 * (ignorando maiúscula), que resolve a maioria; só quando ele falha — ou seja,
 * só no caminho em que o cadastro seria criado — é que se traz a lista e se
 * compara pela chave normalizada. O `findFirst` de hoje já é varredura (não há
 * índice em `name`), então o custo do caminho comum não aumenta.
 */

export type IdentityMatch = {
  id: string;
  name: string;
  document: string | null;
  isUser?: boolean;
} | null;

export async function findSupplierByIdentity(
  name: string,
  document?: string | null,
  excludeId?: string,
): Promise<IdentityMatch> {
  const trimmed = (name || "").trim();
  if (trimmed) {
    const fast = await prisma.supplier.findFirst({
      where: { name: { equals: trimmed, mode: "insensitive" }, id: { not: excludeId } },
      select: { id: true, name: true, document: true, userId: true },
    });
    if (fast) {
      return { id: fast.id, name: fast.name, document: fast.document, isUser: Boolean(fast.userId) };
    }
  }
  const nk = nameKey(trimmed);
  const dk = docKey(document);
  if (!nk && !dk) return null;
  const all = await prisma.supplier.findMany({
    select: { id: true, name: true, document: true, userId: true },
  });
  const found = all.find(
    (s) =>
      s.id !== excludeId && ((nk && nameKey(s.name) === nk) || (dk && docKey(s.document) === dk)),
  );
  return found
    ? { id: found.id, name: found.name, document: found.document, isUser: Boolean(found.userId) }
    : null;
}

export async function findCustomerByIdentity(
  name: string,
  document?: string | null,
  excludeId?: string,
): Promise<IdentityMatch> {
  const trimmed = (name || "").trim();
  if (trimmed) {
    const fast = await prisma.customer.findFirst({
      where: { name: { equals: trimmed, mode: "insensitive" }, id: { not: excludeId } },
      select: { id: true, name: true, document: true },
    });
    if (fast) return { id: fast.id, name: fast.name, document: fast.document };
  }
  const nk = nameKey(trimmed);
  const dk = docKey(document);
  if (!nk && !dk) return null;
  const all = await prisma.customer.findMany({ select: { id: true, name: true, document: true } });
  const found = all.find(
    (c) =>
      c.id !== excludeId && ((nk && nameKey(c.name) === nk) || (dk && docKey(c.document) === dk)),
  );
  return found ? { id: found.id, name: found.name, document: found.document } : null;
}

/** Mensagem única de bloqueio, em linguagem de quem usa o sistema. */
export function duplicateError(
  kind: "fornecedor" | "cliente",
  match: NonNullable<IdentityMatch>,
): string {
  if (match.isUser) {
    return `«${match.name}» já existe como ${kind} porque é um usuário do sistema. Escolha-o na lista em vez de cadastrar de novo.`;
  }
  return `Já existe o ${kind} «${match.name}» (mesmo nome ou mesmo CPF/CNPJ). Use o cadastro existente ou, se for outra pessoa, diferencie o nome.`;
}
