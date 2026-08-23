"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { lerArquivoDePerfis } from "@/lib/profile-transfer";

export type ProfileFormState = { error?: string; success?: string };

async function requireAdmin() {
  const user = await getSessionUser();
  // O Super Admin (dono do sistema) também mexe aqui: é ele quem monta os
  // perfis numa instalação nova antes de entregá-la ao cliente.
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    throw new Error("Acesso negado");
  }
  return user;
}

const schema = z.object({ name: z.string().min(1, "Informe o nome do perfil") });

/** Só as permissões válidas ("modulo.acao") enviadas no formulário. */
function readPermissions(formData: FormData): string[] {
  const set = new Set(ALL_PERMISSIONS);
  return formData.getAll("permissions").map(String).filter((p) => set.has(p));
}

export async function createProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem gerenciar perfis." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const name = parsed.data.name.trim();

  const existing = await prisma.profile.findUnique({ where: { name } });
  if (existing) return { error: "Já existe um perfil com esse nome." };

  await prisma.profile.create({ data: { name, permissions: readPermissions(formData) } });
  revalidatePath("/usuarios/perfis");
  revalidatePath("/usuarios");
  redirect("/usuarios/perfis");
}

/**
 * Atualiza o perfil e **re-sincroniza** os usuários que o usam: copia as novas
 * permissões para cada usuário daquele perfil (a mudança propaga).
 */
export async function updateProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem gerenciar perfis." };
  }
  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Perfil inválido." };
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const name = parsed.data.name.trim();

  const clash = await prisma.profile.findFirst({ where: { name, id: { not: id } } });
  if (clash) return { error: "Já existe um perfil com esse nome." };

  const permissions = readPermissions(formData);
  await prisma.$transaction([
    prisma.profile.update({ where: { id }, data: { name, permissions } }),
    prisma.user.updateMany({ where: { profileId: id }, data: { permissions } }),
  ]);
  revalidatePath("/usuarios/perfis");
  revalidatePath("/usuarios");
  redirect("/usuarios/perfis");
}

/** Tamanho de sobra para um arquivo de perfis (é só texto). */
const MAX_ARQUIVO_PERFIS = 1_000_000;

/**
 * Importa os perfis exportados de outra instalação. Casa pelo NOME: perfil que
 * já existe tem as permissões substituídas (e os usuários dele re-sincronizados,
 * como na edição normal); os que não existem são criados. Nada é excluído.
 */
export async function importProfilesAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem gerenciar perfis." };
  }

  const arquivo = formData.get("file");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Escolha o arquivo de perfis exportado da outra instalação." };
  }
  if (arquivo.size > MAX_ARQUIVO_PERFIS) {
    return { error: "Arquivo grande demais para ser um export de perfis." };
  }

  const leitura = lerArquivoDePerfis(await arquivo.text());
  if (!leitura.ok) return { error: leitura.error };

  let criados = 0;
  let atualizados = 0;
  for (const perfil of leitura.perfis) {
    const existente = await prisma.profile.findUnique({
      where: { name: perfil.nome },
      select: { id: true },
    });
    if (existente) {
      await prisma.$transaction([
        prisma.profile.update({ where: { id: existente.id }, data: { permissions: perfil.permissoes } }),
        prisma.user.updateMany({ where: { profileId: existente.id }, data: { permissions: perfil.permissoes } }),
      ]);
      atualizados++;
    } else {
      await prisma.profile.create({ data: { name: perfil.nome, permissions: perfil.permissoes } });
      criados++;
    }
  }

  revalidatePath("/usuarios/perfis");
  revalidatePath("/usuarios");

  const partes = [
    criados > 0 ? `${criados} perfil(is) criado(s)` : "",
    atualizados > 0 ? `${atualizados} atualizado(s)` : "",
  ].filter(Boolean);
  const aviso =
    leitura.permissoesIgnoradas > 0
      ? ` ${leitura.permissoesIgnoradas} permissão(ões) do arquivo não existem nesta versão do sistema e foram ignoradas.`
      : "";
  return { success: `${partes.join(", ")}.${aviso}` };
}

/** Exclui o perfil; os usuários ficam sem perfil (mantêm as permissões atuais). */
export async function deleteProfileAction(id: string): Promise<void> {
  await requireAdmin();
  // profileId dos usuários vira null automaticamente (onDelete: SetNull).
  await prisma.profile.delete({ where: { id } });
  revalidatePath("/usuarios/perfis");
  revalidatePath("/usuarios");
}
