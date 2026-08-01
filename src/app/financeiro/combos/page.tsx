import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAction, userCan } from "@/lib/guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import NewComboForm from "./NewComboForm";

export const dynamic = "force-dynamic";

const statusInfo = {
  ABERTO: { label: "Aberto", tone: "info" as const },
  SOLICITADO: { label: "Aguardando pagamento", tone: "warning" as const },
  PAGO: { label: "Pago", tone: "success" as const },
  CANCELADO: { label: "Cancelado", tone: "default" as const },
};

export default async function CombosPage() {
  await requireAction("combos", "visualizar");
  const canManage = await userCan("combos", "criar");
  const combos = await prisma.paymentCombo.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { user: { select: { name: true } }, payables: { select: { amount: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Combos de pagamento"
        description="Junte vários títulos a pagar num combo e quite todos de uma vez, com um borderô."
      />

      {canManage ? (
        <Card className="mb-4">
          <div className="p-4">
            <NewComboForm />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Combos" description="Abertos e solicitados aparecem primeiro" />
        {combos.length === 0 ? (
          <EmptyState title="Nenhum combo ainda" description="Crie um combo e adicione títulos a pagar nele." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Nome</Th>
                <Th>Beneficiário</Th>
                <Th className="text-right">Títulos</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <tbody>
              {combos.map((c) => {
                const total = c.payables.reduce((s, p) => s + p.amount, 0);
                const info = statusInfo[c.status];
                return (
                  <Tr key={c.id}>
                    <Td className="font-medium text-slate-900">
                      <Link href={`/financeiro/combos/${c.id}`} className="text-blue-700 hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-xs font-normal text-slate-400">criado em {formatDate(c.createdAt)}</span>
                    </Td>
                    <Td>{c.user?.name || "—"}</Td>
                    <Td className="text-right tabular-nums">{c.payables.length}</Td>
                    <Td className="text-right tabular-nums">{formatCurrency(total)}</Td>
                    <Td>
                      <Badge tone={info.tone}>{info.label}</Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
