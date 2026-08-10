import "server-only";
import { prisma } from "@/lib/prisma";
import {
  bestNameVariant,
  blockReason,
  groupDuplicates,
  pickWinner,
  type BlockReason,
  type ScoredRow,
} from "@/lib/person-keys";

/**
 * Encontra clientes duplicados — mesmo nome (ignorando acento, maiúscula e
 * pontuação) ou mesmo CPF/CNPJ — e decide qual cadastro sobrevive. Mesma regra
 * dos fornecedores (src/app/fornecedores/unificar/detect.ts), com duas
 * diferenças:
 *
 *  - cliente não tem "espelho de usuário", então nunca há vencedor obrigatório;
 *  - além das quatro relações do Prisma, a PRÉ-VENDA guarda o `customerId`
 *    como texto solto, SEM chave estrangeira (schema.prisma:578). Ela precisa
 *    ser contada aqui e repontada na unificação, senão a proposta passa a
 *    apontar para um cliente que não existe mais.
 */

const ENRICH_FIELDS = ["document", "phone", "email", "address", "notes"] as const;

const SENSITIVE_FIELDS: { key: (typeof ENRICH_FIELDS)[number]; label: string }[] = [
  { key: "document", label: "CPF/CNPJ" },
];

type CustomerFields = Record<(typeof ENRICH_FIELDS)[number], string | null>;

export type CustomerMember = ScoredRow & {
  counts: { sales: number; partSales: number; receivables: number; recurring: number; preSales: number };
  data: CustomerFields;
};

export type CustomerGroup = {
  members: CustomerMember[];
  winner: CustomerMember | null;
  losers: CustomerMember[];
  survivingName: string;
  moved: number;
  enrich: Partial<CustomerFields>;
  discarded: string[];
  blocked: BlockReason;
};

export async function findCustomerDuplicates(): Promise<CustomerGroup[]> {
  const [rows, preSaleCounts] = await Promise.all([
    prisma.customer.findMany({
      include: {
        _count: { select: { sales: true, partSales: true, receivables: true, recurring: true } },
      },
    }),
    prisma.preSale.groupBy({ by: ["customerId"], _count: { _all: true } }),
  ]);
  const preSaleByCustomer = new Map(preSaleCounts.map((p) => [p.customerId, p._count._all]));

  const members: CustomerMember[] = rows.map((c) => {
    const data = {} as CustomerFields;
    for (const f of ENRICH_FIELDS) data[f] = (c as unknown as Record<string, string | null>)[f] ?? null;
    const counts = {
      sales: c._count.sales,
      partSales: c._count.partSales,
      receivables: c._count.receivables,
      recurring: c._count.recurring,
      preSales: preSaleByCustomer.get(c.id) ?? 0,
    };
    return {
      id: c.id,
      name: c.name,
      document: c.document,
      isMirror: false,
      createdAt: c.createdAt,
      filled: ENRICH_FIELDS.filter((f) => data[f]).length,
      moved: Object.values(counts).reduce((a, b) => a + b, 0),
      counts,
      data,
    };
  });

  return groupDuplicates(members)
    .map(buildGroup)
    .sort((a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)) || b.moved - a.moved);
}

function buildGroup(members: CustomerMember[]): CustomerGroup {
  const names = members.map((m) => m.name);
  const survivingName = bestNameVariant(names);
  const blocked = blockReason(members);
  if (blocked) {
    return { members, winner: null, losers: [], survivingName, moved: 0, enrich: {}, discarded: [], blocked };
  }

  const winner = pickWinner(members);
  const losers = members.filter((m) => m.id !== winner.id);

  const enrich: Partial<CustomerFields> = {};
  for (const f of ENRICH_FIELDS) {
    if (winner.data[f]) continue;
    const from = losers.find((l) => l.data[f]);
    if (from) enrich[f] = from.data[f];
  }

  const discarded: string[] = [];
  for (const { key, label } of SENSITIVE_FIELDS) {
    const kept = winner.data[key];
    if (!kept) continue;
    for (const l of losers) {
      if (l.data[key] && l.data[key] !== kept) {
        discarded.push(`${label} «${l.data[key]}» de «${l.name}» (fica «${kept}»)`);
      }
    }
  }

  return {
    members,
    winner,
    losers,
    survivingName,
    moved: losers.reduce((sum, l) => sum + l.moved, 0),
    enrich,
    discarded,
    blocked: null,
  };
}
