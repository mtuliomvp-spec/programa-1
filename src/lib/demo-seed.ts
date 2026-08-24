import "server-only";
/**
 * Carga de DEMONSTRAÇÃO — dados 100% fictícios para apresentar o sistema.
 *
 * Dois caminhos chamam esta função:
 *  - o terminal, via `npm run db:seed` (prisma/seed.ts);
 *  - a tela /demo do próprio sistema, disponível apenas quando a variável de
 *    ambiente DEMO_MODE está ligada (nunca na instalação de produção).
 *
 * Usa as MESMAS funções de negócio do sistema (src/lib/finance.ts), então todo
 * o financeiro sai consistente: contas, caixa, capital dos sócios, equação
 * patrimonial e Lucro/Prejuízo convergem — o farol fica verde. Ao final ela
 * confere o farol e recusa a carga se algum check divergir.
 *
 * NÃO mexe em usuários nem nos Parâmetros da empresa: num banco novo, o
 * primeiro acesso pelo site cria o administrador normalmente.
 */
import { prisma } from "@/lib/prisma";
import {
  createVehicleWithPayable,
  createPartWithPayable,
  registerVehicleSale,
  registerPartSale,
  markPayablePaid,
  markReceivableReceived,
  createManualPayable,
  addVehicleCostWithPayable,
} from "@/lib/finance";
import { getDefaultAccountId, ensureNeutralAccount } from "@/lib/accounts";
import { structuralCenterId } from "@/lib/structural";
import { getBooksHealth } from "@/lib/books-health";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

/** Aporte de capital espelhando a action do módulo Capital (recebível RECEBIDO + movimentação). */
async function aporteCapital(beneficiaryId: string, name: string, amount: number, date: Date) {
  const accountId = await getDefaultAccountId();
  const capitalCenterId = await structuralCenterId("CAPITAL");
  await prisma.$transaction(async (tx) => {
    const receivable = await tx.receivable.create({
      data: {
        costCenterId: capitalCenterId,
        description: `Aporte de capital - ${name}`,
        category: "OUTROS",
        amount,
        dueDate: date,
        receivedDate: date,
        status: "RECEBIDO",
        accountId,
      },
    });
    await tx.capitalTransaction.create({
      data: { beneficiaryId, kind: "APORTE", amount, date, receivableId: receivable.id },
    });
  });
}

/** Pró-labore pago, espelhando a action do módulo Capital. */
async function proLabore(beneficiaryId: string, name: string, amount: number, date: Date) {
  const accountId = await getDefaultAccountId();
  const capitalCenterId = await structuralCenterId("CAPITAL");
  await prisma.$transaction(async (tx) => {
    const payable = await tx.payable.create({
      data: {
        costCenterId: capitalCenterId,
        description: `Pró-labore - ${name}`,
        category: "SALARIO",
        amount,
        dueDate: date,
        paymentDate: date,
        status: "PAGO",
        accountId,
      },
    });
    await tx.capitalTransaction.create({
      data: { beneficiaryId, kind: "PRO_LABORE", amount, date, payableId: payable.id },
    });
  });
}

async function limparBanco() {
  console.log("Limpando os dados de negócio (usuários e parâmetros ficam)...");
  // Ordem respeita as chaves estrangeiras: filhos antes dos pais.
  await prisma.cardInvoiceItem.deleteMany();
  await prisma.payableAttachment.deleteMany();
  await prisma.vehicleCost.deleteMany();
  await prisma.investmentAllocation.deleteMany();
  await prisma.capitalTransaction.deleteMany();
  await prisma.receivable.deleteMany();
  await prisma.payable.deleteMany();
  await prisma.paymentCombo.deleteMany();
  await prisma.accountTransfer.deleteMany();
  await prisma.recurringEntry.deleteMany();
  await prisma.partSale.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.preSale.deleteMany();
  await prisma.part.deleteMany();
  await prisma.vehicleAttachment.deleteMany();
  await prisma.vehicleAppraisalPhoto.deleteMany();
  await prisma.vehicleAppraisal.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.customer.deleteMany();
  // Fornecedores-espelho de usuários ficam (sincronizados com o cadastro de usuários).
  await prisma.supplier.deleteMany({ where: { userId: null } });
  await prisma.consortium.deleteMany();
  await prisma.fuelEntry.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.purchaseRequestAttachment.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  // A conta estrutural (Banco Neutro) é do sistema: nunca é apagada.
  await prisma.financialAccount.deleteMany({ where: { structural: false } });
  await prisma.capitalBeneficiary.deleteMany({ where: { userId: null } });
  await prisma.monthlyClosing.deleteMany();
  await prisma.stockInterestRun.deleteMany();
  await prisma.cashboxSession.deleteMany();
  await prisma.dashboardSnapshot.deleteMany();
}

export async function seedDemoData(): Promise<DemoSeedResult> {
  await limparBanco();

  console.log("Criando contas financeiras...");
  await ensureNeutralAccount();
  await prisma.financialAccount.create({
    data: {
      name: "Banco Demo S.A.",
      type: "BANCO",
      bankName: "Banco Demo",
      agency: "0001",
      accountNumber: "12345-6",
      isDefault: true,
    },
  });
  await prisma.financialAccount.create({
    data: { name: "Caixa da loja (dinheiro)", type: "CAIXA" },
  });
  const contaFinanceira = await prisma.financialAccount.create({
    data: {
      name: "Financeira Demo Crédito",
      type: "FINANCEIRA",
      returnTaxPercent: 15,
      notes: "Financeira fictícia para demonstrar o repasse de financiamento.",
    },
  });

  console.log("Criando sócios e aportes de capital...");
  const socioCarlos = await prisma.capitalBeneficiary.create({ data: { name: "Carlos Andrade (Sócio)" } });
  const socioFernanda = await prisma.capitalBeneficiary.create({ data: { name: "Fernanda Souza (Sócia)" } });
  await aporteCapital(socioCarlos.id, socioCarlos.name, 250000, daysAgo(120));
  await aporteCapital(socioFernanda.id, socioFernanda.name, 150000, daysAgo(115));
  await proLabore(socioCarlos.id, socioCarlos.name, 8000, daysAgo(20));

  console.log("Criando fornecedores...");
  const [fornecedorA, fornecedorB, fornecedorPecas] = await Promise.all([
    prisma.supplier.create({
      data: { name: "Auto Leilões Demo", document: "12.345.678/0001-90", phone: "(11) 4000-1111", email: "contato@autoleiloesdemo.com.br" },
    }),
    prisma.supplier.create({
      data: { name: "José Repasse de Veículos", document: "123.456.789-00", phone: "(11) 98888-2222" },
    }),
    prisma.supplier.create({
      data: { name: "Distribuidora AutoPeças Sul", document: "98.765.432/0001-11", phone: "(11) 4000-3333", email: "vendas@autopecassul.com.br" },
    }),
  ]);

  console.log("Criando clientes...");
  const [clienteAna, clienteBruno, clienteCarla, clienteDaniel] = await Promise.all([
    prisma.customer.create({ data: { name: "Ana Souza", document: "111.222.333-44", phone: "(11) 99111-1111", email: "ana.souza@email.com", address: "Rua das Flores, 120 - São Paulo/SP" } }),
    prisma.customer.create({ data: { name: "Bruno Lima", document: "222.333.444-55", phone: "(11) 99222-2222", email: "bruno.lima@email.com" } }),
    prisma.customer.create({ data: { name: "Carla Mendes", document: "333.444.555-66", phone: "(11) 99333-3333", email: "carla.mendes@email.com" } }),
    prisma.customer.create({ data: { name: "Daniel Ferreira", document: "444.555.666-77", phone: "(11) 99444-4444", email: "daniel.ferreira@email.com" } }),
  ]);

  console.log("Cadastrando veículos e financeiro de compra...");
  const vGol = await createVehicleWithPayable({
    brand: "Volkswagen",
    model: "Gol",
    version: "1.6 MSI",
    manufactureYear: 2019,
    modelYear: 2020,
    plate: "ABC1D23",
    chassi: "9BWZZZ377VT004251",
    renavam: "01126794570",
    color: "Branco",
    km: 45000,
    fuel: "Flex",
    transmission: "Manual",
    purchasePrice: 42000,
    salePrice: 52900,
    entryDate: daysAgo(60),
    supplierId: fornecedorA.id,
    alreadyPaid: true,
  });

  const vOnix = await createVehicleWithPayable({
    brand: "Chevrolet",
    model: "Onix",
    version: "1.0 Turbo LT",
    manufactureYear: 2021,
    modelYear: 2021,
    plate: "DEF4E56",
    chassi: "9BGKS48U0MG123456",
    renavam: "01234567890",
    color: "Prata",
    km: 28000,
    fuel: "Flex",
    transmission: "Automático",
    purchasePrice: 58000,
    salePrice: 69900,
    entryDate: daysAgo(40),
    supplierId: fornecedorB.id,
    alreadyPaid: true,
  });

  const vHb20 = await createVehicleWithPayable({
    brand: "Hyundai",
    model: "HB20",
    version: "1.0 Sense",
    manufactureYear: 2020,
    modelYear: 2020,
    plate: "GHI7F89",
    chassi: "9BHBG51CAKP123789",
    renavam: "00987654321",
    color: "Vermelho",
    km: 51000,
    fuel: "Flex",
    transmission: "Manual",
    purchasePrice: 39000,
    salePrice: 48900,
    entryDate: daysAgo(20),
    supplierId: fornecedorA.id,
    alreadyPaid: true,
  });

  const vCorolla = await createVehicleWithPayable({
    brand: "Toyota",
    model: "Corolla",
    version: "2.0 XEi",
    manufactureYear: 2022,
    modelYear: 2022,
    plate: "JKL0G12",
    chassi: "9BRBLWHEXK5123456",
    renavam: "01122334455",
    color: "Preto",
    km: 15000,
    fuel: "Flex",
    transmission: "CVT",
    purchasePrice: 98000,
    salePrice: 118900,
    entryDate: daysAgo(10),
    alreadyPaid: true,
  });

  const vStrada = await createVehicleWithPayable({
    brand: "Fiat",
    model: "Strada",
    version: "1.4 Endurance",
    manufactureYear: 2021,
    modelYear: 2022,
    plate: "MNO3H45",
    chassi: "9BD281A2XPY123456",
    renavam: "01599887766",
    color: "Branco",
    km: 32000,
    fuel: "Flex",
    transmission: "Manual",
    purchasePrice: 61000,
    salePrice: 74900,
    entryDate: daysAgo(5),
    supplierId: fornecedorB.id,
    alreadyPaid: false,
    dueDate: daysFromNow(15),
  });

  const vRenegade = await createVehicleWithPayable({
    brand: "Jeep",
    model: "Renegade",
    version: "1.3 T270 Sport",
    manufactureYear: 2023,
    modelYear: 2023,
    plate: "PQR6J78",
    chassi: "98861732XPK123456",
    renavam: "01677889900",
    color: "Cinza",
    km: 22000,
    fuel: "Flex",
    transmission: "Automático",
    purchasePrice: 89000,
    salePrice: 104900,
    entryDate: daysAgo(3),
    supplierId: fornecedorA.id,
    alreadyPaid: false,
    dueDate: daysFromNow(7),
  });

  console.log("Lançando custos de preparação dos veículos...");
  await addVehicleCostWithPayable({
    vehicleId: vGol.id,
    description: "Revisão e troca de óleo",
    category: "MECANICA",
    amount: 450,
    date: daysAgo(28),
    alreadyPaid: true,
  });
  await addVehicleCostWithPayable({
    vehicleId: vGol.id,
    description: "Transferência e documentação",
    category: "DOCUMENTACAO",
    amount: 380,
    date: daysAgo(26),
    alreadyPaid: true,
  });
  await addVehicleCostWithPayable({
    vehicleId: vCorolla.id,
    description: "Polimento e higienização interna",
    category: "ESTETICA",
    amount: 900,
    date: daysAgo(7),
    alreadyPaid: true,
  });
  await addVehicleCostWithPayable({
    vehicleId: vCorolla.id,
    description: "Troca de pneus dianteiros",
    category: "PREPARACAO",
    amount: 1400,
    date: daysAgo(4),
    alreadyPaid: false,
    dueDate: daysFromNow(20),
  });

  console.log("Registrando vendas de veículos...");
  await registerVehicleSale({
    vehicleId: vGol.id,
    customerId: clienteAna.id,
    saleDate: daysAgo(15),
    totalAmount: 52900,
    downPayment: 0,
    installmentsCount: 0,
    paymentMethod: "A_VISTA",
    sellerName: "Marcos Andrade",
    commissionAmount: 800,
  });

  await registerVehicleSale({
    vehicleId: vOnix.id,
    customerId: clienteBruno.id,
    saleDate: daysAgo(8),
    totalAmount: 69900,
    downPayment: 15000,
    installmentsCount: 12,
    paymentMethod: "PARCELADO",
    sellerName: "Marcos Andrade",
    notes: "Cliente pagou entrada, restante em 12x no carnê da loja.",
  });

  await registerVehicleSale({
    vehicleId: vHb20.id,
    customerId: clienteCarla.id,
    saleDate: daysAgo(2),
    totalAmount: 48900,
    downPayment: 0,
    installmentsCount: 0,
    paymentMethod: "FINANCIADO",
    sellerName: "Juliana Prado",
    financerName: "Financeira Demo Crédito",
    financedAmount: 35000,
    financerAccountId: contaFinanceira.id,
  });
  // Corolla, Strada e Renegade permanecem em estoque (vitrine/estoque).

  console.log("Reservando um veículo...");
  await prisma.vehicle.update({ where: { id: vCorolla.id }, data: { status: "RESERVADO" } });

  console.log("Publicando os veículos em estoque na vitrine...");
  await prisma.vehicle.updateMany({
    where: { id: { in: [vStrada.id, vRenegade.id] } },
    data: { published: true, publishedAt: new Date() },
  });

  console.log("Cadastrando peças...");
  const filtro = await createPartWithPayable({
    code: "FLT-001",
    name: "Filtro de óleo",
    quantity: 30,
    minQuantity: 10,
    costPrice: 18,
    salePrice: 39.9,
    supplierId: fornecedorPecas.id,
    alreadyPaid: true,
  });

  const pastilha = await createPartWithPayable({
    code: "PST-014",
    name: "Jogo de pastilhas de freio dianteira",
    quantity: 8,
    minQuantity: 6,
    costPrice: 95,
    salePrice: 189.9,
    supplierId: fornecedorPecas.id,
    alreadyPaid: false,
    dueDate: daysFromNow(10),
  });

  const bateria = await createPartWithPayable({
    code: "BAT-200",
    name: "Bateria 60Ah",
    quantity: 3,
    minQuantity: 4,
    costPrice: 320,
    salePrice: 549.9,
    supplierId: fornecedorPecas.id,
    alreadyPaid: true,
  });

  console.log("Registrando vendas de peças...");
  await registerPartSale({
    partId: filtro.id,
    customerId: clienteDaniel.id,
    quantity: 4,
    unitPrice: 39.9,
    saleDate: daysAgo(3),
    paymentMethod: "A_VISTA",
  });

  await registerPartSale({
    partId: pastilha.id,
    quantity: 2,
    unitPrice: 189.9,
    saleDate: daysAgo(1),
    paymentMethod: "A_VISTA",
    notes: "Venda de balcão",
  });

  // Peça vendida PARCELADA: a peça sai do almoxarifado agora e o cliente paga
  // depois. Fica no seed de propósito — é o caso que mais exige do farol
  // (margem reconhecida na venda, dinheiro só nas parcelas).
  await registerPartSale({
    partId: bateria.id,
    customerId: clienteDaniel.id,
    quantity: 1,
    unitPrice: 549.9,
    saleDate: daysAgo(2),
    paymentMethod: "PARCELADO",
    installmentsCount: 2,
    notes: "Bateria parcelada em 2x",
  });

  console.log("Criando lançamentos recorrentes...");
  await prisma.recurringEntry.create({
    data: {
      kind: "PAGAR",
      description: "Energia elétrica da loja",
      amount: 850,
      dayOfMonth: 20,
      categoryPagar: "DESPESA_OPERACIONAL",
      startDate: daysAgo(60),
    },
  });
  await prisma.recurringEntry.create({
    data: {
      kind: "PAGAR",
      description: "Assinatura portal de anúncios",
      amount: 499.9,
      dayOfMonth: 15,
      categoryPagar: "DESPESA_OPERACIONAL",
      startDate: daysAgo(90),
    },
  });
  await prisma.recurringEntry.create({
    data: {
      kind: "RECEBER",
      description: "Aluguel da sala anexa",
      amount: 1200,
      dayOfMonth: 8,
      categoryReceber: "OUTROS",
      startDate: daysAgo(120),
    },
  });

  console.log("Lançando despesas operacionais...");
  await createManualPayable({
    description: "Aluguel do pátio - mês corrente",
    category: "DESPESA_OPERACIONAL",
    amount: 6500,
    dueDate: daysFromNow(3),
    alreadyPaid: false,
  });

  await createManualPayable({
    description: "Aluguel do pátio - mês anterior",
    category: "DESPESA_OPERACIONAL",
    amount: 6500,
    dueDate: daysAgo(27),
    alreadyPaid: true,
  });

  console.log("Baixando o recebimento da venda à vista...");
  const contaPadrao = await getDefaultAccountId();
  const receivedGol = await prisma.receivable.findFirst({ where: { sale: { vehicleId: vGol.id } } });
  if (receivedGol && receivedGol.status !== "RECEBIDO") {
    await markReceivableReceived(receivedGol.id, daysAgo(15), contaPadrao ?? undefined);
  }
  // Comissão do vendedor da venda à vista: paga.
  const comissao = await prisma.payable.findFirst({
    where: { category: "COMISSAO", status: { not: "PAGO" } },
  });
  if (comissao) {
    await markPayablePaid(comissao.id, daysAgo(14), contaPadrao ?? undefined);
  }

  console.log("Criando uma avaliação de veículo...");
  await prisma.vehicleAppraisal.create({
    data: {
      plate: "STU9K01",
      brand: "Renault",
      model: "Kwid",
      version: "1.0 Zen",
      manufactureYear: 2022,
      modelYear: 2022,
      color: "Laranja",
      fuel: "Flex",
      transmission: "Manual",
      km: 30500,
      fipePrice: 42000,
      appraisalPrice: 35500,
      ownerAskingPrice: 38000,
      ownerName: "Paulo Ribeiro",
      ownerPhone: "(11) 97777-5555",
      notes: "Pintura ok, pneus meia-vida. Proprietário tem pressa na venda.",
      optionals: ["Ar-condicionado", "Direção elétrica", "Multimídia"],
    },
  });

  console.log("Conferindo o farol (integridade do financeiro)...");
  const health = await getBooksHealth();
  console.log(
    `  Check 1 (saldos): ${health.check1.ok ? "VERDE" : "VERMELHO"} · ` +
      `Contas ${health.check1.contasTotal.toFixed(2)} × Caixa ${health.check1.caixaGeral.toFixed(2)} × Extrato ${health.check1.extrato.toFixed(2)}`,
  );
  console.log(
    `  Check 2 (patrimônio × L/P): ${health.check2.ok ? "VERDE" : "VERMELHO"} · ` +
      `equação ${health.check2.equacao.toFixed(2)} × L/P ${health.check2.lucroPrejuizo.toFixed(2)}`,
  );
  if (!health.allOk) {
    throw new Error(
      "Farol divergente após a carga de demonstração — os lançamentos precisam ser revisados.",
    );
  }

  console.log("Carga de demonstração concluída com sucesso (farol verde).");

  const [veiculos, vendas, clientes, socios] = await Promise.all([
    prisma.vehicle.count(),
    prisma.sale.count(),
    prisma.customer.count(),
    prisma.capitalBeneficiary.count(),
  ]);
  return { veiculos, vendas, clientes, socios, farolVerde: health.allOk };
}
/** Resultado da carga, para a tela mostrar o que foi criado. */
export type DemoSeedResult = {
  veiculos: number;
  vendas: number;
  clientes: number;
  socios: number;
  farolVerde: boolean;
};
