"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { isEmailConfigured, sendEmail, emailLayout } from "@/lib/email";

export type UserFormState = { error?: string; success?: string };

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") throw new Error("Acesso negado");
  return user;
}

const bankSchema = {
  document: z.string().optional(),
  phone: z.string().optional(),
  bankName: z.string().optional(),
  bankAgency: z.string().optional(),
  bankAccount: z.string().optional(),
  bankAccountType: z.string().optional(),
  pixKey: z.string().optional(),
};

/** Campos bancários normalizados (string vazia → null). */
function bankData(d: Record<string, string | undefined>) {
  return {
    document: d.document?.trim() || null,
    phone: d.phone?.trim() || null,
    bankName: d.bankName?.trim() || null,
    bankAgency: d.bankAgency?.trim() || null,
    bankAccount: d.bankAccount?.trim() || null,
    bankAccountType: d.bankAccountType?.trim() || null,
    pixKey: d.pixKey?.trim() || null,
  };
}

const createSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres"),
  // "ADMIN" | "MANUAL" | <profileId>
  perfil: z.string().min(1, "Escolha o perfil"),
  ...bankSchema,
});

/**
 * Resolve a escolha de perfil no cadastro/edição em role + permissões +
 * profileId. "ADMIN" = admin; "MANUAL" = operador com permissões do checklist;
 * senão é o id de um perfil (operador que herda as permissões dele).
 */
async function resolvePerfil(
  perfil: string,
  formData: FormData,
): Promise<{ role: "ADMIN" | "OPERADOR"; permissions: string[]; profileId: string | null }> {
  if (perfil === "ADMIN") return { role: "ADMIN", permissions: [], profileId: null };
  if (perfil === "MANUAL") {
    return { role: "OPERADOR", permissions: formData.getAll("permissions").map(String), profileId: null };
  }
  const profile = await prisma.profile.findUnique({ where: { id: perfil } });
  if (!profile) return { role: "OPERADOR", permissions: [], profileId: null };
  return { role: "OPERADOR", permissions: profile.permissions, profileId: profile.id };
}

/** Aplica um perfil a um usuário já existente (copia as permissões). */
export async function applyProfileAction(userId: string, profileId: string): Promise<UserFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem gerenciar usuários." };
  }
  if (profileId === "MANUAL") {
    // Solta do perfil, mantém as permissões atuais (edição manual pela lista).
    await prisma.user.update({ where: { id: userId }, data: { profileId: null } });
  } else if (profileId === "ADMIN") {
    await prisma.user.update({ where: { id: userId }, data: { role: "ADMIN", profileId: null, permissions: [] } });
  } else {
    const profile = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile) return { error: "Perfil não encontrado." };
    await prisma.user.update({
      where: { id: userId },
      data: { role: "OPERADOR", profileId: profile.id, permissions: profile.permissions },
    });
  }
  revalidatePath("/usuarios");
  return { success: "Perfil aplicado." };
}

const bankUpdateSchema = z.object({ userId: z.string().min(1), ...bankSchema });

/** Atualiza os dados bancários de um usuário (para a Ordem de Pagamento). */
export async function updateUserBankAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem gerenciar usuários." };
  }
  const parsed = bankUpdateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  await prisma.user.update({ where: { id: parsed.data.userId }, data: bankData(parsed.data) });
  revalidatePath("/usuarios");
  return { success: "Dados bancários salvos." };
}

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem gerenciar usuários." };
  }
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Já existe um usuário com esse e-mail." };

  const { role, permissions, profileId } = await resolvePerfil(parsed.data.perfil, formData);

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: hashPassword(parsed.data.password),
      role,
      permissions,
      profileId,
      ...bankData(parsed.data),
    },
  });
  revalidatePath("/usuarios");
  return { success: "Usuário criado." };
}

export async function updatePermissionsAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem gerenciar usuários." };
  }
  const userId = String(formData.get("userId") || "");
  if (!userId) return { error: "Usuário inválido." };
  const permissions = formData.getAll("permissions").map(String);
  await prisma.user.update({ where: { id: userId }, data: { permissions } });
  revalidatePath("/usuarios");
  return { success: "Permissões atualizadas." };
}

export async function approveUserAction(id: string) {
  await requireAdmin();
  const user = await prisma.user.update({
    where: { id },
    data: { pending: false, active: true },
  });
  if (isEmailConfigured()) {
    // aviso de liberação — falha de envio não impede a aprovação
    await sendEmail({
      to: user.email,
      subject: "Seu acesso foi liberado - MVP Veículos",
      html: emailLayout(
        "Acesso liberado! 🎉",
        `<p style="margin:0 0 16px;font-size:14px;color:#334155">Olá, ${user.name}! Seu cadastro foi aprovado. Você já pode entrar no sistema com seu e-mail e a senha que criou.</p>`,
      ),
    });
  }
  revalidatePath("/usuarios");
}

export async function rejectUserAction(id: string) {
  await requireAdmin();
  await prisma.user.delete({ where: { id, pending: true } });
  revalidatePath("/usuarios");
}

export async function toggleUserAction(id: string, active: boolean) {
  const admin = await requireAdmin();
  if (admin.id === id) throw new Error("Você não pode desativar a si mesmo.");
  await prisma.user.update({ where: { id }, data: { active } });
  revalidatePath("/usuarios");
}

const resetSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres"),
});

export async function resetPasswordAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem gerenciar usuários." };
  }
  const parsed = resetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { passwordHash: hashPassword(parsed.data.password), resetRequestedAt: null },
  });
  revalidatePath("/usuarios");
  return { success: "Senha alterada." };
}
