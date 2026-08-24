import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
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
  const [allParts, comprasBrutas] = await Promise.all([
    prisma.part.findMany({ orderBy: { name: "asc" }, include: { supplier: true } }),
    // Compras de peça, da mais recente para a mais antiga. O unitário é o valor
    // do título dividido pela quantidade daquela compra.
    prisma.payable.findMany({
      where: { partId: { not: null }, partQuantity: { gt: 0 } },
      orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }],
      select: { partId: true, dueDate: true, amount: true, partQuantity: true },
    }),
  ]);

  // Últimas compras de cada peça (as 3 mais recentes) para a coluna do histórico.
  const ULTIMAS = 3;
  const comprasPorPeca = new Map<string, { data: Date; unitario: number; quantidade: number }[]>();
  for (const c of comprasBrutas) {
    const lista = comprasPorPeca.get(c.partId!) ?? [];
    if (lista.length < ULTIMAS) {
      lista.push({
        data: c.dueDate,
        unitario: c.amount / (c.partQuantity as number),
        quantidade: c.partQuantity as number,
      });
      comprasPorPeca.set(c.partId!, lista);
    }
  }
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
                <Th>Custo médio</Th>
                <Th>Últimas compras (unitário)</Th>
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
                  <Td className="whitespace-nowrap text-xs">
                    {(comprasPorPeca.get(p.id) ?? []).length === 0 ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      (comprasPorPeca.get(p.id) ?? []).map((c, i) => (
                        <span key={i} className="mr-2 inline-block">
                          <strong className={i === 0 ? "text-slate-900" : "text-slate-600"}>
                            {formatCurrency(c.unitario)}
                          </strong>{" "}
                          <span className="text-slate-400">
                            ({c.quantidade} un. · {formatDate(c.data).slice(0, 5)})
                          </span>
                        </span>
                      ))
                    )}
                  </Td>
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
