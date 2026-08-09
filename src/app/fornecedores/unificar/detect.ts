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
 * Encontra fornecedores duplicados — o mesmo nome (ignorando acento, maiúscula
 * e pontuação) ou o mesmo CPF/CNPJ — e decide qual cadastro sobrevive.
 *
 * Puro em relação ao dinheiro: fornecedor só aparece como NOME nos relatórios
 * (src/lib/reports.ts) e não entra em nenhum cálculo do farol. Unificar move
 * lançamentos de dono, não muda valor nenhum.
 */

/** Campos que podem ser herdados de um duplicado para completar o vencedor. */
const ENRICH_FIELDS = [
  "document",
  "phone",
  "email",
  "address",
  "notes",
  "bankName",
  "bankAgency",
  "bankAccount",
  "bankAccountType",
  "pixKey",
] as const;

/**
 * Num fornecedor-espelho de usuário, o sync (src/lib/user-supplier-link.ts)
 * sobrescreve nome, documento, telefone, e-mail e dados bancários a partir de
 * Usuários a cada acesso. Só estes dois campos sobrevivem.
 */
const MIRROR_SAFE_FIELDS = ["address", "notes"] as const;

/** Campos cujo conflito entre os duplicados vale um aviso na tela. */
const SENSITIVE_FIELDS: { key: (typeof ENRICH_FIELDS)[number]; label: string }[] = [
  { key: "document", label: "CPF/CNPJ" },
  { key: "pixKey", label: "chave PIX" },
  { key: "bankAccount", label: "conta bancária" },
];

type SupplierFields = Record<(typeof ENRICH_FIELDS)[number], string | null>;

export type SupplierMember = ScoredRow & {
  counts: { vehicles: number; parts: number; payables: number; recurring: number; purchaseRequests: number };
  data: SupplierFields;
};

export type SupplierGroup = {
  members: SupplierMember[];
  winner: SupplierMember | null;
  losers: SupplierMember[];
  /** Nome que fica depois da unificação. */
  survivingName: string;
  /** Total de lançamentos que mudam de dono. */
  moved: number;
  enrich: Partial<SupplierFields>;
  /** Dados que se perdem porque o vencedor já tem outro valor. */
  discarded: string[];
  blocked: BlockReason;
};

function fieldsOf(s: Record<string, unknown>): SupplierFields {
  const out = {} as SupplierFields;
  for (const f of ENRICH_FIELDS) out[f] = (s[f] as string | null) ?? null;
  return out;
}

export async function findSupplierDuplicates(): Promise<SupplierGroup[]> {
  const rows = await prisma.supplier.findMany({
    include: {
      _count: {
        select: { vehicles: true, parts: true, payables: true, recurring: true, purchaseRequests: true },
      },
    },
  });

  const members: SupplierMember[] = rows.map((s) => {
    const data = fieldsOf(s as unknown as Record<string, unknown>);
    const counts = {
      vehicles: s._count.vehicles,
      parts: s._count.parts,
      payables: s._count.payables,
      recurring: s._count.recurring,
      purchaseRequests: s._count.purchaseRequests,
    };
    return {
      id: s.id,
      name: s.name,
      document: s.document,
      isMirror: Boolean(s.userId),
      createdAt: s.createdAt,
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

function buildGroup(members: SupplierMember[]): SupplierGroup {
  const names = members.map((m) => m.name);
  const blocked = blockReason(members);
  if (blocked) {
    return {
      members,
      winner: null,
      losers: [],
      survivingName: bestNameVariant(names),
      moved: 0,
      enrich: {},
      discarded: [],
      blocked,
    };
  }

  const winner = pickWinner(members);
  const losers = members.filter((m) => m.id !== winner.id);
  // O nome do espelho é mandado por Usuários — não adianta escolher outro aqui.
  const survivingName = winner.isMirror ? winner.name : bestNameVariant(names);

  const allowed = winner.isMirror ? MIRROR_SAFE_FIELDS : ENRICH_FIELDS;
  const enrich: Partial<SupplierFields> = {};
  for (const f of allowed) {
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
