import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { matchesSearch } from "@/lib/search";
import { Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import DeleteRowButton from "@/components/DeleteRowButton";
import Can from "@/components/Can";
import { userCan } from "@/lib/guards";
import { deleteSupplierAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q || "").trim();
  const [canEditar, canExcluir] = await Promise.all([
    userCan("cadastros", "editar"),
    userCan("cadastros", "excluir"),
  ]);
  const allSuppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { vehicles: true, parts: true } } },
  });
  const suppliers = q
    ? allSuppliers.filter((s) => matchesSearch(q, s.name, s.document, s.phone, s.email))
    : allSuppliers;

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        description={`${suppliers.length} fornecedor(es) cadastrado(s)`}
        action={
          <Can module="cadastros" action="criar">
            <LinkButton href="/fornecedores/novo">+ Novo fornecedor</LinkButton>
          </Can>
        }
      />
      <ReportToolbar
        basePath="/fornecedores"
        printTitle="Fornecedores"
        q={q}
        placeholder="Buscar (nome, documento, telefone, e-mail)"
      />
      <Card>
        {suppliers.length === 0 ? (
          <EmptyState
            title={q ? "Nada encontrado para a busca" : "Nenhum fornecedor cadastrado"}
            action={
              q ? undefined : (
                <Can module="cadastros" action="criar">
                  <LinkButton href="/fornecedores/novo">+ Novo fornecedor</LinkButton>
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
                      {canEditar ? (
                        <Link href={`/fornecedores/${s.id}/editar`} className="text-sm font-medium text-slate-900 hover:underline">
                          Editar
                        </Link>
                      ) : null}
                      {canExcluir ? (
                        <DeleteRowButton id={s.id} action={deleteSupplierAction} confirmMessage={`Excluir o fornecedor ${s.name}?`} />
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
