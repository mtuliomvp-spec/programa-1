import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/guards";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import EditPayableForm from "./EditPayableForm";

export const dynamic = "force-dynamic";

const categoryLabelByEnum: Record<string, string> = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  DEVOLUCAO_CLIENTE: "Devolução ao cliente",
  OUTROS: "Outros",
};

export default async function EditarPayablePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAction("financeiro", "criar");
  const { id } = await params;

  const payable = await prisma.payable.findUnique({
    where: { id },
    include: { costCenter: { select: { key: true } } },
  });
  if (!payable) notFound();
  // Título pago não é editável (reverter antes); os demais podem.
  if (payable.status === "PAGO") redirect("/financeiro/a-pagar");

  const [suppliers, stockVehicles, beneficiaries] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vehicle.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: { id: true, brand: true, model: true, plate: true, status: true },
    }),
    prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const vehicles = stockVehicles.map((v) => ({
    id: v.id,
    label: `${v.brand} ${v.model} · ${v.plate}${v.status === "VENDIDO" ? " (vendido)" : ""}`,
  }));

  // Fluxo atual: veículo → Veículos; beneficiário → Capital; senão o centro estrutural.
  const structuralKeys = ["CAPITAL", "VEICULOS", "ADMINISTRATIVO"] as const;
  const centerKey = structuralKeys.find((k) => k === payable.costCenter?.key);
  const flow = payable.vehicleId
    ? "VEICULOS"
    : payable.capitalBeneficiaryId
      ? "CAPITAL"
      : centerKey || "ADMINISTRATIVO";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Editar título ${String(payable.orderNumber).padStart(4, "0")}`}
        action={
          <LinkButton href="/financeiro/a-pagar" variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />
      <Card>
        <CardHeader title="Dados do título" />
        <div className="p-5">
          <EditPayableForm
            payable={{
              id: payable.id,
              description: payable.description,
              categoryLabel: payable.categoryLabel || categoryLabelByEnum[payable.category] || "Outros",
              documentNumber: payable.documentNumber,
              amount: payable.amount,
              dueDate: payable.dueDate.toISOString(),
              supplierId: payable.supplierId,
              notes: payable.notes,
              structuralKey: flow,
              vehicleId: payable.vehicleId,
              capitalBeneficiaryId: payable.capitalBeneficiaryId,
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
