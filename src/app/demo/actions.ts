"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo-mode";
import { seedDemoData, type DemoSeedResult } from "@/lib/demo-seed";

export type LoadDemoState = { ok: boolean; error?: string; result?: DemoSeedResult };

/**
 * Carrega os dados fictícios de demonstração. Duas travas: a instalação
 * precisa estar em modo demonstração (DEMO_MODE) e quem clica precisa ser
 * administrador logado. Sem a variável de ambiente — o caso da produção — a
 * action recusa mesmo que alguém acerte a URL.
 */
export async function loadDemoDataAction(): Promise<LoadDemoState> {
  if (!isDemoMode()) {
    return {
      ok: false,
      error:
        "Esta instalação não está em modo demonstração. A carga de dados fictícios está desativada.",
    };
  }
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sessão expirada. Faça login novamente." };
  if (user.role !== "SUPER_ADMIN") {
    return { ok: false, error: "Acesso restrito ao Super Admin." };
  }

  try {
    const result = await seedDemoData();
    // A carga mexe em praticamente tudo: recarrega o app inteiro.
    revalidatePath("/", "layout");
    return { ok: true, result };
  } catch (e) {
    console.error("Falha ao carregar os dados de demonstração", e);
    return {
      ok: false,
      error:
        e instanceof Error
          ? `Não foi possível concluir a carga: ${e.message}`
          : "Não foi possível concluir a carga.",
    };
  }
}
