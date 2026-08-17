import { notFound } from "next/navigation";
import { requireAction } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { parseChecklist, parseOptionals } from "@/lib/appraisals";
import AppraisalForm from "../../AppraisalForm";

export const dynamic = "force-dynamic";

export default async function EditarAvaliacaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAction("avaliacoes", "editar");
  const { id } = await params;

  const a = await prisma.vehicleAppraisal.findUnique({ where: { id } });
  if (!a) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Editar avaliação"
        action={<LinkButton href={`/avaliacoes/${a.id}`} variant="secondary">← Voltar</LinkButton>}
      />
      <Card>
        <CardHeader title="Dados da avaliação" />
        <div className="p-5">
          <AppraisalForm
            initial={{
              id: a.id,
              plate: a.plate,
              brand: a.brand,
              model: a.model,
              version: a.version,
              manufactureYear: a.manufactureYear,
              modelYear: a.modelYear,
              color: a.color,
              fuel: a.fuel,
              transmission: a.transmission,
              km: a.km,
              chassi: a.chassi,
              renavam: a.renavam,
              fipePrice: a.fipePrice,
              fipeModelo: a.fipeModelo,
              appraisalPrice: a.appraisalPrice,
              notes: a.notes,
              ownerName: a.ownerName,
              ownerPhone: a.ownerPhone,
              optionals: parseOptionals(a.optionals),
              checklist: parseChecklist(a.checklist),
            }}
          />
        </div>
      </Card>
    </div>
  );
}
