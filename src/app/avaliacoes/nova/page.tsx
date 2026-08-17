import { requireAction } from "@/lib/guards";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import AppraisalForm from "../AppraisalForm";

export const dynamic = "force-dynamic";

export default async function NovaAvaliacaoPage() {
  await requireAction("avaliacoes", "criar");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nova avaliação"
        description="Registre a avaliação do veículo — inclusive as fotos, enviadas ao salvar."
        action={<LinkButton href="/avaliacoes" variant="secondary">← Voltar</LinkButton>}
      />
      <Card>
        <CardHeader title="Dados da avaliação" />
        <div className="p-5">
          <AppraisalForm />
        </div>
      </Card>
    </div>
  );
}
