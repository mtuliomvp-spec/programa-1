import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import CompanyDocuments from "./CompanyDocuments";

export const dynamic = "force-dynamic";

export default async function DocumentosEmpresaPage() {
  await requireModule("documentos_empresa");

  const [documents, canCriar, canExcluir] = await Promise.all([
    prisma.companyDocument.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, description: true, filename: true, mimeType: true, size: true, createdAt: true },
    }),
    userCan("documentos_empresa", "criar"),
    userCan("documentos_empresa", "excluir"),
  ]);

  return (
    <div>
      <PageHeader
        title="Documentos da empresa"
        description="Guarde aqui os documentos da loja — contrato social, cartão CNPJ, alvarás, certidões…"
      />

      <Card>
        <CardHeader
          title="Documentos"
          description="Anexe PDFs ou imagens dos documentos da empresa. Ficam guardados com segurança e podem ser abertos ou baixados quando precisar."
        />
        <CompanyDocuments documents={documents} canCriar={canCriar} canExcluir={canExcluir} />
      </Card>
    </div>
  );
}
