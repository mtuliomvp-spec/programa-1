import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PecasPage() {
  const parts = await prisma.part.findMany({ orderBy: { name: "asc" }, include: { supplier: true } });
  const stockValue = parts.reduce((sum, p) => sum + p.quantity * p.costPrice, 0);
  const lowStock = parts.filter((p) => p.quantity <= p.minQuantity);

  return (
    <div>
      <PageHeader
        title="Peças"
        description={`${parts.length} peça(s) · valor em estoque: ${formatCurrency(stockValue)}${lowStock.length ? ` · ${lowStock.length} com estoque baixo` : ""}`}
        action={<LinkButton href="/pecas/novo">+ Nova peça</LinkButton>}
      />
      <Card>
        {parts.length === 0 ? (
          <EmptyState title="Nenhuma peça cadastrada" action={<LinkButton href="/pecas/novo">+ Nova peça</LinkButton>} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Código</Th>
                <Th>Peça</Th>
                <Th>Qtd.</Th>
                <Th>Custo</Th>
                <Th>Venda</Th>
                <Th>Fornecedor</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {parts.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-mono text-xs">{p.code}</Td>
                  <Td className="font-medium text-slate-900">{p.name}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span>{p.quantity}</span>
                      {p.quantity <= p.minQuantity ? <Badge tone="danger">baixo</Badge> : null}
                    </div>
                  </Td>
                  <Td>{formatCurrency(p.costPrice)}</Td>
                  <Td>{formatCurrency(p.salePrice)}</Td>
                  <Td>{p.supplier?.name || "-"}</Td>
                  <Td>
                    <Link href={`/pecas/${p.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                      Ver detalhes
                    </Link>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
