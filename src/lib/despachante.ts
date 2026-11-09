import { prisma } from "@/lib/prisma";
import { TITULO_TRANSFERENCIA_DA_VENDA } from "@/lib/doc-owner";

/** O que o despachante recebeu (ou vai receber) por uma transferência. */
export type PagamentoTransferencia = {
  valor: number;
  /** Data em que a loja pagou o despachante; nula enquanto o título está em aberto. */
  pagoEm: Date | null;
  vencimento: Date | null;
};

const TRANSFER_RE = /transfer[eê]ncia/i;
const ehReembolso = (descricao: string, valor: number) => /^reembolso de custo/i.test(descricao) || valor < 0;

/**
 * Pagamento da transferência de cada veículo: o lançamento MAIS RECENTE entre
 * o título "Transferência DETRAN" da venda, as contas a pagar do veículo e os
 * custos do veículo que citam "transferência". Em veículo vendido (`desde` =
 * data da venda) só conta o que foi lançado a partir da venda — o custo de
 * transferência da COMPRA é de outro processo (para o nome da loja).
 */
export async function pagamentosDeTransferencia(
  veiculos: { id: string; desde: Date | null }[],
): Promise<Map<string, PagamentoTransferencia>> {
  const out = new Map<string, PagamentoTransferencia>();
  if (veiculos.length === 0) return out;
  const ids = veiculos.map((v) => v.id);
  const filtroTexto = { contains: "ransfer", mode: "insensitive" } as const;

  const [titulosVeiculo, titulosVenda, custos] = await Promise.all([
    prisma.payable.findMany({
      where: { vehicleId: { in: ids }, description: filtroTexto },
      select: { id: true, vehicleId: true, description: true, amount: true, status: true, paymentDate: true, dueDate: true, createdAt: true },
    }),
    prisma.payable.findMany({
      where: { sale: { vehicleId: { in: ids }, status: { not: "CANCELADA" } }, ...TITULO_TRANSFERENCIA_DA_VENDA },
      select: {
        id: true,
        description: true,
        amount: true,
        status: true,
        paymentDate: true,
        dueDate: true,
        createdAt: true,
        sale: { select: { vehicleId: true } },
      },
    }),
    prisma.vehicleCost.findMany({
      where: { vehicleId: { in: ids }, description: filtroTexto },
      select: { vehicleId: true, description: true, amount: true, date: true, createdAt: true, payableId: true },
    }),
  ]);

  type Candidato = PagamentoTransferencia & { vehicleId: string; criadoEm: Date };
  const candidatos: Candidato[] = [];
  const titulosVistos = new Set<string>();
  for (const t of [...titulosVeiculo, ...titulosVenda.map((t) => ({ ...t, vehicleId: t.sale?.vehicleId ?? null }))]) {
    if (!t.vehicleId || titulosVistos.has(t.id)) continue;
    if (!TRANSFER_RE.test(t.description) || ehReembolso(t.description, t.amount)) continue;
    titulosVistos.add(t.id);
    candidatos.push({
      vehicleId: t.vehicleId,
      valor: t.amount,
      pagoEm: t.status === "PAGO" ? (t.paymentDate ?? t.dueDate) : null,
      vencimento: t.dueDate,
      criadoEm: t.createdAt,
    });
  }
  // Custo com título vinculado já entrou pelo título (que diz se foi pago).
  // Custo avulso é despesa já feita: vale a data do custo.
  for (const c of custos) {
    if (c.payableId && titulosVistos.has(c.payableId)) continue;
    if (!TRANSFER_RE.test(c.description) || ehReembolso(c.description, c.amount)) continue;
    candidatos.push({ vehicleId: c.vehicleId, valor: c.amount, pagoEm: c.date, vencimento: null, criadoEm: c.createdAt });
  }

  const desde = new Map(veiculos.map((v) => [v.id, v.desde]));
  for (const c of candidatos) {
    const inicio = desde.get(c.vehicleId);
    // Dia da venda inteiro (a data da venda costuma vir às 00:00 ou 12:00).
    if (inicio && c.criadoEm.getTime() < inicio.getTime() - 24 * 3600 * 1000) continue;
    const atual = out.get(c.vehicleId) as Candidato | undefined;
    if (!atual || c.criadoEm > atual.criadoEm) out.set(c.vehicleId, c);
  }
  return new Map(
    [...out].map(([id, c]) => [id, { valor: c.valor, pagoEm: c.pagoEm, vencimento: c.vencimento }]),
  );
}
