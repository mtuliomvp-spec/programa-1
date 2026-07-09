import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import EditPartForm from "./EditPartForm";

export const dynamic = "force-dynamic";

export default async function EditarPecaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [part, suppliers] = await Promise.all([
    prisma.part.findUnique({ where: { id } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!part) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Editar peça" description={part.name} />
      <Card>
        <CardHeader
          title="Dados da peça"
          description="A quantidade em estoque é alterada pelas telas de repor estoque e vender, na página de detalhes."
        />
        <div className="p-5">
          <EditPartForm part={part} suppliers={suppliers} />
        </div>
      </Card>
    </div>
  );
}
