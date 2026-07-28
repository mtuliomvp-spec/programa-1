import { PageHeader } from "@/components/ui";
import { getActiveAccounts } from "@/lib/accounts";
import { requireAction } from "@/lib/guards";
import ReconcileClient from "./ReconcileClient";

export const dynamic = "force-dynamic";

export default async function ConciliacaoPage() {
  await requireAction("financeiro", "conciliar");
  const accounts = await getActiveAccounts();
  return (
    <div>
      <PageHeader
        title="Conciliação bancária"
        description="Importe o extrato do banco (arquivo OFX) e confira com o que está no sistema"
      />
      <ReconcileClient accounts={accounts} />
    </div>
  );
}
