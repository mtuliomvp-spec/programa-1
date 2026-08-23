"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { DEFAULT_OPERATOR_PERMISSIONS } from "@/lib/permissions";
import { isEmailConfigured, sendEmail, emailLayout } from "@/lib/email";
import { linkBeneficiaryToUser, unlinkBeneficiary, renameLinkedPair } from "@/lib/capital-user-link";
import { syncUserSupplier } from "@/lib/user-supplier-link";

export type UserFormState = { error?: string; success?: string };

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) throw new Error("Acesso negado");
  return user;
}

/**
 * Nenhuma ação desta tela toca um Super Admin: para a loja ele não existe, e
 * deixar passar abriria caminho para o administrador desativar, renomear ou
 * trocar a senha do dono do sistema. Erro genérico de propósito — não revela
 * que a conta existe.
 */
async function assertAlvoVisivel(userId: string) {
  const alvo = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!alvo || alvo.role === "SUPER_ADMIN") throw new Error("Usuário não encontrado");
}

const bankSchema = {
  document: z.string().optional(),
  phone: z.string().optional(),
  bankName: z.string().optional(),
  bankAgency: z.string().optional(),
  bankAccount: z.string().optional(),
  bankAccountType: z.string().optional(),
  pixKey: z.string().optional(),
  pixKeyType: z.string().optional(),
};

const identitySchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1, "Informe o nome"),
  beneficiaryId: z.string().optional(),
});

/**
 * Edita o nome do usuário e o vínculo com um beneficiário do capital.
 * Nomes sincronizados: renomear reflete no beneficiário vinculado; ao vincular,
 * o beneficiário adota o nome do usuário.
 */
export async function updateUserIdentityAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await requireAdmin();
  } catch {
    return { error: "Apenas administradores podem gerenciar usuários." };
  }
  const parsed = identitySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const { userId, name } = parsed.data;
  try {
    await assertAlvoVisivel(userId);
  } catch {
    return { error: "Usuário não encontrado." };
  }
  const beneficiaryId = (parsed.data.beneficiaryId || "").trim();

  // Beneficiário escolhido não pode ser o da empresa.
  if (beneficiaryId) {
    const b = await prisma.capitalBeneficiary.findUnique({
      where: { id: beneficiaryId },
      select: { isCompany: true },
    });
    if (!b) return { error: "Beneficiário não encontrado." };
    if (b.isCompany) return { error: "O beneficiário da empresa não pode ser vinculado." };
  }

  try {
    // 1) renomeia o usuário (e o beneficiário já vinculado, se houver).
    await renameLinkedPair({ userId }, name);
    // 2) ajusta o vínculo.
    const current = await prisma.capitalBeneficiary.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (beneficiaryId) {
      if (current?.id !== beneficiaryId) await linkBeneficiaryToUser(beneficiaryId, userId);
    } else if (current) {
      await unlinkBeneficiary(current.id);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível salvar." };
  }
  await syncUserSupplier(userId);
  revalidatePath("/usuarios");
  revalidatePath("/capital");
  return { success: "Nome e vínculo salvos." };
}

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
    pixKeyType: d.pixKeyType?.trim() || null,
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
): Promise<{ role: "ADMIN" | "OPERADOR" | "SUPER_ADMIN"; permissions: string[]; profileId: string | null }> {
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
    await assertAlvoVisivel(userId);
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
  try {
    await assertAlvoVisivel(parsed.data.userId);
  } catch {
    return { error: "Usuário não encontrado." };
  }
  await prisma.user.update({ where: { id: parsed.data.userId }, data: bankData(parsed.data) });
  await syncUserSupplier(parsed.data.userId);
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

  const created = await prisma.user.create({
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
  await syncUserSupplier(created.id);
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
  try {
    await assertAlvoVisivel(userId);
  } catch {
    return { error: "Usuário não encontrado." };
  }
  const permissions = formData.getAll("permissions").map(String);
  await prisma.user.update({ where: { id: userId }, data: { permissions } });
  revalidatePath("/usuarios");
  return { success: "Permissões atualizadas." };
}

export async function approveUserAction(id: string) {
  await requireAdmin();
  await assertAlvoVisivel(id);
  // Cadastro novo nasce sem permissão nenhuma; aprovar sem liberar nada
  // deixaria o usuário preso numa tela de aviso. Concede o padrão de operador
  // (só visualizar) — o administrador ajusta depois na tela de permissões.
  const current = await prisma.user.findUnique({ where: { id }, select: { permissions: true } });
  const user = await prisma.user.update({
    where: { id },
    data: {
      pending: false,
      active: true,
      ...(current && current.permissions.length === 0
        ? { permissions: DEFAULT_OPERATOR_PERMISSIONS }
        : {}),
    },
  });
  await syncUserSupplier(user.id);
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
  await assertAlvoVisivel(id);
  await prisma.user.delete({ where: { id, pending: true } });
  revalidatePath("/usuarios");
}

export async function toggleUserAction(id: string, active: boolean) {
  const admin = await requireAdmin();
  await assertAlvoVisivel(id);
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

  try {
    await assertAlvoVisivel(parsed.data.userId);
  } catch {
    return { error: "Usuário não encontrado." };
  }
  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { passwordHash: hashPassword(parsed.data.password), resetRequestedAt: null },
  });
  revalidatePath("/usuarios");
  return { success: "Senha alterada." };
}

/** Gera um código de liberação de primeiro acesso (uso único). */
export async function generateAccessCodeAction(): Promise<{ ok: boolean; code?: string; error?: string }> {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return { ok: false, error: "Apenas administradores geram códigos." };
  }
  // 6 caracteres sem ambíguos (sem 0/O, 1/I/L).
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    try {
      await prisma.accessCode.create({ data: { code, createdBy: admin.name || admin.email } });
      revalidatePath("/usuarios");
      return { ok: true, code };
    } catch {
      // colisão de código único: tenta outro
    }
  }
  return { ok: false, error: "Não foi possível gerar o código. Tente novamente." };
}

/** Exclui um código de liberação ainda não usado. */
export async function deleteAccessCodeAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, error: "Apenas administradores." };
  }
  await prisma.accessCode.deleteMany({ where: { id, usedAt: null } });
  revalidatePath("/usuarios");
  return { ok: true };
}
