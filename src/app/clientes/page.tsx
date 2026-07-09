import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import DeleteRowButton from "@/components/DeleteRowButton";
import { deleteCustomerAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { sales: true, partSales: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={`${customers.length} cliente(s) cadastrado(s)`}
        action={<LinkButton href="/clientes/novo">+ Novo cliente</LinkButton>}
      />
      <Card>
        {customers.length === 0 ? (
          <EmptyState title="Nenhum cliente cadastrado" action={<LinkButton href="/clientes/novo">+ Novo cliente</LinkButton>} />
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
                      <Link href={`/clientes/${c.id}/editar`} className="text-sm font-medium text-slate-900 hover:underline">
                        Editar
                      </Link>
                      <DeleteRowButton id={c.id} action={deleteCustomerAction} confirmMessage={`Excluir o cliente ${c.name}?`} />
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
