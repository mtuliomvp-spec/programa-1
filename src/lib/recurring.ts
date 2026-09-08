import { prisma } from "@/lib/prisma";
import { timed } from "@/lib/perf";
import { structuralCenterId } from "@/lib/structural";
import { previousBusinessDay } from "@/lib/business-days";
import { competenciaMaisMeses } from "@/lib/competencia";

/**
 * Geração idempotente dos lançamentos recorrentes do mês corrente.
 *
 * Chamada ao abrir as telas do financeiro: para cada recorrência ativa,
 * cria a conta a pagar/receber do mês se ainda não existir (a checagem é
 * pelo vínculo recurringId + vencimento dentro do mês). Assim não há
 * necessidade de job agendado e nada é gerado em duplicidade.
 */

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * IDENTIDADE da ocorrência, gravada no título gerado: o mês no modo mensal
 * ("2026-09") e o dia no "a cada N dias" ("2026-09-15"). É por ela que a
 * geração sabe que já criou esta parcela — não pela data de vencimento.
 *
 * Essa distinção é o que solta o vencimento: conta de consumo não chega sempre
 * no dia combinado (a luz de agosto veio para 31/08 em vez de 01/09), e
 * corrigir a data do título não pode fazer a parcela nascer de novo. Pelo mesmo
 * motivo, mudar o dia da recorrência não cria um segundo título do mesmo mês.
 */
export function occurrenceKey(nominalDue: Date, monthly: boolean): string {
  return monthly ? nominalDue.toISOString().slice(0, 7) : dayKey(nominalDue);
}

/**
 * Competência de uma guia: o mês ANTERIOR ao do vencimento nominal (venceu em
 * 20/06/2026 → competência 05/2026). Usada para preencher o marcador
 * {competencia} na descrição da recorrência quando a recorrência não tem uma
 * primeira competência declarada.
 */
export function competenciaLabel(nominalDue: Date): string {
  const prev = new Date(Date.UTC(nominalDue.getUTCFullYear(), nominalDue.getUTCMonth() - 1, 1));
  return `${String(prev.getUTCMonth() + 1).padStart(2, "0")}/${prev.getUTCFullYear()}`;
}

/**
 * Substitui {competencia} (com ou sem acento) na descrição do título gerado.
 * Com uma competência declarada na recorrência, é ela que vale — o "mês
 * anterior ao vencimento" é só o palpite de quem não declarou.
 */
export function applyCompetencia(
  description: string,
  nominalDue: Date,
  referencia?: string | null,
): string {
  return description.replace(/\{compet[êe]ncia\}/gi, referencia || competenciaLabel(nominalDue));
}

/** Vencimento de um dia do mês num (ano, mês) dado — meio-dia UTC. */
function monthDue(year: number, month: number, dayOfMonth: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return new Date(Date.UTC(year, month, day, 12));
}

/**
 * Vencimentos mensais a garantir: do mês da data de início (`startDate`) até o
 * mês seguinte ao horizonte (para já pré-gerar a próxima ocorrência). Assim a
 * PRIMEIRA parcela cai no mês do início — antes só entravam o mês corrente e o
 * próximo, então uma recorrência gerada num mês posterior ao início perdia a
 * primeira ocorrência. Um teto (`CAP`) evita geração em massa por um `startDate`
 * muito antigo. O chamador ainda filtra por startDate/endDate/horizonte e o
 * dedup por dia impede duplicatas — só os meses realmente faltantes são criados.
 */
function monthlyDueDates(dayOfMonth: number, startDate: Date, horizon: Date): Date[] {
  const CAP = 18; // no máximo 18 meses "para trás" a partir do horizonte
  const startIdx = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth();
  const endIdx = horizon.getUTCFullYear() * 12 + horizon.getUTCMonth() + 1; // inclui o próximo mês
  const fromIdx = Math.max(startIdx, endIdx - CAP + 1);
  const out: Date[] = [];
  for (let idx = fromIdx; idx <= endIdx; idx++) {
    out.push(monthDue(Math.floor(idx / 12), idx % 12, dayOfMonth));
  }
  return out;
}

/** Vencimentos "a cada N dias" desde startDate até o horizonte (com teto). */
function intervalDueDates(startDate: Date, everyDays: number, endDate: Date | null, horizon: Date): Date[] {
  const CAP = 120; // nunca gera em massa, mesmo com startDate muito antigo
  const step = Math.max(1, Math.round(everyDays));
  const out: Date[] = [];
  // Âncora no meio-dia UTC do dia de início.
  let due = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), 12));
  while (due <= horizon && (!endDate || due <= endDate) && out.length < CAP) {
    out.push(new Date(due));
    due = new Date(due.getTime() + step * 24 * 60 * 60 * 1000);
  }
  return out;
}

/** Gera as parcelas mensais dos consórcios ativos até o mês corrente
 * (com recuperação de meses passados), numeradas e sem duplicidade. */
export async function ensureConsortiumInstallments(): Promise<number> {
  const now = new Date();
  const consortiums = await prisma.consortium.findMany({
    where: { status: "ATIVO" },
    include: { payables: { select: { id: true } } },
  });

  let created = 0;
  for (const consortium of consortiums) {
    const existing = consortium.payables.length;
    const start = consortium.startDate;
    const monthsElapsed =
      (now.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - start.getUTCMonth());
    const target = Math.min(consortium.installmentsCount, Math.max(0, monthsElapsed) + 1);

    for (let i = existing; i < target; i++) {
      const year = start.getUTCFullYear();
      const month = start.getUTCMonth() + i;
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const dueDate = new Date(Date.UTC(year, month, Math.min(consortium.dueDay, lastDay), 12));
      await prisma.payable.create({
        data: {
          costCenterId: await structuralCenterId("ADMINISTRATIVO"),
          description: `${consortium.name} - Parcela ${i + 1}/${consortium.installmentsCount}`,
          category: "OUTROS",
          amount: consortium.installmentValue,
          dueDate,
          status: "PENDENTE",
          consortiumId: consortium.id,
          notes: consortium.administrator ? `Administradora: ${consortium.administrator}` : null,
        },
      });
      created++;
    }
  }
  return created;
}

const isStructuralKey = (v: string | null): v is "VEICULOS" | "ADMINISTRATIVO" | "CAPITAL" =>
  v === "VEICULOS" || v === "ADMINISTRATIVO" || v === "CAPITAL";

/**
 * Versão para as TELAS: só roda de fato uma vez a cada minuto.
 *
 * A geração roda ao abrir Contas a pagar/a receber como rede de segurança, mas
 * quem cria ou edita uma recorrência já chama a geração na hora — repetir a
 * varredura a cada troca de tela só deixava a navegação lenta. Ações continuam
 * usando `ensureRecurringGenerated` direto (sem represa).
 */
let lastGenerationAt = 0;
const GENERATION_THROTTLE_MS = 60_000;

export async function ensureRecurringGeneratedForPage(): Promise<number> {
  const now = Date.now();
  if (now - lastGenerationAt < GENERATION_THROTTLE_MS) return 0;
  lastGenerationAt = now;
  const created = await ensureRecurringGenerated();
  await ensureConsortiumInstallments();
  return created;
}

/**
 * Gera os títulos recorrentes que vencem até `leadDays` dias à frente (padrão 15
 * — "gera 15 dias antes do vencimento"), sem duplicar. O botão "Gerar agora" usa
 * uma antecedência maior para puxar a próxima ocorrência na hora.
 */
export async function ensureRecurringGenerated(leadDays = 15): Promise<number> {
  return timed("gerar títulos recorrentes", () => recurringGenerated(leadDays));
}

async function recurringGenerated(leadDays: number): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Horizonte: fim do dia (hoje + leadDays). Gera tudo que vence até aqui.
  const horizon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + leadDays, 23, 59));

  // Traz todos os vencimentos já gerados de cada recorrência (para não duplicar
  // tanto no modo mensal quanto no "a cada N dias").
  const entries = await prisma.recurringEntry.findMany({
    where: {
      active: true,
      startDate: { lte: horizon },
      OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
    },
    include: {
      payables: { select: { dueDate: true, recurringPeriod: true } },
      receivables: { select: { dueDate: true, recurringPeriod: true } },
    },
  });

  let created = 0;
  for (const entry of entries) {
    const center = await structuralCenterId(
      isStructuralKey(entry.structuralKey) ? entry.structuralKey : "ADMINISTRATIVO",
    );
    const monthly = !(entry.intervalDays && entry.intervalDays > 0);
    // "Esta parcela já existe?" — a resposta vem da OCORRÊNCIA gravada no
    // título. A data de vencimento entra junto só como rede para os títulos
    // antigos, gerados antes de a ocorrência existir (a migração preencheu os
    // que dava, mas um vencimento antecipado para o último dia útil pode ter
    // caído no mês anterior).
    const existingDays = new Set<string>();
    for (const t of [...entry.payables, ...entry.receivables]) {
      existingDays.add(dayKey(t.dueDate));
      if (t.recurringPeriod) existingDays.add(t.recurringPeriod);
    }
    // Ocorrências excluídas pelo usuário: contam como "já existentes" para a
    // geração não recriar o título apagado.
    for (const d of entry.skippedDays) existingDays.add(d);

    // Datas de vencimento candidatas: mensal (mês corrente + próximo) ou por
    // intervalo. Só entram as que vencem até o horizonte e a partir do início.
    const candidates = monthly
      ? monthlyDueDates(entry.dayOfMonth, entry.startDate, horizon)
      : intervalDueDates(entry.startDate, entry.intervalDays!, entry.endDate, horizon);
    const startAnchor = new Date(
      Date.UTC(entry.startDate.getUTCFullYear(), entry.startDate.getUTCMonth(), entry.startDate.getUTCDate(), 0, 0),
    );
    // Cada candidato guarda a data NOMINAL (dia configurado — define mês de
    // competência e dedupe lógico) e a data EFETIVA de vencimento (antecipada
    // para o último dia útil quando a recorrência pede — padrão das guias).
    const dueDates = candidates
      .filter((d) => d <= horizon && d >= startAnchor && (!entry.endDate || d <= entry.endDate))
      .map((nominal) => ({
        nominal,
        due: entry.anticipateToBusinessDay ? previousBusinessDay(nominal) : nominal,
      }));

    // Fluxo Capital: o título carrega o sócio e, quando for baixado, lança o
    // aporte/retirada dele (sync na baixa). Categoria = OUTROS (capital não é
    // despesa/receita). Sem sócio definido, cai para o comportamento comum.
    const isCapital = entry.structuralKey === "CAPITAL" && !!entry.capitalBeneficiaryId;
    const capitalBeneficiaryId = isCapital ? entry.capitalBeneficiaryId : null;

    // Mês da PRIMEIRA ocorrência: é a partir dele que a competência declarada
    // na recorrência anda mês a mês (1ª = 08/2026 → 2ª = 09/2026...). Sai do
    // início da recorrência, e não do primeiro candidato desta rodada, senão a
    // competência escorregaria conforme o mês em que a geração roda. Começando
    // em 15/07 com vencimento no dia 1, a primeira ocorrência é 01/08 — a data
    // de início não chega a ter uma.
    const primeiraOcorrencia = monthly
      ? (() => {
          const mesDoInicio = monthDue(
            entry.startDate.getUTCFullYear(),
            entry.startDate.getUTCMonth(),
            entry.dayOfMonth,
          );
          return mesDoInicio >= startAnchor
            ? mesDoInicio
            : monthDue(
                entry.startDate.getUTCFullYear(),
                entry.startDate.getUTCMonth() + 1,
                entry.dayOfMonth,
              );
        })()
      : entry.startDate;
    const primeiroMesIdx =
      primeiraOcorrencia.getUTCFullYear() * 12 + primeiraOcorrencia.getUTCMonth();

    for (const { nominal, due: dueDate } of dueDates) {
      const periodo = occurrenceKey(nominal, monthly);
      // Dedupe pela ocorrência e, para os títulos antigos, pelas duas datas: a
      // efetiva (como o título foi gravado) e a nominal.
      if (
        existingDays.has(periodo) ||
        existingDays.has(dayKey(dueDate)) ||
        existingDays.has(dayKey(nominal))
      ) {
        continue;
      }
      const mesesDesdeOInicio =
        nominal.getUTCFullYear() * 12 + nominal.getUTCMonth() - primeiroMesIdx;
      // Competência só faz sentido mês a mês: numa recorrência "a cada N dias"
      // duas parcelas caem no mesmo mês e receberiam a mesma competência.
      const referencePeriod = monthly
        ? competenciaMaisMeses(entry.firstReference, mesesDesdeOInicio)
        : null;
      const description = applyCompetencia(entry.description, nominal, referencePeriod);
      if (entry.kind === "PAGAR") {
        await prisma.payable.create({
          data: {
            costCenterId: center,
            description,
            category: isCapital ? "OUTROS" : entry.categoryPagar ?? "DESPESA_OPERACIONAL",
            categoryLabel: isCapital ? null : entry.categoryLabel,
            amount: entry.amount,
            dueDate,
            status: "PENDENTE",
            supplierId: entry.supplierId,
            capitalBeneficiaryId,
            recurringId: entry.id,
            recurringPeriod: periodo,
            referencePeriod,
            // Fatura de cartão: o título nasce detalhável (lançamentos dentro).
            cardInvoice: entry.cardInvoice,
            notes: entry.notes,
          },
        });
      } else {
        await prisma.receivable.create({
          data: {
            costCenterId: center,
            description,
            category: isCapital ? "OUTROS" : entry.categoryReceber ?? "OUTROS",
            categoryLabel: isCapital ? null : entry.categoryLabel,
            amount: entry.amount,
            dueDate,
            status: "PENDENTE",
            customerId: entry.customerId,
            capitalBeneficiaryId,
            recurringId: entry.id,
            recurringPeriod: periodo,
            referencePeriod,
            notes: entry.notes,
          },
        });
      }
      existingDays.add(periodo);
      existingDays.add(dayKey(dueDate));
      existingDays.add(dayKey(nominal));
      created++;
    }
  }
  return created;
}
