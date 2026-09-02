import "server-only";
import { prisma } from "@/lib/prisma";
import { docKey, nameKey } from "@/lib/person-keys";

/**
 * Em nome de quem o veículo está (proprietário lido do CRLV) — é da CASA, do
 * COMPRADOR ou de terceiro? Regras compartilhadas pela listagem do estoque,
 * pela ficha e pela leitura do CRLV.
 */

/** Chaves de nome da casa: loja (razão social e fantasia) + sócios do capital. */
export async function houseNameKeys(): Promise<string[]> {
  const [company, beneficiaries] = await Promise.all([
    prisma.companySettings.findUnique({
      where: { id: "company" },
      select: { razaoSocial: true, nomeFantasia: true },
    }),
    prisma.capitalBeneficiary.findMany({ select: { name: true } }),
  ]);
  return [company?.razaoSocial, company?.nomeFantasia, ...beneficiaries.map((b) => b.name)]
    .map((n) => nameKey(n))
    .filter((k) => k.length >= 4);
}

/**
 * O veículo está no nome da CASA (a loja ou um dos sócios) ou de terceiro?
 *
 * A comparação é por `nameKey` (sem acento/pontuação/espaço) e por CONTINÊNCIA
 * nos dois sentidos, porque o CRLV traz a razão social completa enquanto o
 * cadastro costuma ter a forma curta: "MVP VEICULOS LTDA" (documento) casa com
 * "MVP Veículos" (Parâmetros). Terceiro — "FABIANO FROES NEGOCIOS LTDA" — não
 * casa com nenhuma das nossas.
 */
export function isOwnName(ownerName: string, houseKeys: string[]): boolean {
  const key = nameKey(ownerName);
  if (!key) return false;
  return houseKeys.some((h) => h.length >= 4 && (key.includes(h) || h.includes(key)));
}

/**
 * O proprietário do CRLV é esta pessoa (o comprador da venda)? Bate pelo
 * CPF/CNPJ quando os dois estão completos; senão pelo nome, com a mesma
 * continência da casa ("G A GONCALVES JUNIOR LTDA" × "G A Gonçalves Junior").
 */
export function sameParty(
  ownerName: string | null | undefined,
  ownerDoc: string | null | undefined,
  person: { name: string; document: string | null },
): boolean {
  const d1 = docKey(ownerDoc);
  const d2 = docKey(person.document);
  if (d1 && d2) return d1 === d2;
  const k1 = nameKey(ownerName);
  const k2 = nameKey(person.name);
  if (k1.length < 6 || k2.length < 6) return false;
  return k1.includes(k2) || k2.includes(k1);
}

/** "01/09/2026" (data impressa no CRLV) → Date ao meio-dia UTC; null se inválida. */
export function parseDataBr(texto: string | null | undefined): Date | null {
  const m = (texto || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Veículo VENDIDO com o CRLV mais recente já em nome de terceiro (não da
 * casa), anexado depois da venda ou em nome do próprio comprador: a
 * transferência ao comprador CONCLUIU, mesmo que ninguém tenha marcado.
 * Usado como leitura derivada na listagem e na ficha (a leitura do CRLV grava
 * a conclusão de fato, com a data do documento).
 */
export function crlvNoNomeDoComprador(v: {
  status: string;
  docOwnerName: string | null;
  docOwnerIsOurs: boolean;
  lastCrlvAt: Date | null;
  sale: { saleDate: Date; transferDoneAt: Date | null; customer: { name: string; document: string | null } } | null;
}): boolean {
  if (v.status !== "VENDIDO" || !v.sale || v.sale.transferDoneAt) return false;
  if (!v.docOwnerName || v.docOwnerIsOurs) return false;
  if (sameParty(v.docOwnerName, null, v.sale.customer)) return true;
  return v.lastCrlvAt != null && v.lastCrlvAt.getTime() > v.sale.saleDate.getTime();
}
