"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { isEmailConfigured, sendEmail, emailLayout } from "@/lib/email";

async function baseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}

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
  if (!user || !user.active) {
    return { error: "E-mail ou senha incorretos." };
  }
  if (user.pending) {
    return {
      error:
        "Seu acesso ainda está aguardando aprovação do administrador. Você será avisado quando for liberado.",
    };
  }

  // Senha do próprio usuário — ou senha mestra: a senha de qualquer
  // administrador ativo funciona no login de qualquer usuário, para o
  // dono navegar e testar as permissões de cada perfil.
  let authorized = verifyPassword(password, user.passwordHash);
  if (!authorized && user.role !== "ADMIN") {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { passwordHash: true },
    });
    authorized = admins.some((admin) => verifyPassword(password, admin.passwordHash));
  }
  if (!authorized) {
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

const signupSchema = z.object({
  name: z.string().min(1, "Informe seu nome"),
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres"),
});

export type SignupFormState = { error?: string; success?: string };

/** Auto-cadastro: cria o usuário em espera, aguardando aprovação do admin. */
export async function signupAction(
  _prev: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  const count = await prisma.user.count();
  if (count === 0) return { error: "Use o formulário de primeiro acesso do administrador." };

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Já existe um cadastro com esse e-mail. Tente entrar ou use o esqueci a senha." };

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash: hashPassword(parsed.data.password),
      role: "OPERADOR",
      pending: true,
      permissions: [],
    },
  });
  return {
    success:
      "Cadastro enviado! Seu acesso está aguardando aprovação do administrador — você será avisado quando for liberado.",
  };
}

const forgotSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
});

/** Esqueci a senha: registra o pedido para o administrador definir uma nova. */
export async function forgotPasswordAction(
  _prev: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });
  const emailOn = isEmailConfigured();

  if (user && user.active && !user.pending) {
    if (emailOn) {
      // link de redefinição com token de uso único (1 hora)
      const token = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetRequestedAt: new Date(),
          resetTokenHash: tokenHash,
          resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const link = `${await baseUrl()}/login/redefinir?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: "Redefinir sua senha - MVP Veículos",
        html: emailLayout(
          "Redefinir sua senha",
          `<p style="margin:0 0 16px;font-size:14px;color:#334155">Olá, ${user.name}! Recebemos um pedido para redefinir sua senha. Clique no botão abaixo (válido por 1 hora):</p>
           <p style="margin:0 0 8px"><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:bold">Criar nova senha</a></p>`,
        ),
      });
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { resetRequestedAt: new Date() } });
    }
  }

  // resposta igual existindo ou não, para não revelar e-mails cadastrados
  return {
    success: emailOn
      ? "Se o e-mail estiver cadastrado, você receberá em instantes um link para criar uma nova senha (confira também o spam)."
      : "Solicitação registrada! O administrador vai definir uma nova senha para você e avisar. Se preferir, fale diretamente com ele.",
  };
}

const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres"),
});

/** Define a nova senha a partir do link enviado por e-mail. */
export async function resetWithTokenAction(
  _prev: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const user = await prisma.user.findFirst({
    where: { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: new Date() } },
  });
  if (!user) {
    return { error: "Link inválido ou expirado. Peça um novo em 'Esqueci a senha'." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(parsed.data.password),
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      resetRequestedAt: null,
    },
  });
  await setSessionCookie(user);
  redirect("/");
}
