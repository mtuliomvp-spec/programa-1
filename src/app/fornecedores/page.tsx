import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import DeleteRowButton from "@/components/DeleteRowButton";
import { deleteSupplierAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { vehicles: true, parts: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description={`${suppliers.length} fornecedor(es) cadastrado(s)`}
        action={<LinkButton href="/fornecedores/novo">+ Novo fornecedor</LinkButton>}
      />
      <Card>
        {suppliers.length === 0 ? (
          <EmptyState title="Nenhum fornecedor cadastrado" action={<LinkButton href="/fornecedores/novo">+ Novo fornecedor</LinkButton>} />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Nome</Th>
                <Th>Documento</Th>
                <Th>Telefone</Th>
                <Th>E-mail</Th>
                <Th>Veículos / Peças</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {suppliers.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium text-slate-900">{s.name}</Td>
                  <Td>{s.document || "-"}</Td>
                  <Td>{s.phone || "-"}</Td>
                  <Td>{s.email || "-"}</Td>
                  <Td>
                    {s._count.vehicles} / {s._count.parts}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/fornecedores/${s.id}/editar`} className="text-sm font-medium text-slate-900 hover:underline">
                        Editar
                      </Link>
                      <DeleteRowButton id={s.id} action={deleteSupplierAction} confirmMessage={`Excluir o fornecedor ${s.name}?`} />
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
