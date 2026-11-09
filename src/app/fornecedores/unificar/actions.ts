"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/guards";
import { formatDate } from "@/lib/format";
import { findSupplierDuplicates } from "./detect";
import { conferirEExcluir, repontarFornecedor } from "./mover";

export type MergeResult = {
  ok: boolean;
  groups: number;
  moved: number;
  removed: number;
  names: string[];
  error?: string;
};

/**
 * Unifica os fornecedores duplicados: repõe os lançamentos no cadastro que
 * fica e exclui os repetidos.
 *
 * A ORDEM É O QUE IMPORTA. As seis chaves estrangeiras de fornecedor são
 * opcionais com `SetNull` por omissão (schema.prisma): se o DELETE rodar antes
 * de repontar, o Postgres zera os `supplierId` em silêncio e os lançamentos
 * ficam órfãos — exatamente o que não pode acontecer. Por isso: repontar as
 * seis, conferir que não sobrou ninguém apontando para os perdedores, e só
 * então excluir — tudo na mesma transação.
 *
 * Neutro no farol: nenhum cálculo da equação patrimonial ou da DRE lê
 * fornecedor (ele aparece só como nome em src/lib/reports.ts).
 *
 * Idempotente: depois de rodar, a varredura não encontra mais nada.
 */
export async function mergeDuplicateSuppliersAction(): Promise<MergeResult> {
  try {
    await assertCan("cadastros", "unificar");
  } catch (e) {
    return {
      ok: false,
      groups: 0,
      moved: 0,
      removed: 0,
      names: [],
      error: e instanceof Error ? e.message : "Sem permissão.",
    };
  }

  // Refaz a detecção no servidor — não confia em nada vindo da tela.
  // Nenhum perdedor pode ser espelho de usuário (a detecção já garante isso —
  // o espelho sempre vence e grupo com dois é bloqueado); a conferência aqui é
  // contra um erro futuro, porque excluir um espelho o traria de volta.
  const groups = (await findSupplierDuplicates()).filter(
    (g) => !g.blocked && g.winner && !g.losers.some((l) => l.isMirror),
  );
  if (groups.length === 0) {
    return { ok: true, groups: 0, moved: 0, removed: 0, names: [] };
  }

  const today = formatDate(new Date());
  const allLoserIds = groups.flatMap((g) => g.losers.map((l) => l.id));

  try {
    // Transação interativa (e não a forma em lista) porque são vários
    // comandos por grupo e é preciso conferir o resultado antes de excluir.
    await prisma.$transaction(
      async (tx) => {
        for (const g of groups) {
          const winnerId = g.winner!.id;
          const loserIds = g.losers.map((l) => l.id);
          await repontarFornecedor(tx, winnerId, loserIds);

          const audit = `Unificado em ${today}: ${g.losers.map((l) => l.name).join(", ")}.`;
          const notes = [g.enrich.notes ?? g.winner!.data.notes, audit].filter(Boolean).join(" · ");
          await tx.supplier.update({
            where: { id: winnerId },
            data: { ...g.enrich, name: g.survivingName, notes },
          });
        }

        // Trava contra órfão: se alguma tabela ainda apontar para um perdedor
        // (ex.: uma sexta chave estrangeira criada no futuro e esquecida
        // aqui), desfaz tudo em vez de deixar lançamento sem fornecedor.
        await conferirEExcluir(tx, allLoserIds);
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    return {
      ok: false,
      groups: 0,
      moved: 0,
      removed: 0,
      names: [],
      error: e instanceof Error ? e.message : "Não foi possível unificar.",
    };
  }

  // O nome do fornecedor aparece em quase toda tela — revalida o app inteiro.
  revalidatePath("/", "layout");
  revalidatePath("/fornecedores/unificar");

  return {
    ok: true,
    groups: groups.length,
    moved: groups.reduce((sum, g) => sum + g.moved, 0),
    removed: allLoserIds.length,
    names: groups.map((g) => g.survivingName),
  };
}

/**
 * Unificação MANUAL de dois cadastros escolhidos na tela — para os casos que a
 * varredura não pega (grafias diferentes: "Bradesco" e "Banco Bradesco S.A.",
 * ou a mesma empresa com CNPJ de matriz e de filial). Os lançamentos do que
 * some passam para o que fica; campos vazios do que fica são completados com
 * os do que some; só então o que some (já vazio) é excluído.
 */
export async function unificarDoisFornecedoresAction(
  ficaId: string,
  someId: string,
): Promise<{ ok: boolean; error?: string; nome?: string; movidos?: number }> {
  try {
    await assertCan("cadastros", "unificar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!ficaId || !someId) return { ok: false, error: "Escolha os dois cadastros." };
  if (ficaId === someId) return { ok: false, error: "Escolha dois cadastros diferentes." };
  const [fica, some] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: ficaId } }),
    prisma.supplier.findUnique({ where: { id: someId } }),
  ]);
  if (!fica || !some) return { ok: false, error: "Cadastro não encontrado — recarregue a página." };
  if (some.userId) {
    return {
      ok: false,
      error: `«${some.name}» é um usuário do sistema e não pode ser excluído. Inverta: deixe ele como o cadastro que fica.`,
    };
  }

  // Completa o que fica com o que só o outro tem. Espelho de usuário: o sync
  // sobrescreve os dados a partir de Usuários — só endereço e observações valem.
  const campos = fica.userId
    ? (["address", "endereco", "inscricaoEstadual"] as const)
    : ([
        "document",
        "phone",
        "email",
        "address",
        "endereco",
        "inscricaoEstadual",
        "bankName",
        "bankAgency",
        "bankAccount",
        "bankAccountType",
        "pixKey",
      ] as const);
  const completar: Record<string, unknown> = {};
  for (const c of campos) {
    const atual = fica[c];
    const doOutro = some[c];
    if ((atual == null || atual === "") && doOutro != null && doOutro !== "") completar[c] = doOutro;
  }
  const doc = some.document ? ` (${some.document})` : "";
  const notes = [fica.notes, some.notes, `Unificado em ${formatDate(new Date())}: ${some.name}${doc}.`]
    .filter(Boolean)
    .join(" · ");

  let movidos = 0;
  try {
    await prisma.$transaction(
      async (tx) => {
        movidos = await repontarFornecedor(tx, fica.id, [some.id]);
        await tx.supplier.update({ where: { id: fica.id }, data: { ...completar, notes } });
        await conferirEExcluir(tx, [some.id]);
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não foi possível unificar." };
  }
  revalidatePath("/", "layout");
  return { ok: true, nome: fica.name, movidos };
}
