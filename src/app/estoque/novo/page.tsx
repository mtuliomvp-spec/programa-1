import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import VehicleForm from "../VehicleForm";
import { getCompany } from "@/lib/company";
import { RENAVE_PRAZO_PADRAO } from "@/lib/renave";

export const dynamic = "force-dynamic";

export default async function NovoVeiculoPage() {
  await requireAction("estoque", "criar");
  const [suppliers, company] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
    getCompany(),
  ]);
  const renavePrazo = (company.renaveObrigatorioEm ?? RENAVE_PRAZO_PADRAO).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Novo veículo" description="Cadastre um veículo no estoque" />
      <Card>
        <CardHeader title="Dados do veículo" description="Campos marcados com * são obrigatórios" />
        <div className="p-5">
          <VehicleForm suppliers={suppliers} renavePrazo={renavePrazo} />
        </div>
      </Card>
    </div>
  );
}
