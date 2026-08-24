import "server-only";
import { prisma } from "@/lib/prisma";
import { timed } from "@/lib/perf";
import { getAccountsWithBalances, type AccountWithBalance } from "@/lib/accounts";

type AccountsInput = AccountWithBalance[] | Promise<AccountWithBalance[]>;

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
  pecasAReceber: number;
  pecasAplicadasEmEstoque: number;
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

/**
 * @param preloadedAccounts saldos das contas já pedidos por quem chama — aceita
 * o array pronto OU a promessa ainda em voo, para não perder o paralelismo.
 * Evita recalcular: o farol (books-health) e a tela de Contas também precisam
 * dos saldos e antes pediam a mesma soma duas/três vezes no mesmo request.
 */
export async function getPatrimonialStats(
  preloadedAccounts?: AccountsInput,
): Promise<PatrimonialStats> {
  return timed("equação patrimonial", () => patrimonialStats(preloadedAccounts));
}

async function patrimonialStats(
  preloadedAccounts?: AccountsInput,
): Promise<PatrimonialStats> {
  const now = new Date();
  const [accounts, payables, receivables, parts, pecasEmVeiculos, capitalTx, custosVendidosPendentes] = await Promise.all([
    preloadedAccounts ?? getAccountsWithBalances(),
    prisma.payable.findMany({
      select: {
        amount: true,
        status: true,
        dueDate: true,
        vehicleId: true,
        saleId: true,
        partId: true,
        consortiumId: true,
        category: true,
        vehicle: { select: { status: true } },
      },
    }),
    prisma.receivable.findMany({
      select: {
        amount: true,
        status: true,
        saleId: true,
        partSaleId: true,
        vehicleId: true,
        vehicle: { select: { status: true } },
      },
    }),
    prisma.part.findMany({ select: { quantity: true, costPrice: true } }),
    // Peças do almoxarifado aplicadas em carros que ainda estão no estoque: o
    // valor saiu do almoxarifado e virou custo do carro, sem passar por caixa
    // nem gerar título. Continua sendo ATIVO (mudou de prateleira) até o carro
    // ser vendido — aí o custo entra na margem e sai daqui junto.
    prisma.vehicleCost.findMany({
      where: {
        partId: { not: null },
        payableId: null,
        vehicle: { status: { not: "VENDIDO" } },
      },
      select: { amount: true },
    }),
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
      // E só quando veio do MÓDULO PEÇAS (partId): é a peça no almoxarifado
      // (ativo) que compensa este passivo. Um título avulso/importado com a
      // categoria "Compra de peças" mas sem peça cadastrada não tem ativo do
      // outro lado — contá-lo derrubava o farol (ex.: NF importada ainda não
      // vinculada ao veículo); ele se comporta como despesa comum: nada
      // pendente, despesa no L/P quando pago.
      if (p.category === "COMPRA_PECA" && !p.vehicleId && p.partId) {
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
      // Custos gerados por uma venda já realizada (comissão do vendedor,
      // indicações, transferência DETRAN): entram subtraindo enquanto pendentes,
      // casando com o que o Lucro/Prejuízo já reconheceu por competência na data
      // da venda. Ao serem pagos, saem do caixa e o efeito continua o mesmo
      // (não conta duas vezes).
      // O que manda aqui é o VÍNCULO com a venda (saleId), não a categoria —
      // assim renomear/reclassificar o título não desequilibra a equação.
      // Devoluções e compra de veículo têm baldes próprios (e se ligam pelo
      // veículo, não pela venda); ficam de fora por segurança.
      if (
        p.saleId &&
        p.category !== "DEVOLUCAO_CLIENTE" &&
        p.category !== "DEVOLUCAO_PROPRIETARIO" &&
        p.category !== "COMPRA_VEICULO"
      ) {
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
  let pecasAReceber = 0;
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
      // Peça vendida a prazo/parcelada: mesma lógica. A peça já saiu do
      // almoxarifado e o Lucro/Prejuízo já reconheceu a margem na data da venda,
      // então o que o cliente deve é ativo — sem isto, vender peça fiado
      // derrubava o farol pelo valor da venda.
      else if (r.partSaleId) pecasAReceber += r.amount;
    }
  }

  const almoxarifado = parts.reduce((s, p) => s + p.quantity * p.costPrice, 0);
  const pecasAplicadasEmEstoque = pecasEmVeiculos.reduce((s, c) => s + c.amount, 0);

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
  // - Peças a receber: peça já entregue e ainda não paga pelo cliente (ativo)
  // - Almoxarifado: valor líquido em estoque (entradas − saídas de peças)
  // - Peças aplicadas em carros do estoque: o valor mudou de prateleira (saiu do
  //   almoxarifado, entrou no custo do carro) e segue sendo ativo até a venda
  // - Consórcios: valor aplicado nas cotas
  // - Capital: aportes − retiradas dos sócios (não é lucro; entra subtraindo)
  const lucro =
    saldoCaixa +
    estoqueVeiculosPago +
    veiculosAReceber +
    pecasAReceber +
    almoxarifado +
    pecasAplicadasEmEstoque +
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
    pecasAReceber,
    pecasAplicadasEmEstoque,
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
