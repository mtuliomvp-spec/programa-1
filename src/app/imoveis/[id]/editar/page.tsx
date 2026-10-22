import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAction, requireModule } from "@/lib/guards";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import ImovelForm from "../../ImovelForm";

export const dynamic = "force-dynamic";

export default async function EditarImovelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("imoveis");
  await requireAction("imoveis", "editar");
  const { id } = await params;
  const [imovel, beneficiarios] = await Promise.all([
    prisma.imovel.findUnique({ where: { id } }),
    prisma.capitalBeneficiary.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!imovel) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Editar imóvel"
        action={
          <LinkButton href={`/imoveis/${id}`} variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />
      <Card>
        <CardHeader title="Dados do imóvel" />
        <div className="p-5">
          <ImovelForm inicial={imovel} beneficiarios={beneficiarios} />
        </div>
      </Card>
    </div>
  );
}
