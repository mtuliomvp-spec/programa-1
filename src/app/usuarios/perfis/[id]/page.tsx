import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import ProfileForm from "../ProfileForm";

export const dynamic = "force-dynamic";

export default async function EditarPerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "ADMIN") redirect("/");

  const { id } = await params;
  const profile = await prisma.profile.findUnique({ where: { id } });
  if (!profile) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Editar perfil" description={profile.name} />
      <Card>
        <CardHeader title="Dados do perfil" description="Ao salvar, os usuários deste perfil recebem as novas permissões." />
        <div className="p-5">
          <ProfileForm profile={{ id: profile.id, name: profile.name, permissions: profile.permissions }} />
        </div>
      </Card>
    </div>
  );
}
