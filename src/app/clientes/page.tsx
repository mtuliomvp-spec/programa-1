import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { matchesSearch } from "@/lib/search";
import { Card, EmptyState, Input, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import DeleteRowButton from "@/components/DeleteRowButton";
import { deleteCustomerAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q || "").trim();
  const allCustomers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { sales: true, partSales: true } } },
  });
  const customers = q
    ? allCustomers.filter((c) => matchesSearch(q, c.name, c.document, c.phone, c.email))
    : allCustomers;

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={`${customers.length} cliente(s) cadastrado(s)`}
        action={<LinkButton href="/clientes/novo">+ Novo cliente</LinkButton>}
      />
      <Card className="mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input name="q" defaultValue={q} placeholder="Buscar em todos os campos (nome, documento, telefone, e-mail)" />
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Buscar
          </button>
          {q ? <LinkButton variant="secondary" href="/clientes">Limpar</LinkButton> : null}
        </form>
      </Card>
      <Card>
        {customers.length === 0 ? (
          <EmptyState
            title={q ? "Nada encontrado para a busca" : "Nenhum cliente cadastrado"}
            action={q ? undefined : <LinkButton href="/clientes/novo">+ Novo cliente</LinkButton>}
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
