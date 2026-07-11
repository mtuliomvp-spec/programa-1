import "server-only";
import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances } from "@/lib/accounts";

/**
 * Posição patrimonial no estilo Agrasty, com a equação patrimonial.
 *
 * Regra central pedida pela loja: o "Estoque de Veículos" reflete apenas o
 * que REALMENTE foi PAGO de cada carro em estoque — não o valor negociado.
 * Ex.: negociou 195 mil e não pagou nada → estoque = 0; pagou 50 mil →
 * estoque = 50 mil (e o dinheiro saiu da conta financeira).
 *
 * A equação patrimonial (Lucro/Prejuízo acumulado) usa a identidade
 * contábil Patrimônio = Ativos − Passivos − Capital, valorizando o estoque
 * de veículos pelo custo pago e, por coerência, deixando de fora as contas
 * a pagar de veículos que ainda estão em estoque (o carro não pago não é
 * ativo nem passivo — fica neutro até ser quitado ou vendido).
 */

export type PatrimonialStats = {
  saldoCaixa: number;
  estoqueVeiculosPago: number;
  veiculosNegociadoPendente: number;
  veiculosRecebido: number;
  almoxarifado: number;
  saldoCapital: number;
  consorcios: number;
  contasAReceber: number;
  contasAPagar: number;
  totalPago: number;
  titulosVencidosCount: number;
  titulosVencidosValor: number;
  lucro: number;
};

export async function getPatrimonialStats(): Promise<PatrimonialStats> {
  const now = new Date();
  const [accounts, payables, receivables, parts, capitalTx] = await Promise.all([
    getAccountsWithBalances(),
    prisma.payable.findMany({
      select: {
        amount: true,
        status: true,
        dueDate: true,
        vehicleId: true,
        consortiumId: true,
        vehicle: { select: { status: true } },
      },
    }),
    prisma.receivable.findMany({ select: { amount: true, status: true, saleId: true } }),
    prisma.part.findMany({ select: { quantity: true, costPrice: true } }),
    prisma.capitalTransaction.findMany({ select: { kind: true, amount: true } }),
  ]);

  const saldoCaixa = accounts.reduce((s, a) => s + a.balance, 0);

  const isVeiculoEmEstoque = (p: { vehicleId: string | null; vehicle: { status: string } | null }) =>
    !!p.vehicleId && !!p.vehicle && p.vehicle.status !== "VENDIDO";
  const isPend = (st: string) => st === "PENDENTE" || st === "ATRASADO";

  let estoqueVeiculosPago = 0;
  let veiculosNegociadoPendente = 0;
  let consorcios = 0;
  let contasAPagar = 0;
  let totalPago = 0;
  let apagarVeiculoEstoquePend = 0;
  let titulosVencidosCount = 0;
  let titulosVencidosValor = 0;

  for (const p of payables) {
    if (p.status === "PAGO") {
      totalPago += p.amount;
      if (isVeiculoEmEstoque(p)) estoqueVeiculosPago += p.amount;
      if (p.consortiumId) consorcios += p.amount;
    } else if (isPend(p.status)) {
      contasAPagar += p.amount;
      if (isVeiculoEmEstoque(p)) {
        veiculosNegociadoPendente += p.amount;
        apagarVeiculoEstoquePend += p.amount;
      }
      if (p.dueDate < now) {
        titulosVencidosCount++;
        titulosVencidosValor += p.amount;
      }
    }
  }

  let veiculosRecebido = 0;
  let contasAReceber = 0;
  for (const r of receivables) {
    if (r.status === "RECEBIDO" && r.saleId) veiculosRecebido += r.amount;
    else if (isPend(r.status)) contasAReceber += r.amount;
  }

  const almoxarifado = parts.reduce((s, p) => s + p.quantity * p.costPrice, 0);

  let aportes = 0;
  let retiradas = 0;
  for (const t of capitalTx) {
    if (t.kind === "APORTE") aportes += t.amount;
    else if (t.kind === "RETIRADA") retiradas += t.amount;
  }
  const saldoCapital = aportes - retiradas;

  // Contas a pagar que entram na equação: todas as pendentes MENOS as de
  // veículos ainda em estoque (esses ficam neutros até quitar/vender).
  const apagarEquacao = contasAPagar - apagarVeiculoEstoquePend;

  const lucro =
    saldoCaixa +
    estoqueVeiculosPago +
    almoxarifado +
    consorcios +
    contasAReceber -
    apagarEquacao -
    saldoCapital;

  return {
    saldoCaixa,
    estoqueVeiculosPago,
    veiculosNegociadoPendente,
    veiculosRecebido,
    almoxarifado,
    saldoCapital,
    consorcios,
    contasAReceber,
    contasAPagar,
    totalPago,
    titulosVencidosCount,
    titulosVencidosValor,
    lucro,
  };
}
