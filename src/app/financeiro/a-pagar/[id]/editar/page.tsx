import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActionAny } from "@/lib/guards";
import { listCategoryNames } from "@/lib/categories";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import EditPayableForm from "./EditPayableForm";
import CardInvoiceItems from "./CardInvoiceItems";
import ImportFaturaPdf from "./ImportFaturaPdf";

export const dynamic = "force-dynamic";
// A importação de fatura em PDF chama a IA e pode levar minutos.
export const maxDuration = 300;

const categoryLabelByEnum: Record<string, string> = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  DEVOLUCAO_CLIENTE: "Devolução ao cliente",
  DEVOLUCAO_PROPRIETARIO: "Devolução ao proprietário",
  OUTROS: "Outros",
};

export default async function EditarPayablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await requireActionAny([
    ["financeiro", "criar"],
    ["financeiro", "editar"],
    ["combos", "criar"],
  ]);
  const { id } = await params;
  const { returnTo } = await searchParams;
  // Destino seguro de retorno (só caminhos internos do financeiro).
  const safeReturn = returnTo && returnTo.startsWith("/financeiro/") ? returnTo : "/financeiro/a-pagar";

  const payable = await prisma.payable.findUnique({
    where: { id },
    include: {
      costCenter: { select: { key: true } },
      cardItems: {
        orderBy: { createdAt: "asc" },
        include: {
          vehicle: { select: { brand: true, model: true, plate: true } },
          capitalBeneficiary: { select: { name: true } },
        },
      },
    },
  });
  if (!payable) notFound();
  // Título pago não é editável (reverter antes); os demais podem.
  if (payable.status === "PAGO") redirect(safeReturn);

  const [suppliers, stockVehicles, beneficiaries, categories] = await Promise.all([
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
    listCategoryNames("DESPESA"),
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
          <LinkButton href={safeReturn} variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />
      {payable.cardInvoice ? (
        <Card className="mb-4">
          <CardHeader
            title="💳 Lançamentos da fatura"
            description="Digite os itens como estão na fatura do cartão — cada um no seu fluxo. O valor do título é sempre a soma dos lançamentos."
          />
          <div className="p-5">
            <ImportFaturaPdf payableId={payable.id} hasItems={payable.cardItems.length > 0} />
            <CardInvoiceItems
              payableId={payable.id}
              // Título pago nem chega aqui (redirect acima) — sempre editável.
              editable
              items={payable.cardItems.map((i) => ({
                id: i.id,
                description: i.description,
                amount: i.amount,
                structuralKey: i.structuralKey,
                vehicleId: i.vehicleId,
                capitalBeneficiaryId: i.capitalBeneficiaryId,
                who: i.vehicle
                  ? `${i.vehicle.brand} ${i.vehicle.model} · ${i.vehicle.plate}`
                  : i.capitalBeneficiary?.name || null,
              }))}
              vehicles={vehicles}
              beneficiaries={beneficiaries.map((b) => ({ id: b.id, label: b.name }))}
            />
          </div>
        </Card>
      ) : null}

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
            categories={categories}
            returnTo={safeReturn}
          />
        </div>
      </Card>
    </div>
  );
}
