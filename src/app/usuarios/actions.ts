"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword } from "@/lib/auth";

export type UserFormState = { error?: string; success?: string };

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") throw new Error("Acesso negado");
  return user;
}

const createSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres"),
  role: z.enum(["ADMIN", "OPERADOR"]),
});

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

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: hashPassword(parsed.data.password),
      role: parsed.data.role,
    },
  });
  revalidatePath("/usuarios");
  return { success: "Usuário criado." };
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
    data: { passwordHash: hashPassword(parsed.data.password) },
  });
  revalidatePath("/usuarios");
  return { success: "Senha alterada." };
}
