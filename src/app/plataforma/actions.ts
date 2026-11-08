"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import {
  atualizarLoja,
  atualizarSegredos,
  buscarLojaPorSlug,
  criarLoja,
  normalizarHost,
  slugValido,
} from "@/lib/catalogo";
import {
  criarBancoDaLoja,
  dispararPublicacao,
  exigirPainel,
  SEGREDOS_DA_LOJA,
  servidorDeBancos,
} from "@/lib/plataforma";

export type EstadoPlataforma = { erro?: string; ok?: string };

const hostsDe = (texto: string) =>
  texto
    .split(/[\s,;]+/)
    .map(normalizarHost)
    .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h));

const novaLoja = z.object({
  nome: z.string().trim().min(2, "Informe o nome da loja."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(slugValido, "Subdomínio: 3 a 40 letras minúsculas, números ou hífen (sem www, app, admin…)."),
  razaoSocial: z.string().trim().optional(),
  cnpj: z.string().trim().optional(),
  hosts: z.string().optional(),
  adminNome: z.string().trim().min(2, "Informe o nome do administrador da loja."),
  adminEmail: z.string().trim().toLowerCase().email("E-mail do administrador inválido."),
  adminSenha: z.string().min(8, "A senha inicial precisa de pelo menos 8 caracteres."),
  bancoManual: z.string().trim().optional(),
});

/**
 * Cria a loja: banco novo no servidor da plataforma (ou um banco já criado,
 * informado à mão), registro PREPARANDO no catálogo e pedido de publicação.
 * A publicação monta as tabelas e o administrador; aí a loja libera sozinha.
 */
export async function criarLojaAction(_: EstadoPlataforma, form: FormData): Promise<EstadoPlataforma> {
  try {
    await exigirPainel();
  } catch (e) {
    return { erro: (e as Error).message };
  }
  const p = novaLoja.safeParse(Object.fromEntries(form.entries()));
  if (!p.success) return { erro: p.error.issues[0]?.message ?? "Dados inválidos." };
  const d = p.data;
  if (await buscarLojaPorSlug(d.slug)) return { erro: `O subdomínio "${d.slug}" já é de outra loja.` };

  let banco: { databaseUrl: string; databaseUrlDireta: string | null };
  try {
    if (d.bancoManual) {
      if (!/^postgres(ql)?:\/\//.test(d.bancoManual)) return { erro: "URL do banco inválida (postgresql://…)." };
      banco = { databaseUrl: d.bancoManual, databaseUrlDireta: null };
    } else {
      if (!servidorDeBancos()) {
        return { erro: "Servidor de bancos não configurado (PLATAFORMA_BANCO_URL). Informe a URL de um banco já criado." };
      }
      banco = await criarBancoDaLoja(d.slug);
    }
    await criarLoja({
      slug: d.slug,
      nome: d.nome,
      hosts: hostsDe(d.hosts ?? ""),
      ...banco,
      admin: { nome: d.adminNome, email: d.adminEmail, senhaHash: hashPassword(d.adminSenha) },
      empresa: { razaoSocial: d.razaoSocial || d.nome, cnpj: d.cnpj?.replace(/\D/g, "") || null },
    });
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const publicacao = await dispararPublicacao();
  revalidatePath("/plataforma");
  return {
    ok:
      publicacao === "disparada"
        ? `Loja ${d.nome} criada. A publicação foi disparada: em alguns minutos o sistema dela fica pronto.`
        : publicacao === "sem-gancho"
          ? `Loja ${d.nome} criada. Falta publicar de novo (Vercel › Deployments › Redeploy) para montar o sistema dela — ou configure VERCEL_DEPLOY_HOOK_URL para isso ser automático.`
          : `Loja ${d.nome} criada, mas o pedido de publicação falhou. Publique de novo na Vercel (Redeploy).`,
  };
}

export async function atualizarLojaAction(_: EstadoPlataforma, form: FormData): Promise<EstadoPlataforma> {
  try {
    await exigirPainel();
    const slug = String(form.get("slug") ?? "");
    const status = form.get("status");
    await atualizarLoja(slug, {
      nome: String(form.get("nome") ?? ""),
      hosts: hostsDe(String(form.get("hosts") ?? "")),
      status: status === "SUSPENSA" ? "SUSPENSA" : status === "ATIVA" ? "ATIVA" : undefined,
    });
    revalidatePath("/plataforma");
    revalidatePath(`/plataforma/${slug}`);
    return { ok: "Dados da loja salvos. Mudanças de domínio e situação valem em até 1 minuto." };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

/**
 * Segredos da loja. Campo em branco = mantém o que está; a caixa "apagar"
 * remove. O certificado (.pfx) chega como arquivo e é guardado em base64.
 */
export async function salvarSegredosAction(_: EstadoPlataforma, form: FormData): Promise<EstadoPlataforma> {
  try {
    await exigirPainel();
    const slug = String(form.get("slug") ?? "");
    const mudancas: Record<string, string | null> = {};
    for (const s of SEGREDOS_DA_LOJA) {
      if (form.get(`apagar_${s.chave}`) === "on") {
        mudancas[s.chave] = null;
        continue;
      }
      const v = form.get(s.chave);
      if (v instanceof File) {
        if (v.size > 0) {
          if (v.size > 50_000) return { erro: "Certificado grande demais (um .pfx A1 tem poucos KB)." };
          mudancas[s.chave] = Buffer.from(await v.arrayBuffer()).toString("base64");
        }
      } else if (typeof v === "string" && v.trim()) {
        mudancas[s.chave] = v.trim();
      }
    }
    if (!Object.keys(mudancas).length) return { erro: "Nada para salvar." };
    await atualizarSegredos(slug, mudancas);
    revalidatePath(`/plataforma/${slug}`);
    return { ok: `${Object.keys(mudancas).length} item(ns) atualizado(s). Valem em até 1 minuto.` };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export async function publicarDeNovoAction(): Promise<EstadoPlataforma> {
  try {
    await exigirPainel();
  } catch (e) {
    return { erro: (e as Error).message };
  }
  const r = await dispararPublicacao();
  return r === "disparada"
    ? { ok: "Publicação disparada. Lojas em preparo ficam prontas em alguns minutos." }
    : r === "sem-gancho"
      ? { erro: "VERCEL_DEPLOY_HOOK_URL não configurada: publique de novo pela Vercel (Redeploy)." }
      : { erro: "O pedido de publicação falhou. Tente de novo ou use o Redeploy da Vercel." };
}
