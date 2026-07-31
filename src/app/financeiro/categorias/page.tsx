import { PageHeader } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import { listCategories } from "@/lib/categories";
import CategoriesManager from "./CategoriesManager";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  await requireAction("financeiro", "criar");
  const [despesa, receita] = await Promise.all([
    listCategories("DESPESA"),
    listCategories("RECEITA"),
  ]);

  return (
    <div>
      <PageHeader
        title="Categorias"
        description="Cadastre, renomeie e exclua as categorias usadas nos lançamentos. Renomear atualiza também os lançamentos passados."
      />
      <CategoriesManager despesa={despesa} receita={receita} />
    </div>
  );
}
