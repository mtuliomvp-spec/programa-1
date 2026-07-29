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

  const payable = await prisma.payable.findUnique({ where: { id } });
  if (!payable) notFound();
  // Só edita título manual e ainda não pago (os demais têm origem em outra operação).
  const hasOrigin =
    payable.vehicleId ||
    payable.partId ||
    payable.recurringId ||
    payable.consortiumId ||
    payable.employeeId ||
    payable.saleId ||
    payable.purchaseRequestId;
  if (payable.status === "PAGO" || hasOrigin) redirect("/financeiro/a-pagar");

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

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
            }}
            suppliers={suppliers}
          />
        </div>
      </Card>
    </div>
  );
}
