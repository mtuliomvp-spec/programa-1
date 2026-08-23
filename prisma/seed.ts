/**
 * Carga de DEMONSTRAÇÃO pelo terminal:
 *   npm run db:seed
 *
 * A lógica mora em src/lib/demo-seed.ts, compartilhada com a tela /demo do
 * próprio sistema (que faz a mesma carga por um botão, sem terminal).
 *
 * NUNCA rode isto apontando para o banco de produção: a carga limpa os dados
 * de negócio antes de recriar os fictícios.
 */
import { prisma } from "../src/lib/prisma";
import { seedDemoData } from "../src/lib/demo-seed";

seedDemoData()
  .then((r) => {
    console.log(
      `Resumo: ${r.veiculos} veículos · ${r.vendas} vendas · ${r.clientes} clientes · ${r.socios} sócios.`,
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
