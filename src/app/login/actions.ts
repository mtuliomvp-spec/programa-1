"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie } from "@/lib/auth";

export type LoginFormState = { error?: string };

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(1, "Informe a senha"),
  next: z.string().optional(),
});

export async function loginAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    return { error: "E-mail ou senha incorretos." };
  }

  await setSessionCookie(user);
  const next = parsed.data.next && parsed.data.next.startsWith("/") ? parsed.data.next : "/";
  redirect(next);
}

const setupSchema = z.object({
  name: z.string().min(1, "Informe seu nome"),
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres"),
});

/** Cria o primeiro usuário (administrador) — só funciona com o sistema vazio. */
export async function setupAdminAction(
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  const count = await prisma.user.count();
  if (count > 0) return { error: "O sistema já tem usuários. Faça login." };

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase().trim(),
      passwordHash: hashPassword(parsed.data.password),
      role: "ADMIN",
    },
  });

  await setSessionCookie(user);
  redirect("/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
