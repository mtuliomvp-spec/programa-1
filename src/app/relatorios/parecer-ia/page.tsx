import { requireModule } from "@/lib/guards";
import { getParecerConfig } from "@/lib/parecer-ia";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import ParecerIAButton from "@/components/ParecerIAButton";

export const dynamic = "force-dynamic";

export default async function ParecerIAPage() {
  await requireModule("relatorios");
  const config = await getParecerConfig();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Parecer IA"
        description="Análise técnica automatizada da gestão da loja, gerada por inteligência artificial em PDF"
      />

      <Card>
        <CardHeader title="Parecer geral da loja" />
        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-600">
            A IA analisa os números da MVP (saúde financeira, giro de estoque, desempenho de vendas e
            margem, caixa e inadimplência) dos últimos 12 meses e emite um parecer com riscos e
            recomendações práticas — baixado em PDF.
          </p>

          {config.configured ? (
            <ParecerIAButton mode="global" />
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              A IA ainda não está configurada. Um administrador deve cadastrar a chave de API em{" "}
              <a href="/parametros" className="font-medium underline">
                Parâmetros › Parecer IA
              </a>
              .
            </div>
          )}

          <p className="text-xs text-slate-400">
            O parecer é apenas informativo e de apoio à decisão. Cada emissão gera um código de
            verificação (hash) impresso no rodapé do PDF. O uso da IA tem custo por geração, cobrado
            pelo provedor da chave.
          </p>
        </div>
      </Card>
    </div>
  );
}
