import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import ProfileForm from "./ProfileForm";
import DeleteProfileButton from "./DeleteProfileButton";

export const dynamic = "force-dynamic";

export default async function PerfisPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "ADMIN") redirect("/");

  const profiles = await prisma.profile.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Perfis de acesso"
        description="Modelos de permissões (ex.: Vendedor, Financeiro) para aplicar aos usuários"
        action={<LinkButton href="/usuarios" variant="secondary">← Usuários</LinkButton>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {profiles.length === 0 ? (
            <Card>
              <EmptyState
                title="Nenhum perfil criado"
                description="Crie um perfil ao lado (ex.: Vendedor) com as permissões que ele pode acessar."
              />
            </Card>
          ) : (
            profiles.map((p) => (
              <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.permissions.length} permissão(ões) · {p._count.users} usuário(s)
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <Link href={`/usuarios/perfis/${p.id}`} className="text-sm font-medium text-blue-700 hover:underline">
                    Editar
                  </Link>
                  <DeleteProfileButton id={p.id} name={p.name} usersCount={p._count.users} />
                </div>
              </Card>
            ))
          )}
        </div>

        <div>
          <Card>
            <CardHeader title="Novo perfil" />
            <div className="p-5">
              <ProfileForm />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
