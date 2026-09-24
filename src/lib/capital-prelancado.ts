import "server-only";
import { prisma } from "@/lib/prisma";
import { abatimentoDoCombo } from "@/lib/combo-capital";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type ItemCapitalPrelancado = {
  kind: "APORTE" | "RETIRADA";
  amount: number;
  /** ISO da data do banco (a do comprovante/crédito informado). */
  date: string;
  description: string;
  href: string;
};

export type CapitalPrelancado = {
  aportes: number;
  retiradas: number;
  /** Efeito no saldo investido quando tudo for confirmado (aportes − retiradas). */
  liquido: number;
  itens: ItemCapitalPrelancado[];
};

/**
 * O que a FILA DO CAIXA ainda vai mexer no capital de cada sócio.
 *
 * O capital só se move na baixa (o aporte nasce quando o título a receber é
 * recebido; a retirada, quando o a pagar é pago). Então um crédito de
 * R$ 100.000 já informado — o dinheiro caiu no banco, falta o ok do caixa do
 * dia — não aparecia no card do sócio, que mostrava um saldo que o banco já
 * não tem. Aqui está o que falta entrar/sair, para a tela mostrar o saldo
 * depois do ok. Nada aqui lança nada: é só a previsão.
 *
 * Mesmas regras da baixa: título a receber do fluxo Capital vira APORTE pelo
 * valor informado; a pagar vira RETIRADA; no combo, cada título do Capital vira
 * retirada e o abatimento do saldo devedor vira aporte de quem o montou.
 */
export async function capitalPrelancado(beneficiaryId?: string): Promise<Map<string, CapitalPrelancado>> {
  const doSocio = beneficiaryId ? { capitalBeneficiaryId: beneficiaryId } : { capitalBeneficiaryId: { not: null } };
  const [recebimentos, pagamentos, combos] = await Promise.all([
    prisma.receivable.findMany({
      where: { status: { not: "RECEBIDO" }, pendingReceiptDate: { not: null }, ...doSocio },
      select: {
        id: true,
        description: true,
        amount: true,
        pendingReceiptAmount: true,
        pendingReceiptDate: true,
        capitalBeneficiaryId: true,
      },
    }),
    prisma.payable.findMany({
      where: { status: { not: "PAGO" }, pendingPaymentDate: { not: null }, ...doSocio },
      select: {
        id: true,
        description: true,
        amount: true,
        pendingPaymentAmount: true,
        pendingPaymentDate: true,
        capitalBeneficiaryId: true,
      },
    }),
    prisma.paymentCombo.findMany({
      where: { status: { notIn: ["PAGO", "CANCELADO"] }, pendingPaymentDate: { not: null } },
      select: {
        id: true,
        name: true,
        userId: true,
        payFull: true,
        pendingPaymentDate: true,
        payables: {
          where: { status: { not: "PAGO" } },
          select: { description: true, amount: true, capitalBeneficiaryId: true },
        },
      },
    }),
  ]);

  const porSocio = new Map<string, CapitalPrelancado>();
  const somar = (socio: string, item: ItemCapitalPrelancado) => {
    if (beneficiaryId && socio !== beneficiaryId) return;
    const atual = porSocio.get(socio) ?? { aportes: 0, retiradas: 0, liquido: 0, itens: [] };
    if (item.kind === "APORTE") atual.aportes = round2(atual.aportes + item.amount);
    else atual.retiradas = round2(atual.retiradas + item.amount);
    atual.liquido = round2(atual.aportes - atual.retiradas);
    atual.itens.push(item);
    porSocio.set(socio, atual);
  };

  for (const r of recebimentos) {
    somar(r.capitalBeneficiaryId!, {
      kind: "APORTE",
      amount: round2(r.pendingReceiptAmount ?? r.amount),
      date: r.pendingReceiptDate!.toISOString(),
      description: r.description,
      href: `/financeiro/a-receber/${r.id}/editar`,
    });
  }
  // Título avulso: vale o valor do comprovante, que é o que a baixa usa.
  for (const p of pagamentos) {
    somar(p.capitalBeneficiaryId!, {
      kind: "RETIRADA",
      amount: round2(p.pendingPaymentAmount ?? p.amount),
      date: p.pendingPaymentDate!.toISOString(),
      description: p.description,
      href: `/financeiro/a-pagar/${p.id}/ordem`,
    });
  }
  for (const c of combos) {
    const date = c.pendingPaymentDate!.toISOString();
    const href = `/financeiro/combos/${c.id}`;
    for (const p of c.payables) {
      if (!p.capitalBeneficiaryId) continue;
      somar(p.capitalBeneficiaryId, {
        kind: "RETIRADA",
        amount: round2(p.amount),
        date,
        description: `${p.description} (combo ${c.name})`,
        href,
      });
    }
    const { abate, beneficiaryId: socio } = await abatimentoDoCombo(c);
    if (socio && abate > 0.005) {
      somar(socio, {
        kind: "APORTE",
        amount: abate,
        date,
        description: `Abatimento do saldo devedor (combo ${c.name})`,
        href,
      });
    }
  }
  for (const v of porSocio.values()) v.itens.sort((a, b) => a.date.localeCompare(b.date));
  return porSocio;
}
