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

/** Liga/desliga o salário pela folha (desligado = só comissão). */
export async function setRecebeSalarioAction(id: string, recebeSalario: boolean) {
  await assertCan("administrativo", "folha");
  await prisma.employee.update({ where: { id }, data: { recebeSalario } });
  revalidatePath("/folha");
  revalidatePath(`/folha/${id}`);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Avisos de férias que caem no mês da competência (o salário do mês muda). */
async function avisosDeFerias(competencia: string, employeeId: string): Promise<string[]> {
  const [mes, ano] = competencia.split("/").map(Number);
  const inicioMes = new Date(Date.UTC(ano, mes - 1, 1, 0));
  const fimMes = new Date(Date.UTC(ano, mes, 0, 23, 59));
  const ferias = await prisma.employeeVacation.findMany({
    where: { employeeId, gozoInicio: { lte: fimMes }, gozoFim: { gte: inicioMes } },
    select: { gozoInicio: true, gozoFim: true },
  });
  return ferias.map(
    (f) =>
      `Férias de ${formatarDia(f.gozoInicio)} a ${formatarDia(f.gozoFim)} neste mês (pagas no recibo de férias): ` +
      "confira o salário do mês com a contabilidade.",
  );
}

/** Cria o título de salário da competência (valor = salário do cadastro até chegar o holerite). */
async function criarTituloDeSalario(
  employee: { id: string; name: string; salary: number; pixKey: string | null },
  competencia: string,
  amount: number,
  linhaHolerite?: string,
) {
  const { descricaoDoSalario, vencimentoDoSalario } = await import("@/lib/folha");
  const adminCenterId = await structuralCenterId("ADMINISTRATIVO");
  const notas = [
    employee.pixKey ? `PIX: ${employee.pixKey}` : null,
    linhaHolerite ?? null,
    ...(await avisosDeFerias(competencia, employee.id)),
  ].filter(Boolean);
  return prisma.payable.create({
    data: {
      description: descricaoDoSalario(employee.name, competencia),
      category: "SALARIO",
      amount: r2(amount),
      dueDate: vencimentoDoSalario(competencia),
      status: "PENDENTE",
      employeeId: employee.id,
      referencePeriod: competencia,
      notes: notas.join("\n") || null,
      costCenterId: adminCenterId,
    },
    select: { id: true },
  });
}

/**
 * Gera a folha da competência (padrão: mês corrente): um título por
 * funcionário ativo que RECEBE SALÁRIO pela folha, vencendo no dia 5 do mês
 * seguinte. Idempotente: quem já tem o salário da competência fica como está.
 */
export async function generatePayrollAction(competencia?: string): Promise<{ created: number; error?: string }> {
  try {
    await assertCan("administrativo", "folha");
    await assertBooksBalanced();
    await assertCashboxOpen();
    const { competenciaDe, competenciaValida, salariosDaCompetencia } = await import("@/lib/folha");
    const comp = competenciaValida(competencia) ? competencia : competenciaDe(new Date());
    const [mes, ano] = comp.split("/").map(Number);
    const fimMes = new Date(Date.UTC(ano, mes, 0, 23, 59));

    const [employees, existentes] = await Promise.all([
      prisma.employee.findMany({ where: { active: true, recebeSalario: true, admissionDate: { lte: fimMes } } }),
      salariosDaCompetencia(comp),
    ]);
    let created = 0;
    for (const employee of employees) {
      if (employee.salary <= 0 || existentes.has(employee.id)) continue;
      await criarTituloDeSalario(employee, comp, employee.salary);
      created++;
    }
    revalidatePath("/folha");
    revalidatePath("/financeiro/a-pagar");
    revalidatePath("/");
    return { created };
  } catch (e) {
    return { created: 0, error: e instanceof Error ? e.message : "Não foi possível gerar a folha." };
  }
}

/** Linha das observações do título com o resumo do holerite. */
function linhaDoHolerite(
  competencia: string,
  h: { totalVencimentos?: number | null; totalDescontos?: number | null; liquido: number },
): string {
  return (
    `Holerite ${competencia}: ` +
    [
      h.totalVencimentos ? `vencimentos ${brl(h.totalVencimentos)}` : null,
      h.totalDescontos ? `descontos ${brl(h.totalDescontos)}` : null,
      `líquido ${brl(h.liquido)}`,
    ]
      .filter(Boolean)
      .join(", ") +
    "."
  );
}

/**
 * Põe o LÍQUIDO do holerite no salário da competência. Os vales já tirados
 * (partes do título) continuam valendo: o saldo a pagar vira líquido − vales.
 * Cria o título se a folha do mês ainda não foi gerada.
 */
async function aplicarLiquido(
  employeeId: string,
  competencia: string,
  h: { totalVencimentos?: number | null; totalDescontos?: number | null; liquido: number },
  arquivo?: Awaited<ReturnType<typeof arquivoDoForm>>,
): Promise<{ texto: string; alerta: boolean }> {
  const { salariosDaCompetencia } = await import("@/lib/folha");
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, salary: true, pixKey: true },
  });
  if (!employee) throw new Error("Funcionário não encontrado.");
  const liquido = r2(h.liquido);
  if (!(liquido > 0)) throw new Error("Informe o valor líquido do holerite.");
  const linha = linhaDoHolerite(competencia, h);

  const atual = (await salariosDaCompetencia(competencia)).get(employeeId);
  let payableId: string;
  let resumo: string;
  let alerta = false;
  if (!atual) {
    // Título novo: mesmas travas do "Gerar folha". Ajustar o valor de um título
    // que já existe é edição (como no Contas a pagar) e não passa por elas.
    await assertBooksBalanced();
    await assertCashboxOpen();
    payableId = (await criarTituloDeSalario(employee, competencia, liquido, linha)).id;
    resumo = `${employee.name}: salário de ${competencia} lançado com ${brl(liquido)}.`;
  } else {
    const t = atual.titulo;
    const vales = r2(atual.total - t.amount);
    const saldo = r2(liquido - vales);
    const notasCom = (extra: string) =>
      [...(t.notes ?? "").split("\n").filter((l) => l.trim() && !l.startsWith("Holerite ")), extra].join("\n");
    if (t.status === "PAGO") {
      // Mês já pago: o holerite entra como registro (anexo + observação) e o
      // valor pago não muda. Diferença fica avisada para conferir.
      const diferenca = r2(liquido - atual.total);
      const divergente = Math.abs(diferenca) > 0.009;
      await prisma.payable.update({
        where: { id: t.id },
        data: {
          notes: notasCom(
            divergente
              ? `${linha} Pago ${brl(atual.total)} — diferença de ${brl(Math.abs(diferenca))} ${diferenca > 0 ? "a menos" : "a mais"} (conferir).`
              : linha,
          ),
        },
      });
      payableId = t.id;
      if (divergente) {
        alerta = true;
        resumo =
          `${employee.name}: o holerite de ${competencia} é ${brl(liquido)}, mas foram pagos ${brl(atual.total)} ` +
          `(${brl(Math.abs(diferenca))} ${diferenca > 0 ? "a menos" : "a mais"}). O valor pago não foi alterado — confira.`;
      } else {
        resumo = `${employee.name}: salário de ${competencia} já pago (${brl(liquido)}) — holerite registrado.`;
      }
    } else {
      if (t.paymentComboId || t.pendingPaymentDate) {
        throw new Error(`${employee.name}: o salário está num combo ou pré-lançado — ajuste o valor em Contas a pagar.`);
      }
      if (!(saldo > 0)) {
        throw new Error(
          `${employee.name}: os vales já tirados (${brl(vales)}) cobrem o holerite (${brl(liquido)}). ` +
            "Confira os vales em Contas a pagar.",
        );
      }
      await prisma.payable.update({ where: { id: t.id }, data: { amount: saldo, notes: notasCom(linha) } });
      payableId = t.id;
      resumo = vales
        ? `${employee.name}: holerite ${brl(liquido)} − vales ${brl(vales)} = ${brl(saldo)} a pagar.`
        : `${employee.name}: salário ajustado para ${brl(liquido)}.`;
    }
  }

  if (arquivo) {
    const descricao = `Holerite ${competencia}`;
    await prisma.$transaction([
      prisma.payableAttachment.deleteMany({ where: { payableId, description: descricao } }),
      prisma.payableAttachment.create({
        data: {
          payableId,
          kind: "OUTRO",
          description: descricao,
          filename: arquivo.nome,
          mimeType: arquivo.mime,
          size: arquivo.dados.length,
          data: arquivo.dados,
        },
      }),
    ]);
  }
  return { texto: resumo, alerta };
}

/** Ajuste manual: digita o líquido do holerite de um funcionário. */
export async function ajustarSalarioAction(
  employeeId: string,
  competencia: string,
  liquidoTexto: string,
): Promise<{ ok?: string; error?: string }> {
  try {
    await assertCan("administrativo", "folha");
    const { competenciaValida } = await import("@/lib/folha");
    if (!competenciaValida(competencia)) return { error: "Competência inválida." };
    const liquido = num(liquidoTexto);
    if (Number.isNaN(liquido) || liquido <= 0) return { error: "Informe o valor líquido do holerite." };
    const r = await aplicarLiquido(employeeId, competencia, { liquido });
    revalidarFolha(employeeId);
    return r.alerta ? { error: r.texto } : { ok: r.texto };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível ajustar o salário." };
  }
}

export type ItemHoleriteLido = {
  nome: string;
  cargo: string | null;
  salarioBase: number | null;
  totalVencimentos: number | null;
  totalDescontos: number | null;
  liquido: number;
  /** Funcionário do cadastro que casa com o nome do holerite. */
  employeeId: string | null;
};

export type LeituraHolerite =
  | {
      ok: true;
      competencia: string | null;
      itens: ItemHoleriteLido[];
      funcionarios: { id: string; name: string; recebeSalario: boolean; active: boolean }[];
    }
  | { ok: false; erro: string };

/** Lê o PDF de holerites da contabilidade e casa cada um com o cadastro. */
export async function lerHoleriteAction(formData: FormData): Promise<LeituraHolerite> {
  try {
    await assertCan("administrativo", "folha");
    const arq = await arquivoDoForm(formData, "arquivo");
    if (!arq) return { ok: false, erro: "Escolha o arquivo do holerite." };
    const [{ lerHolerite }, { nomeCasa }] = await Promise.all([import("@/lib/holerite-ai"), import("@/lib/folha")]);
    const [lido, funcionarios] = await Promise.all([
      lerHolerite(arq.dados.toString("base64"), arq.mime),
      prisma.employee.findMany({
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: { id: true, name: true, recebeSalario: true, active: true },
      }),
    ]);
    const itens = lido.itens.map((i) => ({
      ...i,
      employeeId: funcionarios.find((f) => f.active && nomeCasa(f.name, i.nome))?.id ?? null,
    }));
    return { ok: true, competencia: lido.competencia, itens, funcionarios };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível ler o holerite." };
  }
}

const itemAplicarSchema = z.object({
  /** id do funcionário, "novo" (cadastrar) ou "" (ignorar). */
  destino: z.string(),
  nome: z.string(),
  cargo: z.string().nullable(),
  salarioBase: z.number().nullable(),
  totalVencimentos: z.number().nullable(),
  totalDescontos: z.number().nullable(),
  liquido: z.number(),
});

function nomeProprio(nome: string): string {
  const minusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return nome
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/**
 * Aplica o holerite conferido: cada item vai para o salário da competência do
 * funcionário escolhido (cadastrando quem ainda não existe), com o PDF anexado
 * ao título. Quem não recebe salário pela folha é pulado.
 */
export async function aplicarHoleriteAction(
  formData: FormData,
): Promise<{ resultados: { ok: boolean; texto: string }[]; error?: string }> {
  try {
    await assertCan("administrativo", "folha");
    const { competenciaValida } = await import("@/lib/folha");
    const competencia = String(formData.get("competencia") || "");
    if (!competenciaValida(competencia)) return { resultados: [], error: "Informe a competência (MM/AAAA)." };
    const itens = z.array(itemAplicarSchema).safeParse(JSON.parse(String(formData.get("itens") || "[]")));
    if (!itens.success) return { resultados: [], error: "Itens do holerite inválidos." };
    const arquivo = await arquivoDoForm(formData, "arquivo");

    const resultados: { ok: boolean; texto: string }[] = [];
    for (const item of itens.data) {
      if (!item.destino) continue;
      try {
        let employeeId = item.destino;
        if (employeeId === "novo") {
          const novo = await prisma.employee.create({
            data: {
              name: nomeProprio(item.nome),
              role: item.cargo ? nomeProprio(item.cargo) : null,
              salary: r2(item.salarioBase ?? item.totalVencimentos ?? item.liquido),
              admissionDate: new Date(),
              notes: "Cadastrada pela importação do holerite — confira a data de admissão.",
            },
            select: { id: true, name: true },
          });
          employeeId = novo.id;
          resultados.push({ ok: true, texto: `${novo.name} cadastrado(a) — confira a data de admissão na ficha.` });
        }
        const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true, recebeSalario: true } });
        if (!e) throw new Error("Funcionário não encontrado.");
        if (!e.recebeSalario) {
          resultados.push({ ok: true, texto: `${e.name}: não recebe salário pela folha (só comissão) — ignorado.` });
          continue;
        }
        const r = await aplicarLiquido(employeeId, competencia, item, arquivo);
        resultados.push({ ok: !r.alerta, texto: r.texto });
        revalidatePath(`/folha/${employeeId}`);
      } catch (err) {
        resultados.push({ ok: false, texto: err instanceof Error ? err.message : `${item.nome}: falhou.` });
      }
    }
    revalidarFolha("");
    return { resultados };
  } catch (e) {
    return { resultados: [], error: e instanceof Error ? e.message : "Não foi possível aplicar o holerite." };
  }
}

export type TituloParaVale =
  | { ok: true; id: string; orderNumber: number; descricao: string; valor: number; fornecedor: string | null; vencimento: string; pago: boolean }
  | { ok: false; erro: string };

/** Confere um título (pelo nº da ordem de pagamento) antes de virar vale do salário. */
async function tituloParaVale(orderNumber: number, raizId: string): Promise<TituloParaVale> {
  const t = await prisma.payable.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      orderNumber: true,
      description: true,
      amount: true,
      status: true,
      dueDate: true,
      partialOfId: true,
      employeeId: true,
      supplier: { select: { name: true } },
      vehicleCost: { select: { id: true } },
      vehicle: { select: { plate: true } },
    },
  });
  if (!t) return { ok: false, erro: `Não achei a ordem de pagamento nº ${orderNumber}.` };
  if (t.id === raizId) return { ok: false, erro: "Esse é o próprio título do salário." };
  if (t.partialOfId && t.partialOfId !== raizId) {
    return { ok: false, erro: "Esse título já é parte de outro pagamento (vale ou parcial de outro título)." };
  }
  if (t.vehicleCost || t.vehicle) {
    return {
      ok: false,
      erro: `Esse título está ligado ao veículo${t.vehicle?.plate ? ` ${t.vehicle.plate}` : ""} (custo do carro). Tire o vínculo no Contas a pagar antes.`,
    };
  }
  return {
    ok: true,
    id: t.id,
    orderNumber: t.orderNumber,
    descricao: t.description,
    valor: t.amount,
    fornecedor: t.supplier?.name ?? null,
    vencimento: formatarDia(t.dueDate),
    pago: t.status === "PAGO",
  };
}

async function raizDoSalario(employeeId: string, competencia: string) {
  const { competenciaValida, salariosDaCompetencia } = await import("@/lib/folha");
  if (!competenciaValida(competencia)) throw new Error("Competência inválida.");
  const s = (await salariosDaCompetencia(competencia)).get(employeeId);
  if (!s) throw new Error(`O salário de ${competencia} ainda não foi lançado na folha.`);
  return s;
}

/** Prévia do título que vai virar vale (o usuário confirma antes). */
export async function buscarTituloParaValeAction(
  employeeId: string,
  competencia: string,
  numero: string,
): Promise<TituloParaVale> {
  try {
    await assertCan("administrativo", "folha");
    const n = Number(String(numero).replace(/\D/g, ""));
    if (!n) return { ok: false, erro: "Informe o nº da ordem de pagamento (aparece no Contas a pagar e no PDF da ordem)." };
    const raiz = await raizDoSalario(employeeId, competencia);
    return await tituloParaVale(n, raiz.titulo.id);
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível buscar o título." };
  }
}

/**
 * Liga um título que já existe (ex.: compra que o funcionário fez em nome da
 * loja, paga ao fornecedor) ao salário da competência como VALE: ele passa a
 * contar como parte do salário — a folha soma salário + vales = holerite — e
 * vira despesa de salário (categoria Salário, rótulo Vale), sem mudar valor,
 * vencimento nem fornecedor.
 */
export async function vincularValeAction(
  employeeId: string,
  competencia: string,
  numero: string,
): Promise<{ ok?: string; error?: string }> {
  try {
    await assertCan("administrativo", "folha");
    const raiz = await raizDoSalario(employeeId, competencia);
    const t = await tituloParaVale(Number(String(numero).replace(/\D/g, "")), raiz.titulo.id);
    if (!t.ok) return { error: t.erro };
    const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } });
    await prisma.$transaction([
      prisma.payable.update({
        where: { id: t.id },
        data: { partialOfId: raiz.titulo.id, employeeId, category: "SALARIO", categoryLabel: "Vale (adiantamento)" },
      }),
      prisma.payable.update({
        where: { id: raiz.titulo.id },
        data: {
          notes: [
            ...(raiz.titulo.notes ?? "")
              .split("\n")
              .map((l) => l.replace(/ Pago R\$ [^—]+— diferença de R\$ [\d.,]+ a (menos|mais) \(conferir\)\./, ""))
              .filter((l) => l.trim()),
            `Vale vinculado: ordem nº ${t.orderNumber}${t.fornecedor ? ` (${t.fornecedor})` : ""}, ${brl(t.valor)}, vence ${t.vencimento}.`,
          ].join("\n"),
        },
      }),
    ]);
    revalidarFolha(employeeId);
    revalidatePath(`/financeiro/a-pagar/${t.id}/ordem`);
    const total = r2(raiz.total + t.valor);
    return {
      ok:
        `Ordem nº ${t.orderNumber} (${brl(t.valor)}) vinculada como vale do salário de ${competencia} de ${employee?.name ?? "funcionário"}. ` +
        `Salário + vales = ${brl(total)}.${t.pago ? "" : ` O título continua a pagar em ${t.vencimento}.`}`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível vincular o título." };
  }
}

/**
 * Passa um salário que estava como RECORRÊNCIA no Contas a pagar para a folha:
 * a recorrência é encerrada e os títulos dela ganham o funcionário e a
 * competência (o vencimento no mês M é o salário de M−1). Os que ainda estão a
 * pagar passam a aparecer na folha — e o "Gerar folha" não duplica.
 */
export async function passarRecorrenciaParaFolhaAction(
  recurringId: string,
  employeeId: string,
): Promise<{ ok?: string; error?: string }> {
  try {
    await assertCan("administrativo", "folha");
    const { competenciaPeloVencimento, descricaoDoSalario, salariosDaCompetencia } = await import("@/lib/folha");
    const [rec, employee] = await Promise.all([
      prisma.recurringEntry.findUnique({
        where: { id: recurringId },
        select: { id: true, description: true, amount: true, kind: true, categoryPagar: true },
      }),
      prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true, salary: true } }),
    ]);
    if (!rec || rec.kind !== "PAGAR") return { error: "Recorrência não encontrada." };
    if (!employee) return { error: "Escolha o funcionário." };

    const titulos = await prisma.payable.findMany({
      where: { recurringId, partialOfId: null },
      select: { id: true, status: true, dueDate: true },
      orderBy: { dueDate: "asc" },
    });
    let ligados = 0;
    const pulados: string[] = [];
    for (const t of titulos) {
      const comp = competenciaPeloVencimento(t.dueDate);
      const ja = (await salariosDaCompetencia(comp)).get(employeeId);
      if (ja && ja.titulo.id !== t.id) {
        pulados.push(comp);
        continue;
      }
      await prisma.payable.update({
        where: { id: t.id },
        data: {
          employeeId,
          category: "SALARIO",
          categoryLabel: null,
          referencePeriod: comp,
          ...(t.status === "PAGO" ? {} : { description: descricaoDoSalario(employee.name, comp) }),
        },
      });
      // Vales já tirados desse título acompanham.
      await prisma.payable.updateMany({ where: { partialOfId: t.id }, data: { employeeId } });
      ligados++;
    }
    await prisma.$transaction([
      prisma.recurringEntry.update({ where: { id: recurringId }, data: { active: false, endDate: new Date() } }),
      prisma.employee.update({
        where: { id: employeeId },
        data: { recebeSalario: true, ...(employee.salary > 0 ? {} : { salary: rec.amount }) },
      }),
    ]);
    revalidatePath("/financeiro/recorrentes");
    revalidarFolha(employeeId);
    return {
      ok:
        `"${rec.description}" encerrada e passada para a folha de ${employee.name} (${ligados} título(s) ligados).` +
        (pulados.length ? ` Já havia salário na folha em ${pulados.join(", ")} — confira se não ficou em dobro.` : ""),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível passar a recorrência para a folha." };
  }
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
    // Comprovante bancário: só de quem pagou fora do sistema (pela conta a
    // pagar, o comprovante vai na baixa).
    const comprovante = gerarConta ? null : await arquivoDoForm(formData, "comprovante");
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
          comprovanteNome: comprovante?.nome ?? null,
          comprovanteMime: comprovante?.mime ?? null,
          comprovanteDados: comprovante?.dados ?? null,
          notes: String(formData.get("notes") || "").trim() || null,
        },
      });
    });
    revalidarFolha(employeeId);
    return {
      ok: gerarConta
        ? `Férias lançadas. Conta a pagar de ${brl(valorLiquido)} com vencimento em ${formatarDia(pagamentoAte)}.`
        : "Férias registradas como pagas fora do sistema" +
          (recibo && comprovante ? ", com recibo e comprovante." : recibo ? ", com o recibo anexado." : comprovante ? ", com o comprovante." : "."),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível lançar as férias." };
  }
}

/**
 * Anexa (ou troca) um documento de férias ou rescisão já lançadas:
 * - "recibo": recibo de férias / TRCT da contabilidade (havendo conta a pagar,
 *   vai também para ela);
 * - "comprovante": comprovante bancário de quem pagou FORA do sistema.
 */
export async function anexarDocumentoFolhaAction(formData: FormData): Promise<{ error?: string; ok?: string }> {
  try {
    await assertCan("administrativo", "folha");
    const tipo = String(formData.get("tipo") || "");
    const campo = String(formData.get("campo") || "");
    const id = String(formData.get("id") || "");
    if (!["ferias", "rescisao"].includes(tipo) || !["recibo", "comprovante"].includes(campo)) {
      return { error: "Documento inválido." };
    }
    const arquivo = await arquivoDoForm(formData, "arquivo");
    if (!arquivo) return { error: "Escolha o arquivo." };
    const reg =
      tipo === "ferias"
        ? await prisma.employeeVacation.findUnique({ where: { id }, select: { employeeId: true, payableId: true } })
        : await prisma.employeeTermination.findUnique({ where: { id }, select: { employeeId: true, payableId: true } });
    if (!reg) return { error: "Lançamento não encontrado." };
    const dados =
      campo === "comprovante"
        ? { comprovanteNome: arquivo.nome, comprovanteMime: arquivo.mime, comprovanteDados: arquivo.dados }
        : tipo === "ferias"
          ? { reciboNome: arquivo.nome, reciboMime: arquivo.mime, reciboDados: arquivo.dados }
          : { arquivoNome: arquivo.nome, arquivoMime: arquivo.mime, arquivoDados: arquivo.dados };
    await prisma.$transaction(async (tx) => {
      if (tipo === "ferias") await tx.employeeVacation.update({ where: { id }, data: dados });
      else await tx.employeeTermination.update({ where: { id }, data: dados });
      if (campo === "recibo" && reg.payableId) {
        await tx.payableAttachment.create({
          data: {
            payableId: reg.payableId,
            kind: "OUTRO",
            description: tipo === "ferias" ? "Recibo de férias" : "Termo de rescisão (TRCT)",
            filename: arquivo.nome,
            mimeType: arquivo.mime,
            size: arquivo.dados.length,
            data: arquivo.dados,
          },
        });
      }
    });
    revalidarFolha(reg.employeeId);
    return { ok: campo === "comprovante" ? "Comprovante anexado." : "Documento anexado." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível anexar o arquivo." };
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
