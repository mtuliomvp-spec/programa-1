"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { clientIp, lockedUntil, registerFailure, clearThrottle, minutesLeft, LOGIN_IP_POLICY } from "@/lib/rate-limit";
import {
  assertSuperGate,
  bootstrapAllowed,
  clearSuperGateCookie,
  setSuperGateCookie,
  superGateOpen,
  superPassword,
} from "@/lib/super-admin";

export type SuperFormState = { error?: string; success?: string };

/**
 * Ações da tela oculta do dono do sistema. Todas passam pelo portão
 * (`assertSuperGate`): ou o visitante já está logado como Super Admin, ou
 * digitou a senha mestra da instalação nesta sessão.
 */

/** Entrada pela senha mestra (variável SUPER_ADMIN_PASSWORD da instalação). */
export async function openSuperGateAction(
  _prev: SuperFormState,
  formData: FormData,
): Promise<SuperFormState> {
  const esperada = superPassword();
  if (!esperada) return { error: "Recurso indisponível." };

  // Limite de tentativas por IP: sem isso a senha mestra viraria alvo fácil.
  const chave = `super-gate:${await clientIp()}`;
  const travado = await lockedUntil(chave);
  if (travado) {
    return { error: `Muitas tentativas. Aguarde ${minutesLeft(travado)} min e tente novamente.` };
  }

  const informada = String(formData.get("password") || "");
  if (informada !== esperada) {
    await registerFailure(chave, LOGIN_IP_POLICY);
    return { error: "Senha incorreta." };
  }

  await clearThrottle(chave);
  await setSuperGateCookie();
  redirect("/super");
}

export async function closeSuperGateAction() {
  await clearSuperGateCookie();
  redirect("/");
}

const novoSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres"),
});

/**
 * Cria um Super Admin — ou promove quem já existe com aquele e-mail, trocando
 * a senha. Assim dá para transformar a própria conta de administrador em Super
 * Admin sem perder o histórico.
 */
export async function createSuperAdminAction(
  _prev: SuperFormState,
  formData: FormData,
): Promise<SuperFormState> {
  // Duas portas: quem já passou pelo portão (Super Admin logado ou senha
  // mestra) e o PRIMEIRO cadastro feito pelo administrador, enquanto a
  // instalação ainda não tem nenhum Super Admin.
  if (!(await superGateOpen()) && !(await bootstrapAllowed())) {
    return { error: "Acesso restrito." };
  }
  const parsed = novoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const email = parsed.data.email.toLowerCase().trim();

  const existente = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existente) {
    await prisma.user.update({
      where: { id: existente.id },
      data: {
        name: parsed.data.name.trim(),
        role: "SUPER_ADMIN",
        passwordHash: hashPassword(parsed.data.password),
        active: true,
        pending: false,
        profileId: null,
        permissions: [],
      },
    });
    revalidatePath("/super");
    return { success: `Conta ${email} promovida a Super Admin (senha redefinida).` };
  }

  await prisma.user.create({
    data: {
      name: parsed.data.name.trim(),
      email,
      passwordHash: hashPassword(parsed.data.password),
      role: "SUPER_ADMIN",
      active: true,
      pending: false,
    },
  });
  revalidatePath("/super");
  return { success: `Super Admin ${email} criado.` };
}

const promoverSchema = z.object({
  userId: z.string().min(1, "Escolha o usuário"),
  password: z.string().optional(),
});

/**
 * Promove um usuário JÁ CADASTRADO a Super Admin, mantendo a senha atual dele
 * (informar uma nova é opcional). É o caminho natural para o fornecedor
 * transformar a própria conta de administrador sem criar um segundo login nem
 * perder o histórico.
 */
export async function promoteUserAction(
  _prev: SuperFormState,
  formData: FormData,
): Promise<SuperFormState> {
  if (!(await superGateOpen()) && !(await bootstrapAllowed())) {
    return { error: "Acesso restrito." };
  }
  const parsed = promoverSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };

  const novaSenha = parsed.data.password?.trim() || "";
  if (novaSenha && novaSenha.length < 8) {
    return { error: "A nova senha precisa ter pelo menos 8 caracteres (ou deixe em branco)." };
  }

  const alvo = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!alvo) return { error: "Usuário não encontrado." };
  if (alvo.role === "SUPER_ADMIN") return { error: "Este usuário já é Super Admin." };

  await prisma.user.update({
    where: { id: alvo.id },
    data: {
      role: "SUPER_ADMIN",
      active: true,
      pending: false,
      profileId: null,
      permissions: [],
      ...(novaSenha ? { passwordHash: hashPassword(novaSenha) } : {}),
    },
  });

  revalidatePath("/super");
  revalidatePath("/usuarios");
  return {
    success: `${alvo.name} (${alvo.email}) agora é Super Admin${novaSenha ? " — senha redefinida" : " — a senha continua a mesma"}.`,
  };
}

/** Tira o status de Super Admin (a conta vira administrador comum da loja). */
export async function demoteSuperAdminAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertSuperGate();
  } catch {
    return { ok: false, error: "Acesso restrito." };
  }
  const restantes = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
  if (restantes <= 1) {
    return { ok: false, error: "Este é o único Super Admin — crie outro antes de rebaixar este." };
  }
  await prisma.user.update({ where: { id }, data: { role: "ADMIN" } });
  revalidatePath("/super");
  return { ok: true };
}

const bloqueioSchema = z.object({
  blocked: z.string().optional(),
  message: z.string().optional(),
});

/**
 * Liga/desliga o bloqueio por falta de pagamento. Enquanto ligado, ninguém da
 * loja entra — nem o administrador —, e todas as ações protegidas são
 * recusadas no servidor.
 */
export async function setPaymentBlockAction(
  _prev: SuperFormState,
  formData: FormData,
): Promise<SuperFormState> {
  try {
    await assertSuperGate();
  } catch {
    return { error: "Acesso restrito." };
  }
  const parsed = bloqueioSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Dados inválidos." };
  const bloquear = parsed.data.blocked === "true";

  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: {
      paymentBlocked: bloquear,
      paymentBlockedAt: bloquear ? new Date() : null,
      paymentBlockedMessage: bloquear ? parsed.data.message?.trim() || null : null,
    },
    create: {
      id: "company",
      paymentBlocked: bloquear,
      paymentBlockedAt: bloquear ? new Date() : null,
      paymentBlockedMessage: bloquear ? parsed.data.message?.trim() || null : null,
    },
  });

  revalidatePath("/", "layout");
  return { success: bloquear ? "Acesso suspenso por pendência financeira." : "Acesso liberado." };
}

/** Liga/desliga o modo manutenção (o administrador da loja segue navegando). */
export async function setMaintenanceAction(locked: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertSuperGate();
  } catch {
    return { ok: false, error: "Acesso restrito." };
  }
  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: {
      systemLocked: locked,
      systemLockedBy: locked ? "Super Admin" : null,
      systemLockedAt: locked ? new Date() : null,
    },
    create: { id: "company", systemLocked: locked },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
