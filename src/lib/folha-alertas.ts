import "server-only";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { periodosAquisitivos, ROTULO_SITUACAO } from "@/lib/ferias";

/**
 * O que a Folha de pagamento pede agora: férias vencidas ou perto de vencer,
 * quem está de férias, férias e rescisões a pagar. Usado pela tela da Folha e
 * pelas Pendências — a mesma conta nos dois lugares.
 */
export type AlertaFolha = {
  id: string;
  titulo: string;
  detalhe: string;
  href: string;
  selo: string;
  tom: "danger" | "warning" | "info" | "success";
  valor?: number;
  /** Ordem: o mais urgente primeiro. */
  peso: number;
};

const DIA = 86_400_000;

export async function alertasDaFolha(hoje = new Date()): Promise<AlertaFolha[]> {
  const [funcionarios, feriasAbertas, rescisoes] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        admissionDate: true,
        dismissalDate: true,
        vacations: { select: { aquisitivoInicio: true, dias: true, abonoDias: true } },
      },
    }),
    prisma.employeeVacation.findMany({
      where: { gozoFim: { gte: new Date(hoje.getTime() - DIA) } },
      select: { id: true, employeeId: true, gozoInicio: true, gozoFim: true, valorLiquido: true, pagamentoAte: true, payableId: true, employee: { select: { name: true } } },
    }),
    prisma.employeeTermination.findMany({
      where: { payableId: { not: null } },
      select: { id: true, employeeId: true, pagamentoAte: true, valorLiquido: true, multaFgts: true, payableId: true, multaPayableId: true, employee: { select: { name: true } } },
    }),
  ]);

  const contaIds = [
    ...feriasAbertas.map((f) => f.payableId),
    ...rescisoes.flatMap((r) => [r.payableId, r.multaPayableId]),
  ].filter((x): x is string => !!x);
  const pendentes = new Set(
    (await prisma.payable.findMany({ where: { id: { in: contaIds }, status: { not: "PAGO" } }, select: { id: true } })).map((c) => c.id),
  );

  const out: AlertaFolha[] = [];
  for (const f of funcionarios) {
    for (const p of periodosAquisitivos(f.admissionDate, f.vacations, hoje, f.dismissalDate)) {
      if (p.situacao !== "VENCIDA" && p.situacao !== "VENCE_LOGO") continue;
      const vencida = p.situacao === "VENCIDA";
      out.push({
        id: `ferias-${f.id}-${p.inicio.toISOString().slice(0, 10)}`,
        titulo: vencida ? `Férias vencidas — ${f.name}` : `Férias perto de vencer — ${f.name}`,
        detalhe: vencida
          ? `Período ${formatDate(p.inicio)} a ${formatDate(p.fim)}: ${p.saldo} dias passaram do prazo e são pagos em dobro. Conceda já.`
          : `Período ${formatDate(p.inicio)} a ${formatDate(p.fim)}: iniciar o gozo até ${formatDate(p.iniciarAte)} (avisar até ${formatDate(p.avisarAte)}).`,
        href: `/folha/${f.id}`,
        selo: ROTULO_SITUACAO[p.situacao],
        tom: vencida ? "danger" : "warning",
        peso: vencida ? 0 : 2,
      });
    }
  }

  for (const v of feriasAbertas) {
    const aPagar = v.payableId && pendentes.has(v.payableId);
    if (aPagar) {
      const atrasada = v.pagamentoAte.getTime() < hoje.getTime() - DIA;
      out.push({
        id: `pagar-ferias-${v.id}`,
        titulo: `Pagar férias — ${v.employee.name}`,
        detalhe: `${formatCurrency(v.valorLiquido)} até ${formatDate(v.pagamentoAte)} (2 dias antes do gozo, que começa em ${formatDate(v.gozoInicio)}).`,
        href: `/folha/${v.employeeId}`,
        selo: atrasada ? "Pagamento atrasado" : "A pagar",
        tom: atrasada ? "danger" : "warning",
        valor: v.valorLiquido,
        peso: atrasada ? 1 : 3,
      });
    }
    if (v.gozoInicio <= hoje && v.gozoFim.getTime() + DIA > hoje.getTime()) {
      out.push({
        id: `gozo-${v.id}`,
        titulo: `${v.employee.name} está de férias`,
        detalhe: `De ${formatDate(v.gozoInicio)} a ${formatDate(v.gozoFim)}.`,
        href: `/folha/${v.employeeId}`,
        selo: "Em férias",
        tom: "info",
        peso: 5,
      });
    }
  }

  for (const r of rescisoes) {
    const abertas = [r.payableId, r.multaPayableId].filter((x): x is string => !!x && pendentes.has(x));
    if (!abertas.length) continue;
    const atrasada = r.pagamentoAte.getTime() < hoje.getTime() - DIA;
    out.push({
      id: `rescisao-${r.id}`,
      titulo: `Pagar rescisão — ${r.employee.name}`,
      detalhe:
        `Líquido ${formatCurrency(r.valorLiquido)}${r.multaFgts ? ` + multa do FGTS ${formatCurrency(r.multaFgts)}` : ""} ` +
        `até ${formatDate(r.pagamentoAte)} (10 dias do término; atraso gera multa de um salário, art. 477 § 8º).`,
      href: `/folha/${r.employeeId}`,
      selo: atrasada ? "Prazo vencido" : "A pagar",
      tom: atrasada ? "danger" : "warning",
      valor: r.valorLiquido + r.multaFgts,
      peso: atrasada ? 0 : 1,
    });
  }

  return out.sort((a, b) => a.peso - b.peso);
}
