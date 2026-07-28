import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { matchesSearch, inValueRange } from "@/lib/search";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import Can from "@/components/Can";

export const dynamic = "force-dynamic";

export default async function PecasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; min?: string; max?: string }>;
}) {
  const { q: qParam, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const allParts = await prisma.part.findMany({ orderBy: { name: "asc" }, include: { supplier: true } });
  const parts = allParts.filter(
    (p) =>
      matchesSearch(
        q,
        p.code,
        p.name,
        p.quantity,
        p.costPrice,
        formatCurrency(p.costPrice),
        p.salePrice,
        formatCurrency(p.salePrice),
        p.supplier?.name,
      ) && inValueRange(p.salePrice, min, max),
  );
  const stockValue = parts.reduce((sum, p) => sum + p.quantity * p.costPrice, 0);
  const lowStock = parts.filter((p) => p.quantity <= p.minQuantity);

  return (
    <div>
      <PageHeader
        title="Peças"
        description={`${parts.length} peça(s) · valor em estoque: ${formatCurrency(stockValue)}${lowStock.length ? ` · ${lowStock.length} com estoque baixo` : ""}`}
        action={
          <Can module="pecas" action="criar">
            <LinkButton href="/pecas/novo">+ Nova peça</LinkButton>
          </Can>
        }
      />
      <ReportToolbar
        basePath="/pecas"
        printTitle="Peças"
        q={q}
        placeholder="Buscar (código, peça, fornecedor, valor...)"
        value
        min={min}
        max={max}
      />
      <Card>
        {parts.length === 0 ? (
          <EmptyState
            title={q ? "Nada encontrado para a busca" : "Nenhuma peça cadastrada"}
            action={
              q ? undefined : (
                <Can module="pecas" action="criar">
                  <LinkButton href="/pecas/novo">+ Nova peça</LinkButton>
                </Can>
              )
            }
          />
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
