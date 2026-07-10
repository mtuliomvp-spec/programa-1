import { PageHeader } from "@/components/ui";
import ReconcileClient from "./ReconcileClient";

export const dynamic = "force-dynamic";

export default function ConciliacaoPage() {
  return (
    <div>
      <PageHeader
        title="Conciliação bancária"
        description="Importe o extrato do banco (arquivo OFX) e confira com o que está no sistema"
      />
      <ReconcileClient />
    </div>
  );
}
