import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { matchesSearch } from "@/lib/search";
import { Badge, Card, EmptyState, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import DeleteRowButton from "@/components/DeleteRowButton";
import Can from "@/components/Can";
import { userCan } from "@/lib/guards";
import { syncAllUserSuppliers } from "@/lib/user-supplier-link";
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
  // Garante o fornecedor-espelho de todos os usuários (auto-heal).
  await syncAllUserSuppliers();
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
                  <Td className="font-medium text-slate-900">
                    <span className="inline-flex items-center gap-2">
                      {s.name}
                      {s.userId ? <Badge tone="info">usuário</Badge> : null}
                    </span>
                  </Td>
                  <Td>{s.document || "-"}</Td>
                  <Td>{s.phone || "-"}</Td>
                  <Td>{s.email || "-"}</Td>
                  <Td>
                    {s._count.vehicles} / {s._count.parts}
                  </Td>
                  <Td>
                    {/* Fornecedor-espelho de usuário: gerenciar em Usuários (sem editar/excluir aqui). */}
                    {s.userId ? (
                      <div className="text-right text-xs text-slate-400">gerenciado em Usuários</div>
                    ) : (
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
                    )}
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
