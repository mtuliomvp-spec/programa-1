import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { matchesSearch } from "@/lib/search";
import { countDuplicated } from "@/lib/person-keys";
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import DeleteRowButton from "@/components/DeleteRowButton";
import Can from "@/components/Can";
import { userCan } from "@/lib/guards";
import { deleteCustomerAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q || "").trim();
  const [canEditar, canExcluir, canUnificar] = await Promise.all([
    userCan("cadastros", "editar"),
    userCan("cadastros", "excluir"),
    userCan("cadastros", "unificar"),
  ]);
  const allCustomers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { sales: true, partSales: true } } },
  });
  const customers = q
    ? allCustomers.filter((c) => matchesSearch(q, c.name, c.document, c.phone, c.email))
    : allCustomers;
  // A lista já está carregada — contar os repetidos aqui não custa consulta.
  const duplicated = canUnificar ? countDuplicated(allCustomers) : 0;

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={`${customers.length} cliente(s) cadastrado(s)`}
        action={
          <Can module="cadastros" action="criar">
            <LinkButton href="/clientes/novo">+ Novo cliente</LinkButton>
          </Can>
        }
      />
      <ReportToolbar
        basePath="/clientes"
        printTitle="Clientes"
        q={q}
        placeholder="Buscar (nome, documento, telefone, e-mail)"
      />
      {duplicated > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>{duplicated} cadastros repetidos</strong> — o mesmo cliente aparece mais de uma
          vez.{" "}
          <Link href="/clientes/unificar" className="font-medium underline">
            Conferir e unificar →
          </Link>
        </div>
      ) : null}
      <Card>
        {customers.length === 0 ? (
          <EmptyState
            title={q ? "Nada encontrado para a busca" : "Nenhum cliente cadastrado"}
            action={
              q ? undefined : (
                <Can module="cadastros" action="criar">
                  <LinkButton href="/clientes/novo">+ Novo cliente</LinkButton>
                </Can>
              )
            }
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Nome</Th>
                <Th>Documento</Th>
                <Th>Telefone</Th>
                <Th>E-mail</Th>
                <Th>Compras</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {customers.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td>{c.document || "-"}</Td>
                  <Td>{c.phone || "-"}</Td>
                  <Td>{c.email || "-"}</Td>
                  <Td>{c._count.sales + c._count.partSales}</Td>
                  <Td>
                    <div className="flex items-center justify-end gap-3">
                      {canEditar ? (
                        <Link href={`/clientes/${c.id}/editar`} className="text-sm font-medium text-slate-900 hover:underline">
                          Editar
                        </Link>
                      ) : null}
                      {canExcluir ? (
                        <DeleteRowButton id={c.id} action={deleteCustomerAction} confirmMessage={`Excluir o cliente ${c.name}?`} />
                      ) : null}
                    </div>
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
