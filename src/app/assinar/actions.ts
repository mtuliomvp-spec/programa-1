"use server";

import { prisma } from "@/lib/prisma";
import { emailLayout, isEmailConfigured, sendEmail } from "@/lib/email";
import { cnpjValido } from "@/lib/renave-ws-dados";
import { UFS } from "@/lib/endereco";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo-mode";
import { setSessionCookie } from "@/lib/auth";
import { garantirVisitante } from "@/lib/demo-visitante";
import { emailComercial, implantacaoGratis, paginaAssinaturaAtiva, planoPorId } from "@/lib/assinatura-fincore";

export type PedidoState = { ok?: boolean; error?: string; valores?: Record<string, string> };

const CAMPOS = ["plano", "nomeLoja", "cnpj", "responsavel", "whatsapp", "email", "cidade", "uf", "mensagem"] as const;

const texto = (fd: FormData, k: string, max = 120) => String(fd.get(k) ?? "").trim().slice(0, max);

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Pedido de assinatura vindo da página pública /assinar. Grava o pedido (o
 * dono do sistema vê no Painel Super Admin) e, havendo provedor de e-mail
 * configurado, avisa o e-mail comercial. Sem sessão de propósito: quem pede
 * ainda não é cliente.
 */
export async function pedirAssinaturaAction(_prev: PedidoState, fd: FormData): Promise<PedidoState> {
  if (!paginaAssinaturaAtiva()) return { error: "Página indisponível." };
  const r = await validarEGravar(fd);
  // No erro, devolve o que foi digitado: o React limpa o formulário depois do
  // envio e o lojista teria de preencher tudo de novo.
  return r.error ? { ...r, valores: Object.fromEntries(CAMPOS.map((k) => [k, texto(fd, k, 1000)])) } : r;
}

async function validarEGravar(fd: FormData): Promise<PedidoState> {
  // Campo invisível: gente não preenche, robô de formulário preenche.
  if (texto(fd, "site")) return { ok: true };

  const nomeLoja = texto(fd, "nomeLoja");
  const responsavel = texto(fd, "responsavel");
  const cidade = texto(fd, "cidade");
  const uf = texto(fd, "uf", 2).toUpperCase();
  const email = texto(fd, "email").toLowerCase();
  const whatsapp = texto(fd, "whatsapp", 30).replace(/\D/g, "");
  const cnpj = texto(fd, "cnpj", 30).replace(/\D/g, "");
  const mensagem = texto(fd, "mensagem", 1000);
  const plano = planoPorId(texto(fd, "plano", 20));

  if (!plano) return { error: "Escolha o plano." };
  if (!nomeLoja || !responsavel || !cidade) return { error: "Preencha o nome da loja, o responsável e a cidade." };
  if (!(UFS as readonly string[]).includes(uf)) return { error: "Escolha o estado (UF)." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Confira o e-mail." };
  if (whatsapp.length < 10 || whatsapp.length > 13) return { error: "Confira o WhatsApp, com DDD." };
  if (cnpj && !cnpjValido(cnpj)) return { error: "Confira o CNPJ (ou deixe em branco)." };
  if (fd.get("aceite") !== "on") return { error: "Para enviar, autorize o contato e o uso dos dados." };

  // O mesmo e-mail pedindo de novo em poucos minutos é clique duplo, não pedido novo.
  const recente = await prisma.pedidoAssinatura.findFirst({
    where: { email, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
    select: { id: true },
  });
  if (recente) return { ok: true };

  const pedido = await prisma.pedidoAssinatura.create({
    data: { plano: plano.id, nomeLoja, responsavel, cidade, uf, email, whatsapp, cnpj: cnpj || null, mensagem: mensagem || null },
  });

  if (isEmailConfigured()) {
    const linha = (rotulo: string, valor: string) =>
      `<p style="margin:0 0 6px;font-size:14px;color:#0f172a"><strong>${rotulo}:</strong> ${escapar(valor)}</p>`;
    const r = await sendEmail({
      to: emailComercial(),
      remetente: "Fincore360",
      subject: `Fincore360 — pedido de assinatura: ${nomeLoja} (${cidade}/${uf})`,
      html: emailLayout(
        "Novo pedido de assinatura",
        [
          linha("Plano", `${plano.nome} (R$ ${plano.preco}/mês)${implantacaoGratis() ? " · implantação grátis (lançamento)" : ""}`),
          linha("Loja", nomeLoja),
          cnpj ? linha("CNPJ", cnpj) : "",
          linha("Responsável", responsavel),
          linha("Cidade", `${cidade}/${uf}`),
          linha("WhatsApp", whatsapp),
          linha("E-mail", email),
          mensagem ? linha("Mensagem", mensagem) : "",
        ].join(""),
        "Fincore360",
      ),
    });
    if (r.ok) await prisma.pedidoAssinatura.update({ where: { id: pedido.id }, data: { avisado: true } });
  }

  return { ok: true };
}

/**
 * "Testar o sistema": entra no demo como o visitante compartilhado. Só na
 * instalação de DEMONSTRAÇÃO — PAGINA_ASSINATURA sozinha não basta, para nunca
 * abrir os dados de uma loja de verdade.
 */
export async function entrarNaDemoAction(): Promise<void> {
  if (!isDemoMode()) redirect("/assinar");
  const visitante = await garantirVisitante();
  await setSessionCookie(visitante);
  redirect("/");
}
