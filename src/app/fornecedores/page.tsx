import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { matchesSearch } from "@/lib/search";
import { Card, EmptyState, Input, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import DeleteRowButton from "@/components/DeleteRowButton";
import { deleteSupplierAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q || "").trim();
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
        action={<LinkButton href="/fornecedores/novo">+ Novo fornecedor</LinkButton>}
      />
      <Card className="mb-4 px-4 py-3">
        <form className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input name="q" defaultValue={q} placeholder="Buscar em todos os campos (nome, documento, telefone, e-mail)" />
          </div>
          <button type="submit" className="rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Buscar
          </button>
          {q ? <LinkButton variant="secondary" href="/fornecedores">Limpar</LinkButton> : null}
        </form>
      </Card>
      <Card>
        {suppliers.length === 0 ? (
          <EmptyState
            title={q ? "Nada encontrado para a busca" : "Nenhum fornecedor cadastrado"}
            action={q ? undefined : <LinkButton href="/fornecedores/novo">+ Novo fornecedor</LinkButton>}
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
