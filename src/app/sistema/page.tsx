import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import SystemActions from "./SystemActions";
import { isDemoMode } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

export default async function SistemaPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") redirect("/");

  const [vehicles, sales, payables, receivables] = await Promise.all([
    prisma.vehicle.count(),
    prisma.sale.count(),
    prisma.payable.count(),
    prisma.receivable.count(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Sistema"
        description="Backup e limpeza dos dados (somente administradores)"
      />

      <Card>
        <CardHeader
          title="Backup e dados"
          description="Guarde uma cópia dos dados ou recomece do zero"
        />
        <div className="p-5">
          <SystemActions
            demo={isDemoMode()}
            backupsInfo={`Hoje o sistema tem ${vehicles} veículo(s), ${sales} venda(s), ${payables} conta(s) a pagar e ${receivables} a receber.`}
          />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Como usar" />
        <div className="space-y-2 p-5 text-sm text-slate-600">
          <p>
            <strong>💾 Backup completo:</strong> baixa um arquivo com todas as tabelas e documentos
            do sistema, como estão. Tem dados reais — guarde num lugar seguro. Recomendado antes de
            qualquer mudança grande.
          </p>
          <p>
            <strong>🎭 Backup para demonstração:</strong> o mesmo backup, mas com nomes, CPF/CNPJ,
            telefones, e-mails, endereços, placas, chassis, Renavam, contas bancárias e observações
            disfarçados, e os documentos anexados trocados por um PDF de exemplo. Os valores, as
            datas e a estrutura ficam. Só a instalação de demonstração aceita este arquivo — e ela
            não aceita o completo.
          </p>
          <p>
            <strong>🗑️ Zerar dados:</strong> apaga todos os dados operacionais para recomeçar do
            zero, mantendo os usuários e os parâmetros da empresa. Use ao final de um período de
            testes, por exemplo. Faça um backup antes!
          </p>
        </div>
      </Card>
    </div>
  );
}
