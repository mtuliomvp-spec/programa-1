import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/guards";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { formatRequestNumber } from "@/lib/format";
import EditRequestForm from "./EditRequestForm";

export const dynamic = "force-dynamic";

export default async function EditarSolicitacaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAction("compras", "criar");
  const { id } = await params;

  const request = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!request) notFound();
  // Só dá para editar enquanto pendente (depois de aprovada o espelho já existe).
  if (request.status !== "PENDENTE") redirect(`/compras/${id}`);

  const [suppliers, stockVehicles, beneficiaries] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vehicle.findMany({
      where: { status: "ESTOQUE", intermediation: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, brand: true, model: true, plate: true },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const vehicles = stockVehicles.map((v) => ({ id: v.id, label: `${v.brand} ${v.model} · ${v.plate}` }));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Editar solicitação ${formatRequestNumber(request.seq, request.year)}`}
        action={
          <LinkButton href={`/compras/${id}`} variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />
      <Card>
        <CardHeader title="Dados da solicitação" />
        <div className="p-5">
          <EditRequestForm
            request={{
              id: request.id,
              description: request.description,
              details: request.details,
              estimatedAmount: request.estimatedAmount,
              dueDate: request.dueDate ? request.dueDate.toISOString() : null,
              documentNumber: request.documentNumber,
              category: request.category,
              installmentsCount: request.installmentsCount,
              installmentPeriod: request.installmentPeriod,
              installmentDays: request.installmentDays,
              structuralKey: request.structuralKey,
              vehicleId: request.vehicleId,
              capitalBeneficiaryId: request.capitalBeneficiaryId,
              supplierId: request.supplierId,
            }}
            suppliers={suppliers}
            vehicles={vehicles}
            beneficiaries={beneficiaries}
          />
        </div>
      </Card>
    </div>
  );
}
