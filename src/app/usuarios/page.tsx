import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import NewUserForm from "./NewUserForm";
import UserRowActions from "./UserRowActions";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Quem pode acessar o sistema — administradores gerenciam usuários; operadores usam o restante"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Usuários cadastrados" />
          <Table>
            <Thead>
              <Tr>
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Perfil</Th>
                <Th>Desde</Th>
                <Th>Situação</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {users.map((u) => (
                <Tr key={u.id} className={!u.active ? "opacity-60" : undefined}>
                  <Td className="font-medium text-slate-900">
                    {u.name}
                    {u.id === sessionUser.id ? (
                      <span className="ml-1.5 text-xs text-slate-400">(você)</span>
                    ) : null}
                  </Td>
                  <Td>{u.email}</Td>
                  <Td>
                    <Badge tone={u.role === "ADMIN" ? "info" : "default"}>
                      {u.role === "ADMIN" ? "Administrador" : "Operador"}
                    </Badge>
                  </Td>
                  <Td>{formatDate(u.createdAt)}</Td>
                  <Td>
                    <Badge tone={u.active ? "success" : "danger"}>
                      {u.active ? "Ativo" : "Desativado"}
                    </Badge>
                  </Td>
                  <Td>
                    <UserRowActions
                      id={u.id}
                      active={u.active}
                      isSelf={u.id === sessionUser.id}
                      role={u.role}
                      permissions={u.permissions}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Novo usuário" />
          <div className="p-5">
            <NewUserForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
