import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModuleAny } from "@/lib/guards";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * "Meu capital": leva o usuário ao extrato do beneficiário ligado a ele. O
 * vínculo usuário ↔ beneficiário é feito pelo administrador na ficha do
 * beneficiário (Capital dos sócios).
 */
export default async function MeuCapitalPage() {
  const user = await requireModuleAny(["meu_capital", "administrativo"]);
  const beneficiary = await prisma.capitalBeneficiary.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (beneficiary) redirect(`/capital/${beneficiary.id}`);

  return (
    <div className="mx-auto max-w-lg py-16">
      <Card className="p-8 text-center">
        <p className="text-4xl">💼</p>
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Seu usuário ainda não está ligado a um capital</h1>
        <p className="mt-2 text-sm text-slate-600">
          Peça ao administrador para abrir o seu nome em <strong>Capital dos sócios</strong> e, em{" "}
          <strong>Usuário vinculado</strong>, escolher o seu usuário. Depois é só recarregar esta página.
        </p>
      </Card>
    </div>
  );
}
