import { prisma } from "@/lib/prisma";
import { requireAction, requireModule } from "@/lib/guards";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import ImovelForm from "../ImovelForm";

export const dynamic = "force-dynamic";

export default async function NovoImovelPage() {
  await requireModule("imoveis");
  await requireAction("imoveis", "criar");
  const beneficiarios = await prisma.capitalBeneficiary.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Novo imóvel"
        action={
          <LinkButton href="/imoveis" variant="secondary">
            ← Imóveis
          </LinkButton>
        }
      />
      <Card>
        <CardHeader title="Dados do imóvel" description="Depois de salvar, anexe os documentos e ligue as contas a ele" />
        <div className="p-5">
          <ImovelForm beneficiarios={beneficiarios} />
        </div>
      </Card>
    </div>
  );
}
