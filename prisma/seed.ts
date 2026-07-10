import { prisma } from "../src/lib/prisma";
import {
  createVehicleWithPayable,
  createPartWithPayable,
  registerVehicleSale,
  registerPartSale,
  markPayablePaid,
  markReceivableReceived,
  createManualPayable,
  addVehicleCostWithPayable,
} from "../src/lib/finance";

function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("Limpando banco de dados...");
  await prisma.vehicleCost.deleteMany();
  await prisma.receivable.deleteMany();
  await prisma.payable.deleteMany();
  await prisma.recurringEntry.deleteMany();
  await prisma.partSale.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.part.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();

  console.log("Criando fornecedores...");
  const [fornecedorA, fornecedorB, fornecedorPecas] = await Promise.all([
    prisma.supplier.create({
      data: { name: "Auto Leilões BR", document: "12.345.678/0001-90", phone: "(11) 4000-1111", email: "contato@autoleiloesbr.com" },
    }),
    prisma.supplier.create({
      data: { name: "José Repasse de Veículos", document: "123.456.789-00", phone: "(11) 98888-2222" },
    }),
    prisma.supplier.create({
      data: { name: "Distribuidora AutoPeças Sul", document: "98.765.432/0001-11", phone: "(11) 4000-3333", email: "vendas@autopecassul.com" },
    }),
  ]);

  console.log("Criando clientes...");
  const [clienteAna, clienteBruno, clienteCarla, clienteDaniel] = await Promise.all([
    prisma.customer.create({ data: { name: "Ana Souza", document: "111.222.333-44", phone: "(11) 99111-1111", email: "ana.souza@email.com" } }),
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
    color: "Prata",
    km: 28000,
    fuel: "Flex",
    transmission: "Automático",
    purchasePrice: 58000,
    salePrice: 69900,
    entryDate: daysAgo(40),
    supplierId: fornecedorB.id,
    alreadyPaid: false,
    dueDate: daysFromNow(5),
  });

  const vHb20 = await createVehicleWithPayable({
    brand: "Hyundai",
    model: "HB20",
    version: "1.0 Sense",
    manufactureYear: 2020,
    modelYear: 2020,
    plate: "GHI7F89",
    color: "Vermelho",
    km: 51000,
    fuel: "Flex",
    transmission: "Manual",
    purchasePrice: 39000,
    salePrice: 48900,
    entryDate: daysAgo(20),
    supplierId: fornecedorA.id,
    alreadyPaid: false,
    dueDate: daysFromNow(-3),
  });

  const vCorolla = await createVehicleWithPayable({
    brand: "Toyota",
    model: "Corolla",
    version: "2.0 XEi",
    manufactureYear: 2022,
    modelYear: 2022,
    plate: "JKL0G12",
    color: "Preto",
    km: 15000,
    fuel: "Flex",
    transmission: "CVT",
    purchasePrice: 98000,
    salePrice: 118900,
    entryDate: daysAgo(10),
    alreadyPaid: true,
  });

  await createVehicleWithPayable({
    brand: "Fiat",
    model: "Strada",
    version: "1.4 Endurance",
    manufactureYear: 2021,
    modelYear: 2022,
    plate: "MNO3H45",
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
    sellerName: "Marcos Vendedor",
  });

  await registerVehicleSale({
    vehicleId: vOnix.id,
    customerId: clienteBruno.id,
    saleDate: daysAgo(8),
    totalAmount: 69900,
    downPayment: 15000,
    installmentsCount: 12,
    paymentMethod: "PARCELADO",
    sellerName: "Marcos Vendedor",
    notes: "Cliente pagou entrada em dinheiro, restante em 12x no carnê da loja.",
  });

  await registerVehicleSale({
    vehicleId: vHb20.id,
    customerId: clienteCarla.id,
    saleDate: daysAgo(2),
    totalAmount: 48900,
    downPayment: 0,
    installmentsCount: 0,
    paymentMethod: "FINANCIADO",
    sellerName: "Juliana Vendedora",
  });
  // vCorolla e Strada permanecem em estoque para demonstrar o módulo de estoque

  console.log("Reservando um veículo...");
  await prisma.vehicle.update({ where: { id: vCorolla.id }, data: { status: "RESERVADO" } });

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

  await createPartWithPayable({
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
    paymentMethod: "PARCELADO",
    installmentsCount: 2,
    notes: "Venda de balcão",
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

  await createManualPayable({
    description: "Comissão vendedor Marcos",
    category: "COMISSAO",
    amount: 1800,
    dueDate: daysFromNow(2),
    alreadyPaid: false,
  });

  console.log("Confirmando alguns recebimentos/pagamentos já baixados...");
  const paidGolPayable = await prisma.payable.findFirst({ where: { vehicleId: vGol.id } });
  if (paidGolPayable && paidGolPayable.status !== "PAGO") {
    await markPayablePaid(paidGolPayable.id, daysAgo(59));
  }
  const receivedGol = await prisma.receivable.findFirst({ where: { sale: { vehicleId: vGol.id } } });
  if (receivedGol && receivedGol.status !== "RECEBIDO") {
    await markReceivableReceived(receivedGol.id, daysAgo(15));
  }

  console.log("Seed concluído com sucesso.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
