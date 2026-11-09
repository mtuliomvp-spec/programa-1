"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { structuralCenterId } from "@/lib/structural";
import { parseDateInput } from "@/lib/format";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen } from "@/lib/cashbox";
import { assertCan } from "@/lib/guards";

const employeeSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  role: z.string().optional(),
  cpf: z.string().optional(),
  pixKey: z.string().optional(),
  salary: z.coerce.number().min(0, "Informe o salário"),
  admissionDate: z.string().min(1),
  notes: z.string().optional(),
  // Usuário do sistema que é este funcionário ("" = nenhum).
  userId: z.string().optional(),
});

/** Confere o usuário escolhido: existe e ainda não é de outro funcionário. */
async function usuarioParaVincular(userId: string | undefined, employeeId?: string): Promise<string | null> {
  const id = userId?.trim();
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, employee: { select: { id: true, name: true } } } });
  if (!u) throw new Error("Usuário não encontrado.");
  if (u.employee && u.employee.id !== employeeId) {
    throw new Error(`Este usuário já está ligado ao funcionário ${u.employee.name}.`);
  }
  return u.id;
}

export type FolhaFormState = { error?: string };

export async function createEmployeeAction(
  _prev: FolhaFormState,
  formData: FormData,
): Promise<FolhaFormState> {
  try {
    await assertCan("administrativo", "folha");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const parsed = employeeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  let userId: string | null;
  try {
    userId = await usuarioParaVincular(parsed.data.userId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const criado = await prisma.employee.create({
    data: {
      userId,
      name: parsed.data.name,
      role: parsed.data.role || null,
      cpf: parsed.data.cpf || null,
      pixKey: parsed.data.pixKey || null,
      salary: parsed.data.salary,
      admissionDate: parseDateInput(parsed.data.admissionDate),
      notes: parsed.data.notes || null,
    },
  });
  revalidatePath("/folha");
  // Vai para a ficha: é lá que se lançam as férias já tiradas e as próximas.
  redirect(`/folha/${criado.id}`);
}

export async function toggleEmployeeAction(id: string, active: boolean) {
  await assertCan("administrativo", "folha");
  await prisma.employee.update({
    where: { id },
    data: { active, dismissalDate: active ? null : new Date() },
  });
  revalidatePath("/folha");
}

/** Gera a folha do mês corrente: uma conta a pagar por funcionário ativo,
 * com vencimento no dia 5 do mês seguinte. Idempotente por competência. */
export async function generatePayrollAction(): Promise<{ created: number }> {
  await assertCan("administrativo", "folha");
  await assertBooksBalanced();
  await assertCashboxOpen();
  const now = new Date();
  const competencia = `${String(now.getUTCMonth() + 1).padStart(2, "0")}/${now.getUTCFullYear()}`;
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 5, 12));

  const employees = await prisma.employee.findMany({ where: { active: true } });
  let created = 0;
  // Férias que caem neste mês: o salário do mês muda (os dias de férias já
  // foram pagos no recibo) — o título leva o aviso para conferir.
  const inicioMes = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0));
  const fimMes = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59));
  const feriasDoMes = await prisma.employeeVacation.findMany({
    where: { gozoInicio: { lte: fimMes }, gozoFim: { gte: inicioMes } },
    select: { employeeId: true, gozoInicio: true, gozoFim: true },
  });

  const adminCenterId = await structuralCenterId("ADMINISTRATIVO");
  for (const employee of employees) {
    if (employee.salary <= 0) continue;
    const description = `Salário ${employee.name} - ${competencia}`;
    const existing = await prisma.payable.findFirst({
      where: { employeeId: employee.id, description },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.payable.create({
      data: {
        description,
        category: "SALARIO",
        amount: employee.salary,
        dueDate,
        status: "PENDENTE",
        employeeId: employee.id,
        notes:
          [
            employee.pixKey ? `PIX: ${employee.pixKey}` : null,
            ...feriasDoMes
              .filter((f) => f.employeeId === employee.id)
              .map(
                (f) =>
                  `Férias de ${formatarDia(f.gozoInicio)} a ${formatarDia(f.gozoFim)} neste mês (pagas no recibo de férias): ` +
                  "confira o salário do mês com a contabilidade.",
              ),
          ]
            .filter(Boolean)
            .join(" ") || null,
        costCenterId: adminCenterId,
      },
    });
    created++;
  }

  revalidatePath("/folha");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/");
  return { created };
}

// ---------------------------------------------------------------------------
// Ficha do funcionário: edição, férias e rescisão
// ---------------------------------------------------------------------------

export async function updateEmployeeAction(
  _prev: FolhaFormState,
  formData: FormData,
): Promise<FolhaFormState & { ok?: string }> {
  try {
    await assertCan("administrativo", "folha");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const id = String(formData.get("id") || "");
  const parsed = employeeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!id || !parsed.success) return { error: parsed.error?.issues[0]?.message || "Dados inválidos." };
  let userId: string | null;
  try {
    userId = await usuarioParaVincular(parsed.data.userId, id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await prisma.employee.update({
    where: { id },
    data: {
      userId,
      name: parsed.data.name,
      role: parsed.data.role || null,
      cpf: parsed.data.cpf || null,
      pixKey: parsed.data.pixKey || null,
      salary: parsed.data.salary,
      admissionDate: parseDateInput(parsed.data.admissionDate),
      notes: parsed.data.notes || null,
    },
  });
  revalidatePath("/folha");
  revalidatePath(`/folha/${id}`);
  return { ok: "Dados salvos." };
}

const MAX_ARQUIVO = 8 * 1024 * 1024;

/** Arquivo opcional do formulário (recibo/TRCT): nome, tipo e bytes. */
async function arquivoDoForm(formData: FormData, campo: string) {
  const f = formData.get(campo);
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_ARQUIVO) throw new Error("Arquivo grande demais (máximo 8 MB).");
  return { nome: f.name || "documento", mime: f.type || "application/pdf", dados: Buffer.from(await f.arrayBuffer()) };
}

export type LeituraTrabalhista =
  | { ok: true; dados: import("@/lib/trabalhista-ai").DocumentoTrabalhista }
  | { ok: false; erro: string };

/** Lê o recibo de férias ou o TRCT por IA para preencher o formulário. */
export async function lerDocumentoTrabalhistaAction(formData: FormData): Promise<LeituraTrabalhista> {
  try {
    await assertCan("administrativo", "folha");
    const arq = await arquivoDoForm(formData, "arquivo");
    if (!arq) return { ok: false, erro: "Escolha o arquivo do recibo." };
    const { lerDocumentoTrabalhista } = await import("@/lib/trabalhista-ai");
    return { ok: true, dados: await lerDocumentoTrabalhista(arq.dados.toString("base64"), arq.mime) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível ler o arquivo." };
  }
}

const num = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").trim();
  if (!t) return 0;
  // Aceita "2.190,18" e "2190.18".
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Registra férias: período aquisitivo, gozo e valores do recibo. Com "gerar
 * conta", o líquido vira conta a pagar (categoria Salário, rótulo Férias) com
 * vencimento 2 dias antes do gozo, já com o recibo anexado.
 */
export async function registrarFeriasAction(
  _prev: FolhaFormState & { ok?: string },
  formData: FormData,
): Promise<FolhaFormState & { ok?: string }> {
  try {
    await assertCan("administrativo", "folha");
    const { fimDoGozo, pagamentoDasFerias, somaDias, somaAnos } = await import("@/lib/ferias");
    const employeeId = String(formData.get("employeeId") || "");
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return { error: "Funcionário não encontrado." };

    const aquisitivo = String(formData.get("aquisitivoInicio") || "");
    const gozo = String(formData.get("gozoInicio") || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(aquisitivo)) return { error: "Escolha o período aquisitivo." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gozo)) return { error: "Informe o início do gozo." };
    const dias = Math.round(num(formData.get("dias")));
    const abonoDias = Math.round(num(formData.get("abonoDias")));
    if (!(dias >= 5 && dias <= 30)) return { error: "Dias de gozo: de 5 a 30 (a CLT não permite período menor que 5 dias)." };
    if (!(abonoDias >= 0 && abonoDias <= 10)) return { error: "Abono pecuniário: de 0 a 10 dias (até 1/3 das férias)." };
    if (dias + abonoDias > 30) return { error: "Gozo + abono passam de 30 dias." };
    const valorBruto = num(formData.get("valorBruto"));
    const descontos = num(formData.get("descontos"));
    const valorLiquido = num(formData.get("valorLiquido"));
    if ([valorBruto, descontos, valorLiquido].some((v) => Number.isNaN(v) || v < 0)) return { error: "Valores inválidos." };
    const gerarConta = formData.get("gerarConta") === "on";
    if (gerarConta && valorLiquido <= 0) return { error: "Informe o valor líquido para gerar a conta a pagar." };

    const aquisitivoInicio = parseDateInput(aquisitivo);
    const aquisitivoFim = somaDias(somaAnos(aquisitivoInicio, 1), -1);
    const gozoInicio = parseDateInput(gozo);
    if (gozoInicio <= aquisitivoFim) return { error: "O gozo só pode começar depois do fim do período aquisitivo." };
    const gozoFim = fimDoGozo(gozoInicio, dias);
    const pagamentoAte = pagamentoDasFerias(gozoInicio);

    // Sem sobrepor outras férias do mesmo funcionário.
    const conflito = await prisma.employeeVacation.findFirst({
      where: { employeeId, gozoInicio: { lte: gozoFim }, gozoFim: { gte: gozoInicio } },
    });
    if (conflito) return { error: "Já existem férias lançadas que se sobrepõem a esse período de gozo." };

    const recibo = await arquivoDoForm(formData, "arquivo");
    if (gerarConta) await assertBooksBalanced();

    const periodoTxt = `${formatarDia(gozoInicio)} a ${formatarDia(gozoFim)}`;
    await prisma.$transaction(async (tx) => {
      let payableId: string | null = null;
      if (gerarConta) {
        const adminCenterId = await structuralCenterId("ADMINISTRATIVO");
        const conta = await tx.payable.create({
          data: {
            description: `Férias ${employee.name} - ${periodoTxt}`,
            category: "SALARIO",
            categoryLabel: "Férias",
            amount: valorLiquido,
            dueDate: pagamentoAte,
            status: "PENDENTE",
            employeeId,
            costCenterId: adminCenterId,
            notes:
              `Férias de ${periodoTxt} (${dias} dias${abonoDias ? ` + ${abonoDias} de abono` : ""}). ` +
              `Bruto ${brl(valorBruto)}, descontos ${brl(descontos)}. Pagar até 2 dias antes do gozo (art. 145 da CLT).` +
              (employee.pixKey ? ` PIX: ${employee.pixKey}` : ""),
          },
        });
        payableId = conta.id;
        if (recibo) {
          await tx.payableAttachment.create({
            data: {
              payableId: conta.id,
              kind: "OUTRO",
              description: "Recibo de férias",
              filename: recibo.nome,
              mimeType: recibo.mime,
              size: recibo.dados.length,
              data: recibo.dados,
            },
          });
        }
      }
      await tx.employeeVacation.create({
        data: {
          employeeId,
          aquisitivoInicio,
          aquisitivoFim,
          gozoInicio,
          gozoFim,
          dias,
          abonoDias,
          valorBruto,
          descontos,
          valorLiquido,
          pagamentoAte,
          payableId,
          reciboNome: recibo?.nome ?? null,
          reciboMime: recibo?.mime ?? null,
          reciboDados: recibo?.dados ?? null,
          notes: String(formData.get("notes") || "").trim() || null,
        },
      });
    });
    revalidarFolha(employeeId);
    return {
      ok: gerarConta
        ? `Férias lançadas. Conta a pagar de ${brl(valorLiquido)} com vencimento em ${formatarDia(pagamentoAte)}.`
        : "Férias lançadas.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível lançar as férias." };
  }
}

/** Exclui férias lançadas; a conta a pagar sai junto, se ainda não foi paga. */
export async function excluirFeriasAction(id: string): Promise<{ error?: string }> {
  try {
    await assertCan("administrativo", "folha");
    const f = await prisma.employeeVacation.findUnique({ where: { id } });
    if (!f) return { error: "Férias não encontradas." };
    await removerContas([f.payableId]);
    await prisma.employeeVacation.delete({ where: { id } });
    revalidarFolha(f.employeeId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível excluir." };
  }
}

/**
 * Registra a rescisão: desliga o funcionário e, com "gerar contas", lança o
 * líquido (vencimento em 10 dias do término) e a multa do FGTS a pagar.
 */
export async function registrarRescisaoAction(
  _prev: FolhaFormState & { ok?: string },
  formData: FormData,
): Promise<FolhaFormState & { ok?: string }> {
  try {
    await assertCan("administrativo", "folha");
    const { pagamentoDaRescisao, ROTULO_TIPO_RESCISAO } = await import("@/lib/ferias");
    const employeeId = String(formData.get("employeeId") || "");
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return { error: "Funcionário não encontrado." };
    const tipo = String(formData.get("tipo") || "");
    if (!(tipo in ROTULO_TIPO_RESCISAO)) return { error: "Escolha o tipo de rescisão." };
    const aviso = String(formData.get("avisoPrevio") || "NAO_SE_APLICA");
    if (!["TRABALHADO", "INDENIZADO", "DISPENSADO", "NAO_SE_APLICA"].includes(aviso)) return { error: "Aviso prévio inválido." };
    const deslig = String(formData.get("dataDesligamento") || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deslig)) return { error: "Informe a data do desligamento." };
    const dataDesligamento = parseDateInput(deslig);
    if (dataDesligamento < employee.admissionDate) return { error: "O desligamento não pode ser antes da admissão." };
    const avisoTxt = String(formData.get("dataAviso") || "");
    const dataAviso = /^\d{4}-\d{2}-\d{2}$/.test(avisoTxt) ? parseDateInput(avisoTxt) : null;
    const valorLiquido = num(formData.get("valorLiquido"));
    const multaFgts = num(formData.get("multaFgts"));
    if ([valorLiquido, multaFgts].some((v) => Number.isNaN(v) || v < 0)) return { error: "Valores inválidos." };
    const gerarContas = formData.get("gerarContas") === "on";
    if (gerarContas && valorLiquido <= 0) return { error: "Informe o líquido da rescisão para gerar a conta a pagar." };
    if (await prisma.employeeTermination.findFirst({ where: { employeeId } })) {
      return { error: "Este funcionário já tem rescisão lançada." };
    }

    const pagamentoAte = pagamentoDaRescisao(dataDesligamento);
    const arquivo = await arquivoDoForm(formData, "arquivo");
    if (gerarContas) await assertBooksBalanced();
    const rotulo = ROTULO_TIPO_RESCISAO[tipo as keyof typeof ROTULO_TIPO_RESCISAO];

    await prisma.$transaction(async (tx) => {
      let payableId: string | null = null;
      let multaPayableId: string | null = null;
      if (gerarContas) {
        const adminCenterId = await structuralCenterId("ADMINISTRATIVO");
        const conta = await tx.payable.create({
          data: {
            description: `Rescisão ${employee.name} - ${formatarDia(dataDesligamento)}`,
            category: "SALARIO",
            categoryLabel: "Rescisão",
            amount: valorLiquido,
            dueDate: pagamentoAte,
            status: "PENDENTE",
            employeeId,
            costCenterId: adminCenterId,
            notes:
              `${rotulo}. Verbas rescisórias: pagar em até 10 dias do término (art. 477, § 6º, da CLT).` +
              (employee.pixKey ? ` PIX: ${employee.pixKey}` : ""),
          },
        });
        payableId = conta.id;
        if (arquivo) {
          await tx.payableAttachment.create({
            data: {
              payableId: conta.id,
              kind: "OUTRO",
              description: "Termo de rescisão (TRCT)",
              filename: arquivo.nome,
              mimeType: arquivo.mime,
              size: arquivo.dados.length,
              data: arquivo.dados,
            },
          });
        }
        if (multaFgts > 0) {
          const multa = await tx.payable.create({
            data: {
              description: `Multa rescisória FGTS ${employee.name}`,
              category: "SALARIO",
              categoryLabel: "Multa FGTS (GRRF)",
              amount: multaFgts,
              dueDate: pagamentoAte,
              status: "PENDENTE",
              employeeId,
              costCenterId: adminCenterId,
              notes: "Multa rescisória do FGTS, recolhida pela guia emitida pela contabilidade.",
            },
          });
          multaPayableId = multa.id;
        }
      }
      await tx.employeeTermination.create({
        data: {
          employeeId,
          tipo,
          avisoPrevio: aviso,
          dataAviso,
          dataDesligamento,
          pagamentoAte,
          valorLiquido,
          multaFgts,
          payableId,
          multaPayableId,
          arquivoNome: arquivo?.nome ?? null,
          arquivoMime: arquivo?.mime ?? null,
          arquivoDados: arquivo?.dados ?? null,
          notes: String(formData.get("notes") || "").trim() || null,
        },
      });
      await tx.employee.update({ where: { id: employeeId }, data: { active: false, dismissalDate: dataDesligamento } });
    });
    revalidarFolha(employeeId);
    return {
      ok: gerarContas
        ? `Rescisão lançada e funcionário desligado. Pagamento até ${formatarDia(pagamentoAte)}.`
        : "Rescisão lançada e funcionário desligado.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível lançar a rescisão." };
  }
}

/** Desfaz a rescisão: apaga as contas não pagas e reativa o funcionário. */
export async function excluirRescisaoAction(id: string): Promise<{ error?: string }> {
  try {
    await assertCan("administrativo", "folha");
    const r = await prisma.employeeTermination.findUnique({ where: { id } });
    if (!r) return { error: "Rescisão não encontrada." };
    await removerContas([r.payableId, r.multaPayableId]);
    await prisma.$transaction([
      prisma.employeeTermination.delete({ where: { id } }),
      prisma.employee.update({ where: { id: r.employeeId }, data: { active: true, dismissalDate: null } }),
    ]);
    revalidarFolha(r.employeeId);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível desfazer a rescisão." };
  }
}

/** Contas geradas pela ficha: só saem se nenhuma foi paga. */
async function removerContas(ids: (string | null)[]) {
  const lista = ids.filter((x): x is string => !!x);
  if (!lista.length) return;
  const contas = await prisma.payable.findMany({ where: { id: { in: lista } }, select: { id: true, status: true } });
  if (contas.some((c) => c.status === "PAGO")) {
    throw new Error("A conta a pagar já foi baixada. Estorne o pagamento em Contas a pagar antes de excluir.");
  }
  await prisma.payable.deleteMany({ where: { id: { in: contas.map((c) => c.id) } } });
}

function formatarDia(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function revalidarFolha(employeeId: string) {
  revalidatePath("/folha");
  revalidatePath(`/folha/${employeeId}`);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/pendencias");
  revalidatePath("/");
}
