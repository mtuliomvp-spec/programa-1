"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { CategoriaReceber } from "@prisma/client";
import { ensureRecurringGenerated } from "@/lib/recurring";
import { resolveSupplierByName } from "@/lib/finance";
import { assertCan } from "@/lib/guards";
import { parseDateInput } from "@/lib/format";
import { resolveDespesaCategory, resolveReceitaCategory } from "@/lib/categories";
import { STRUCTURAL_KEY_VALUES } from "@/lib/structural-flows";

const recurringSchema = z.object({
  kind: z.enum(["PAGAR", "RECEBER"]),
  description: z.string().min(1, "Informe a descrição"),
  // Fatura de cartão pode começar com 0 (o valor real vem dos lançamentos);
  // nas demais o valor precisa ser positivo (validado após o parse).
  amount: z.coerce.number().min(0, "Informe um valor válido"),
  cardInvoice: z.coerce.boolean().optional(),
  structuralKey: z.enum(STRUCTURAL_KEY_VALUES).default("ADMINISTRATIVO"),
  periodicidade: z.enum(["MENSAL", "DIAS"]).default("MENSAL"),
  dayOfMonth: z.coerce.number().int().min(1).max(31).default(5),
  intervalDays: z.coerce.number().int().min(1).max(365).optional(),
  // Antecipa o vencimento para o último dia útil (fim de semana/feriado).
  anticipateToBusinessDay: z.coerce.boolean().optional(),
  categoryLabel: z.string().optional(),
  supplierName: z.string().optional(),
  customerId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

export type RecurringFormState = { error?: string };

export async function createRecurringAction(
  _prev: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = recurringSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;
  // Término antes do início: a recorrência nunca geraria nada (o gerador só cria
  // vencimentos entre as duas datas) e ainda apareceria "Ativa" na lista.
  if (data.endDate && parseDateInput(data.endDate) < parseDateInput(data.startDate)) {
    return { error: 'O "Termina em" não pode ser antes do "Começa em" — assim a recorrência nunca geraria títulos.' };
  }
  const isCard = data.kind === "PAGAR" && Boolean(data.cardInvoice);
  if (!isCard && data.amount <= 0) {
    return { error: "Informe um valor maior que zero." };
  }
  const porDias = data.periodicidade === "DIAS";
  if (porDias && !data.intervalDays) {
    return { error: "Informe de quantos em quantos dias (1 a 365)." };
  }
  const isCapital = data.structuralKey === "CAPITAL";
  if (isCapital && !data.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do fluxo Capital." };
  }

  const label = (data.categoryLabel || "").trim();
  if (!isCapital && !label) {
    return { error: "Informe a categoria." };
  }
  // No fluxo Capital a categoria não é despesa/receita — usa OUTROS, sem rótulo.
  // Fora dele, resolve o rótulo escolhido/digitado para enum + nome canônico.
  let categoryPagar: "COMPRA_VEICULO" | "COMPRA_PECA" | "DESPESA_OPERACIONAL" | "COMISSAO" | "SALARIO" | "COMBUSTIVEL" | "DEVOLUCAO_CLIENTE" | "DEVOLUCAO_PROPRIETARIO" | "OUTROS" | null = null;
  let categoryReceber: CategoriaReceber | null = null;
  let categoryLabel: string | null = null;
  // Capital: a categoria INTERNA é sempre OUTROS (retirada/aporte não é despesa
  // nem receita), mas o rótulo digitado é guardado para organização/relatório.
  if (data.kind === "PAGAR") {
    if (isCapital) {
      categoryPagar = "OUTROS";
      categoryLabel = label || null;
    } else {
      const cat = await resolveDespesaCategory(label);
      categoryPagar = cat.category;
      categoryLabel = cat.label;
    }
  } else {
    if (isCapital) {
      categoryReceber = "OUTROS";
      categoryLabel = label || null;
    } else {
      const cat = await resolveReceitaCategory(label);
      categoryReceber = cat.category;
      categoryLabel = cat.label;
    }
  }

  // Fornecedor por nome (campo com digitação livre): reaproveita ou cadastra.
  const supplierName = (data.supplierName || "").trim();
  const supplierId =
    data.kind === "PAGAR" && supplierName ? await resolveSupplierByName(supplierName) : null;

  try {
    await prisma.recurringEntry.create({
      data: {
        kind: data.kind,
        description: data.description,
        amount: data.amount,
        structuralKey: data.structuralKey,
        dayOfMonth: data.dayOfMonth,
        intervalDays: porDias ? data.intervalDays : null,
        anticipateToBusinessDay: Boolean(data.anticipateToBusinessDay),
        cardInvoice: isCard,
        categoryPagar,
        categoryReceber,
        categoryLabel,
        supplierId,
        customerId: data.kind === "RECEBER" && !isCapital ? data.customerId || null : null,
        capitalBeneficiaryId: isCapital ? data.capitalBeneficiaryId || null : null,
        startDate: parseDateInput(data.startDate),
        endDate: data.endDate ? parseDateInput(data.endDate) : null,
        notes: data.notes || null,
      },
    });
    await ensureRecurringGenerated();
  } catch {
    return { error: "Não foi possível salvar a recorrência." };
  }
  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  redirect("/financeiro/recorrentes");
}

const updateSchema = recurringSchema.extend({ id: z.string().min(1) });

/**
 * Edita a DEFINIÇÃO de uma recorrência. Os títulos já gerados permanecem como
 * estão (podem ser ajustados/excluídos individualmente); as próximas gerações
 * usam os novos valores.
 */
export async function updateRecurringAction(
  _prev: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  }
  const data = parsed.data;
  // Mesma trava do criar: término antes do início nunca gera título.
  if (data.endDate && parseDateInput(data.endDate) < parseDateInput(data.startDate)) {
    return { error: 'O "Termina em" não pode ser antes do "Começa em" — assim a recorrência nunca geraria títulos.' };
  }
  const isCard = data.kind === "PAGAR" && Boolean(data.cardInvoice);
  if (!isCard && data.amount <= 0) {
    return { error: "Informe um valor maior que zero." };
  }
  const porDias = data.periodicidade === "DIAS";
  if (porDias && !data.intervalDays) {
    return { error: "Informe de quantos em quantos dias (1 a 365)." };
  }
  const isCapital = data.structuralKey === "CAPITAL";
  if (isCapital && !data.capitalBeneficiaryId) {
    return { error: "Escolha o sócio (beneficiário) do fluxo Capital." };
  }

  const label = (data.categoryLabel || "").trim();
  if (!isCapital && !label) {
    return { error: "Informe a categoria." };
  }
  let categoryPagar: "COMPRA_VEICULO" | "COMPRA_PECA" | "DESPESA_OPERACIONAL" | "COMISSAO" | "SALARIO" | "COMBUSTIVEL" | "DEVOLUCAO_CLIENTE" | "DEVOLUCAO_PROPRIETARIO" | "OUTROS" | null = null;
  let categoryReceber: CategoriaReceber | null = null;
  let categoryLabel: string | null = null;
  // Capital: a categoria INTERNA é sempre OUTROS (retirada/aporte não é despesa
  // nem receita), mas o rótulo digitado é guardado para organização/relatório.
  if (data.kind === "PAGAR") {
    if (isCapital) {
      categoryPagar = "OUTROS";
      categoryLabel = label || null;
    } else {
      const cat = await resolveDespesaCategory(label);
      categoryPagar = cat.category;
      categoryLabel = cat.label;
    }
  } else {
    if (isCapital) {
      categoryReceber = "OUTROS";
      categoryLabel = label || null;
    } else {
      const cat = await resolveReceitaCategory(label);
      categoryReceber = cat.category;
      categoryLabel = cat.label;
    }
  }

  const supplierName = (data.supplierName || "").trim();
  const supplierId =
    data.kind === "PAGAR" && supplierName ? await resolveSupplierByName(supplierName) : null;

  const existing = await prisma.recurringEntry.findUnique({ where: { id: data.id }, select: { id: true } });
  if (!existing) return { error: "Recorrência não encontrada." };

  try {
    await prisma.recurringEntry.update({
      where: { id: data.id },
      data: {
        kind: data.kind,
        description: data.description,
        amount: data.amount,
        structuralKey: data.structuralKey,
        dayOfMonth: data.dayOfMonth,
        intervalDays: porDias ? data.intervalDays : null,
        anticipateToBusinessDay: Boolean(data.anticipateToBusinessDay),
        cardInvoice: isCard,
        categoryPagar,
        categoryReceber,
        categoryLabel,
        supplierId,
        customerId: data.kind === "RECEBER" && !isCapital ? data.customerId || null : null,
        capitalBeneficiaryId: isCapital ? data.capitalBeneficiaryId || null : null,
        startDate: parseDateInput(data.startDate),
        endDate: data.endDate ? parseDateInput(data.endDate) : null,
        notes: data.notes || null,
      },
    });
    await ensureRecurringGenerated();
  } catch {
    return { error: "Não foi possível salvar as alterações." };
  }
  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  redirect("/financeiro/recorrentes");
}

export async function toggleRecurringAction(id: string, active: boolean) {
  await assertCan("financeiro", "criar");
  await prisma.recurringEntry.update({ where: { id }, data: { active } });
  revalidatePath("/financeiro/recorrentes");
}

export async function deleteRecurringAction(id: string) {
  await assertCan("financeiro", "criar");
  // as contas já geradas ficam no financeiro; apenas param de ser criadas
  await prisma.recurringEntry.delete({ where: { id } });
  revalidatePath("/financeiro/recorrentes");
}

/**
 * Gera na hora os títulos recorrentes. Não exige caixa aberto/farol verde: só
 * cria títulos PENDENTE (sem baixa/dinheiro). Usa antecedência maior (45 dias)
 * para já puxar a próxima ocorrência, mesmo faltando mais de 15 dias.
 */
export async function generateNowAction(): Promise<{ ok: boolean; created?: number; error?: string }> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const created = await ensureRecurringGenerated(45);
  revalidatePath("/financeiro/recorrentes");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  return { ok: true, created };
}

// ---------------------------------------------------------------------------
// Importar do documento: a IA lê o boleto/carnê e propõe a recorrência
// ---------------------------------------------------------------------------

/** Uma parcela lida do arquivo, como a tela mostra para conferência. */
export type ParcelaLida = { amount: number | null; dueDate: string | null; descricao: string | null };

export type PropostaRecorrencia = {
  description: string;
  amount: number;
  supplierName: string;
  periodicidade: "MENSAL" | "DIAS";
  dayOfMonth: number;
  intervalDays: number | null;
  anticipateToBusinessDay: boolean;
  startDate: string;
  endDate: string | null;
  notes: string;
};

export type LeituraRecorrencia = {
  ok: boolean;
  error?: string;
  parcelas: ParcelaLida[];
  proposta?: PropostaRecorrencia;
  /** O que a leitura deduziu e o usuário precisa conferir. */
  avisos: string[];
};

const MAX_DOC_BYTES = 15 * 1024 * 1024;

/** yyyy-mm-dd → dia do mês. */
const diaDe = (iso: string) => Number(iso.slice(8, 10));

/** Guias de imposto vencem em dia útil: DAS, FGTS, INSS, DARF. */
function pareceGuiaDeImposto(texto: string): boolean {
  const t = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return /\b(DAS|DARF|FGTS|INSS|GPS|GARE|SIMPLES NACIONAL|RECEITA FEDERAL|PREVIDENC)/.test(t);
}

/**
 * Lê o documento (boleto avulso ou carnê com várias parcelas) e devolve uma
 * proposta de recorrência para o usuário conferir e salvar no formulário
 * normal — nada é gravado aqui.
 *
 * A dedução vem das parcelas: duas ou mais em meses seguidos viram uma
 * recorrência MENSAL no dia delas, com início na primeira e fim na última
 * (carnê tem prazo); espaçamento regular fora do mês vira "a cada N dias".
 */
export async function readRecurringDocumentAction(formData: FormData): Promise<LeituraRecorrencia> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, parcelas: [], avisos: [], error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, parcelas: [], avisos: [], error: "Selecione o arquivo do boleto ou do carnê." };
  }
  if (file.size > MAX_DOC_BYTES) {
    return { ok: false, parcelas: [], avisos: [], error: "Arquivo muito grande (máximo 15 MB)." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  let lidos;
  try {
    const { extractBoletos } = await import("@/lib/boleto-ai");
    lidos = await extractBoletos(buffer.toString("base64"), mimeType);
  } catch (e) {
    return {
      ok: false,
      parcelas: [],
      avisos: [],
      error: e instanceof Error ? e.message : "Não foi possível ler o documento.",
    };
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const parcelas: ParcelaLida[] = lidos
    .map((b) => ({
      amount: b.valor && b.valor > 0 ? round2(b.valor) : null,
      dueDate: b.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(b.vencimento) ? b.vencimento : null,
      descricao: b.descricao,
    }))
    // Carnê fora de ordem: a dedução depende da sequência dos vencimentos.
    .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));

  if (!parcelas.length) {
    return {
      ok: false,
      parcelas: [],
      avisos: [],
      error: "Nenhum boleto foi reconhecido neste arquivo. Cadastre a recorrência à mão.",
    };
  }

  const avisos: string[] = [];
  const comData = parcelas.filter((p) => p.dueDate) as (ParcelaLida & { dueDate: string })[];
  const comValor = parcelas.filter((p) => p.amount != null);

  // Valor: o mais frequente entre as parcelas (carnê com uma parcela diferente
  // — a primeira, com entrada — não deve definir o valor do mês).
  const contagem = new Map<number, number>();
  for (const p of comValor) contagem.set(p.amount as number, (contagem.get(p.amount as number) ?? 0) + 1);
  const amount = [...contagem.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
  if (!amount) avisos.push("Não deu para ler o valor — informe abaixo antes de salvar.");
  if (contagem.size > 1) {
    avisos.push(
      `As parcelas têm valores diferentes; foi proposto o mais comum (${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}). Os meses fora do padrão você ajusta depois em Contas a pagar.`,
    );
  }

  const primeira = comData[0]?.dueDate ?? null;
  const ultima = comData.length > 1 ? comData[comData.length - 1].dueDate : null;
  if (!primeira) avisos.push("Não deu para ler o vencimento — confira o dia e a data de início.");

  // Periodicidade: mensal quando os vencimentos caem mês a mês; espaçamento
  // regular fora disso vira "a cada N dias".
  let periodicidade: "MENSAL" | "DIAS" = "MENSAL";
  let intervalDays: number | null = null;
  if (comData.length >= 2) {
    const dias = comData
      .slice(1)
      .map((p, i) =>
        Math.round(
          (new Date(`${p.dueDate}T12:00:00Z`).getTime() -
            new Date(`${comData[i].dueDate}T12:00:00Z`).getTime()) /
            86_400_000,
        ),
      );
    const mensal = dias.every((d) => d >= 27 && d <= 32);
    if (!mensal) {
      const iguais = dias.every((d) => d === dias[0]);
      if (iguais && dias[0] > 0) {
        periodicidade = "DIAS";
        intervalDays = dias[0];
      } else {
        avisos.push(
          "Os vencimentos não seguem um intervalo regular; foi proposta a repetição mensal — confira antes de salvar.",
        );
      }
    }
  }

  const dayOfMonth = primeira ? diaDe(primeira) : 5;
  // A descrição do carnê costuma vir com o número da parcela ("Aluguel —
  // parcela 3/12"). Numa recorrência isso engana: o nome vale para todos os
  // meses, então o sufixo sai.
  const semParcela = (s: string) =>
    s
      .replace(/[-–—·|,;:\s]*\(?\s*parcela\s*\d+\s*(\/|de)\s*\d+\s*\)?\s*$/i, "")
      .replace(/[-–—·|,;:\s]*\d+\s*\/\s*\d+\s*$/, "")
      .trim();
  const nome = semParcela((parcelas.find((p) => p.descricao)?.descricao || "").trim());
  const cedente = (lidos.find((b) => b.cedente)?.cedente || "").trim();
  const description = nome || cedente || "Conta recorrente";

  if (comData.length > 1) {
    avisos.push(
      `${comData.length} parcelas encontradas, de ${primeira?.split("-").reverse().join("/")} a ${ultima?.split("-").reverse().join("/")} — a recorrência já vem com data de término.`,
    );
  }

  const anticipateToBusinessDay = pareceGuiaDeImposto(`${description} ${cedente}`);
  if (anticipateToBusinessDay) {
    avisos.push("Parece guia de imposto: marquei para antecipar o vencimento quando cair em fim de semana ou feriado.");
  }

  return {
    ok: true,
    parcelas,
    avisos,
    proposta: {
      description,
      amount,
      supplierName: cedente,
      periodicidade,
      dayOfMonth,
      intervalDays,
      anticipateToBusinessDay,
      startDate: primeira ?? new Date().toISOString().slice(0, 10),
      endDate: ultima,
      notes: `Importado de ${file.name || "documento anexado"} em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`,
    },
  };
}
