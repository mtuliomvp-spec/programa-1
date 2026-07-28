import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import NewUserForm from "./NewUserForm";
import UserRowActions from "./UserRowActions";
import type { UserBank } from "./UserBankFields";

export const dynamic = "force-dynamic";

/** Igualdade de conjunto (mesmos elementos, sem depender da ordem). */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(b);
  return a.every((x) => s.has(x));
}

/**
 * Selo ao lado do perfil: "Padrão" quando as permissões do usuário são idênticas
 * às do perfil cadastrado; "Personalizado" quando têm alguma permissão a mais ou
 * a menos. Nada para admin ou usuário sem perfil.
 */
function ProfileTag({
  role,
  profile,
  permissions,
}: {
  role: "ADMIN" | "OPERADOR";
  profile: { permissions: string[] } | null;
  permissions: string[];
}) {
  if (role === "ADMIN" || !profile) return null;
  return sameSet(permissions, profile.permissions) ? (
    <Badge tone="default">Padrão</Badge>
  ) : (
    <Badge tone="warning">Personalizado</Badge>
  );
}

function bankOf(u: UserBank): UserBank {
  return {
    document: u.document,
    phone: u.phone,
    bankName: u.bankName,
    bankAgency: u.bankAgency,
    bankAccount: u.bankAccount,
    bankAccountType: u.bankAccountType,
    pixKey: u.pixKey,
  };
}

export default async function UsuariosPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "ADMIN") redirect("/");

  const [users, profiles, beneficiaries] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        profile: { select: { name: true, permissions: true } },
        beneficiary: { select: { id: true } },
      },
    }),
    prisma.profile.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.capitalBeneficiary.findMany({
      where: { isCompany: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const pendingUsers = users.filter((u) => u.pending);
  const regularUsers = users.filter((u) => !u.pending);

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Quem pode acessar o sistema — administradores gerenciam usuários; operadores usam o restante"
        action={<LinkButton href="/usuarios/perfis" variant="secondary">Perfis de acesso</LinkButton>}
      />

      {pendingUsers.length > 0 ? (
        <Card className="mb-4 ring-2 ring-amber-300">
          <CardHeader
            title={`⏳ Aguardando liberação (${pendingUsers.length})`}
            description="Pessoas que se cadastraram sozinhas e só entram depois que você aprovar"
          />
          <div className="divide-y divide-slate-100">
            {pendingUsers.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 bg-amber-50/60 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">
                    {u.email} · pediu acesso em {formatDate(u.createdAt)}
                  </p>
                </div>
                <UserRowActions
                  id={u.id}
                  name={u.name}
                  beneficiaries={beneficiaries}
                  beneficiaryId={u.beneficiary?.id ?? null}
                  active={u.active}
                  pending={u.pending}
                  isSelf={false}
                  role={u.role}
                  permissions={u.permissions}
                  bank={bankOf(u)}
                  profiles={profiles}
                  profileId={u.profileId}
                />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Usuários cadastrados" />

          {/* Celular: cartões empilhados (a tabela não cabe na tela) */}
          <div className="divide-y divide-slate-100 sm:hidden">
            {regularUsers.map((u) => (
              <div key={u.id} className={`px-5 py-4 ${!u.active ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {u.name}
                      {u.id === sessionUser.id ? (
                        <span className="ml-1.5 text-xs font-normal text-slate-400">(você)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={u.role === "ADMIN" ? "info" : "default"}>
                      {u.role === "ADMIN" ? "Administrador" : u.profile?.name ?? "Operador"}
                    </Badge>
                    <ProfileTag role={u.role} profile={u.profile} permissions={u.permissions} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={u.active ? "success" : "danger"}>
                    {u.active ? "Ativo" : "Desativado"}
                  </Badge>
                  {u.resetRequestedAt ? <Badge tone="info">🔑 Pediu nova senha</Badge> : null}
                  <span className="text-xs text-slate-400">desde {formatDate(u.createdAt)}</span>
                </div>
                <div className="mt-3">
                  <UserRowActions
                    id={u.id}
                    name={u.name}
                    beneficiaries={beneficiaries}
                    beneficiaryId={u.beneficiary?.id ?? null}
                    active={u.active}
                    pending={u.pending}
                    isSelf={u.id === sessionUser.id}
                    role={u.role}
                    permissions={u.permissions}
                    bank={bankOf(u)}
                    profiles={profiles}
                    profileId={u.profileId}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Telas maiores: tabela completa */}
          <div className="hidden sm:block">
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
                {regularUsers.map((u) => (
                  <Tr key={u.id} className={!u.active ? "opacity-60" : undefined}>
                    <Td className="font-medium text-slate-900">
                      {u.name}
                      {u.id === sessionUser.id ? (
                        <span className="ml-1.5 text-xs text-slate-400">(você)</span>
                      ) : null}
                    </Td>
                    <Td>{u.email}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={u.role === "ADMIN" ? "info" : "default"}>
                          {u.role === "ADMIN" ? "Administrador" : u.profile?.name ?? "Operador"}
                        </Badge>
                        <ProfileTag role={u.role} profile={u.profile} permissions={u.permissions} />
                      </div>
                    </Td>
                    <Td>{formatDate(u.createdAt)}</Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={u.active ? "success" : "danger"}>
                          {u.active ? "Ativo" : "Desativado"}
                        </Badge>
                        {u.resetRequestedAt ? <Badge tone="info">🔑 Pediu nova senha</Badge> : null}
                      </div>
                    </Td>
                    <Td>
                      <UserRowActions
                        id={u.id}
                        name={u.name}
                        beneficiaries={beneficiaries}
                        beneficiaryId={u.beneficiary?.id ?? null}
                        active={u.active}
                        pending={u.pending}
                        isSelf={u.id === sessionUser.id}
                        role={u.role}
                        permissions={u.permissions}
                        bank={bankOf(u)}
                        profiles={profiles}
                        profileId={u.profileId}
                      />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Novo usuário" />
          <div className="p-5">
            <NewUserForm profiles={profiles} />
          </div>
        </Card>
      </div>
    </div>
  );
}
