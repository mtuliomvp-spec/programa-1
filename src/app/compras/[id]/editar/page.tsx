import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { formatRequestNumber } from "@/lib/format";
import { listCategoryNames, CATEGORIA_PAGAR_LABEL } from "@/lib/categories";
import EditRequestForm from "./EditRequestForm";

export const dynamic = "force-dynamic";

export default async function EditarSolicitacaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAction("compras", "criar");
  const { id } = await params;

  const request = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { payables: { select: { status: true } }, supplier: { select: { name: true } } },
  });
  if (!request) notFound();
  // Edita pendente ou aprovada. Depois de paga (alguma parcela), bloqueia.
  const podeEditar =
    request.status === "PENDENTE" ||
    (request.status === "APROVADA" && !request.payables.some((p) => p.status === "PAGO"));
  if (!podeEditar) redirect(`/compras/${id}`);

  // Troca de solicitante: só o ADMIN vê o campo (a action valida de novo).
  const sessionUser = await getSessionUser();
  const isAdmin = sessionUser?.role === "ADMIN";
  const requesters = isAdmin
    ? (
        await prisma.user.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { name: true },
        })
      ).map((u) => u.name)
    : null;

  const [suppliers, stockVehicles, beneficiaries, categories] = await Promise.all([
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
    listCategoryNames("DESPESA"),
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
              categoryLabel: request.categoryLabel || CATEGORIA_PAGAR_LABEL[request.category],
              installmentsCount: request.installmentsCount,
              installmentPeriod: request.installmentPeriod,
              installmentDays: request.installmentDays,
              structuralKey: request.structuralKey,
              vehicleId: request.vehicleId,
              capitalBeneficiaryId: request.capitalBeneficiaryId,
              supplierName: request.supplier?.name ?? "",
              requestedBy: request.requestedBy,
            }}
            requesters={requesters}
            suppliers={suppliers}
            vehicles={vehicles}
            beneficiaries={beneficiaries}
            categories={categories}
          />
        </div>
      </Card>
    </div>
  );
}
