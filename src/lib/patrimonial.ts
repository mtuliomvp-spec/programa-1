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
  veiculosAReceber: number;
  sinaisRecebidos: number;
  devolucoesClientes: number;
  devolucoesProprietario: number;
  veiculosAPagarPosVenda: number;
  pecasAPagar: number;
  comissoesAPagar: number;
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
  const [accounts, payables, receivables, parts, capitalTx, custosVendidosPendentes] = await Promise.all([
    getAccountsWithBalances(),
    prisma.payable.findMany({
      select: {
        amount: true,
        status: true,
        dueDate: true,
        vehicleId: true,
        saleId: true,
        consortiumId: true,
        category: true,
        vehicle: { select: { status: true } },
      },
    }),
    prisma.receivable.findMany({
      select: { amount: true, status: true, saleId: true, vehicleId: true, vehicle: { select: { status: true } } },
    }),
    prisma.part.findMany({ select: { quantity: true, costPrice: true } }),
    prisma.capitalTransaction.findMany({ select: { kind: true, amount: true } }),
    // Custos de veículo JÁ VENDIDO ainda não pagos (peça/serviço a prazo,
    // combustível, item de fatura de cartão...): o custo já saiu no resultado
    // na data da venda (a margem soma os custos pré-venda por competência,
    // pagos ou não), mas o dinheiro ainda não saiu do caixa. É passivo puro e
    // entra subtraindo — espelha a quitação da compra (COMPRA_VEICULO abaixo).
    // Custos pós-venda ficam FORA: o Lucro/Prejuízo só os reconhece quando
    // pagos, então pendente é neutro dos dois lados.
    prisma.vehicleCost.findMany({
      where: {
        postSale: false,
        vehicle: { status: "VENDIDO" },
        OR: [
          { payable: { status: { in: ["PENDENTE", "ATRASADO"] } } },
          { cardItem: { payable: { status: { in: ["PENDENTE", "ATRASADO"] } } } },
        ],
      },
      select: { amount: true },
    }),
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
  let titulosVencidosCount = 0;
  let titulosVencidosValor = 0;
  let devolucoesClientes = 0;
  let devolucoesProprietario = 0;
  let veiculosAPagarPosVenda = 0;
  let pecasAPagar = 0;
  let comissoesAPagar = 0;

  for (const p of payables) {
    if (p.status === "PAGO") {
      totalPago += p.amount;
      if (isVeiculoEmEstoque(p)) estoqueVeiculosPago += p.amount;
      if (p.consortiumId) consorcios += p.amount;
    } else if (isPend(p.status)) {
      contasAPagar += p.amount;
      if (isVeiculoEmEstoque(p)) {
        veiculosNegociadoPendente += p.amount;
      }
      // Peça comprada a prazo (ainda não paga): a peça já está no almoxarifado
      // (ativo) mas a loja deve por ela. Vira passivo puro e entra subtraindo,
      // para o almoxarifado não superavaliar o patrimônio.
      // Só conta se NÃO for um custo de veículo (vehicleId): uma compra de peça
      // ligada a um carro virou custo do veículo (VehicleCost), não entrou no
      // almoxarifado — quem cuida dela é a lógica de veículos, não esta.
      if (p.category === "COMPRA_PECA" && !p.vehicleId) {
        pecasAPagar += p.amount;
      }
      // Dívida de COMPRA de um veículo já VENDIDO (ex.: quitação ao banco e
      // débitos da troca): o carro (ativo pago) já saiu da equação, mas a
      // dívida continua. Vira passivo puro e entra subtraindo — assim o lucro
      // fica correto na hora da venda e não muda quando a dívida for paga.
      // (Os DEMAIS custos pendentes de veículo vendido — peça, serviço,
      // combustível, cartão — entram no mesmo balde via custosVendidosPendentes,
      // somados após este loop; COMPRA_VEICULO não tem VehicleCost, sem 2x.)
      if (
        p.category === "COMPRA_VEICULO" &&
        !!p.vehicleId &&
        !!p.vehicle &&
        p.vehicle.status === "VENDIDO"
      ) {
        veiculosAPagarPosVenda += p.amount;
      }
      // Devolução ao cliente ainda não paga: o dinheiro está no caixa mas é do
      // cliente, então entra na equação subtraindo (quando for paga, sai do
      // caixa e o efeito já está refletido — não conta duas vezes).
      if (p.category === "DEVOLUCAO_CLIENTE") {
        devolucoesClientes += p.amount;
      }
      // Devolução ao proprietário do consignado ainda não paga: o dinheiro da
      // venda está no caixa mas é do dono do carro, então entra subtraindo
      // (quando for paga, sai do caixa e o efeito já está refletido — não conta
      // duas vezes). No destino "aporte de capital" não existe este título: lá o
      // valor já entra subtraindo via saldoCapital (aporte do beneficiário).
      if (p.category === "DEVOLUCAO_PROPRIETARIO") {
        devolucoesProprietario += p.amount;
      }
      // Comissão do vendedor de uma venda: custo direto da venda já realizada.
      // Entra subtraindo enquanto pendente (competência), casando com a
      // comissão reconhecida no Lucro/Prejuízo na data da venda. Ao ser paga,
      // sai do caixa e o efeito continua o mesmo (não conta duas vezes).
      if (p.category === "COMISSAO" && p.saleId) {
        comissoesAPagar += p.amount;
      }
      if (p.dueDate < now) {
        titulosVencidosCount++;
        titulosVencidosValor += p.amount;
      }
    }
  }

  // Custos pré-venda ainda pendentes de veículos vendidos (query acima): já
  // estão na margem do Lucro/Prejuízo, então a dívida subtrai aqui também —
  // o farol fecha no ato da venda e não muda quando cada título for pago.
  for (const c of custosVendidosPendentes) {
    veiculosAPagarPosVenda += c.amount;
  }

  let veiculosRecebido = 0;
  let veiculosAReceber = 0;
  let sinaisRecebidos = 0;
  let contasAReceber = 0;
  for (const r of receivables) {
    // Sinal / entrada antecipada: recebido para um veículo AINDA em estoque,
    // sem venda fechada. É um adiantamento (o dinheiro entrou, mas a venda não
    // aconteceu), então compensa o caixa na equação até o fechamento.
    if (
      r.status === "RECEBIDO" &&
      !r.saleId &&
      r.vehicleId &&
      r.vehicle &&
      r.vehicle.status !== "VENDIDO"
    ) {
      sinaisRecebidos += r.amount;
    } else if (r.status === "RECEBIDO" && r.saleId) {
      veiculosRecebido += r.amount;
    } else if (isPend(r.status)) {
      contasAReceber += r.amount;
      // Pendente de vendas de veículos: é um ativo (o carro já saiu). Entra na
      // equação para o resultado bater com a página de Lucro/Prejuízo.
      if (r.saleId) veiculosAReceber += r.amount;
    }
  }

  const almoxarifado = parts.reduce((s, p) => s + p.quantity * p.costPrice, 0);

  let aportes = 0;
  let retiradas = 0;
  for (const t of capitalTx) {
    if (t.kind === "APORTE") aportes += t.amount;
    else if (t.kind === "RETIRADA") retiradas += t.amount;
  }
  const saldoCapital = aportes - retiradas;

  // Equação patrimonial (só estes cards, com as entradas/saídas de cada um):
  //   Caixa + Estoque de veículos (pago) + Almoxarifado + Consórcios − Capital
  //
  // Cada card entra pela sua contribuição líquida (entradas − saídas):
  // - Caixa: saldo das contas (entradas − saídas de dinheiro)
  // - Estoque de veículos: só o valor PAGO dos carros em estoque; quando o
  //   carro é vendido ele sai do estoque e o dinheiro já está no caixa, então
  //   não se subtrai o recebido de novo (evita contagem dupla); o negociado
  //   ainda não pago fica neutro (não é ativo nem prejuízo até ser quitado)
  // - Almoxarifado: valor líquido em estoque (entradas − saídas de peças)
  // - Consórcios: valor aplicado nas cotas
  // - Capital: aportes − retiradas dos sócios (não é lucro; entra subtraindo)
  const lucro =
    saldoCaixa +
    estoqueVeiculosPago +
    veiculosAReceber +
    almoxarifado +
    consorcios -
    sinaisRecebidos -
    devolucoesClientes -
    devolucoesProprietario -
    veiculosAPagarPosVenda -
    pecasAPagar -
    comissoesAPagar -
    saldoCapital;

  return {
    saldoCaixa,
    estoqueVeiculosPago,
    veiculosNegociadoPendente,
    veiculosRecebido,
    veiculosAReceber,
    sinaisRecebidos,
    devolucoesClientes,
    devolucoesProprietario,
    veiculosAPagarPosVenda,
    pecasAPagar,
    comissoesAPagar,
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
