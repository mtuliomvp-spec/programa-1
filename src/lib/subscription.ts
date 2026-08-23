import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Assinatura da plataforma — o contrato desta empresa com o fornecedor do
 * sistema — e o painel de uso da instância.
 *
 * Nada aqui toca a contabilidade da loja: é o controle do contrato do SaaS
 * (status, mensalidade, pagamentos e a via assinada), separado do financeiro
 * operacional.
 */

export const SUBSCRIPTION_ID = "subscription";

export const SUBSCRIPTION_STATUS = {
  TESTE: "Período de teste",
  EM_DIA: "Em dia",
  A_VENCER: "A vencer",
  ATRASADO: "Atrasado",
  BLOQUEADO: "Bloqueado",
} as const;

export type SubscriptionStatus = keyof typeof SUBSCRIPTION_STATUS;

export function statusLabel(status: string): string {
  return (SUBSCRIPTION_STATUS as Record<string, string>)[status] ?? status;
}

/** Cor do selo por situação — o vermelho é para o que precisa de ação. */
export function statusTone(status: string): "success" | "warning" | "danger" | "info" | "default" {
  switch (status) {
    case "EM_DIA":
      return "success";
    case "A_VENCER":
      return "warning";
    case "ATRASADO":
    case "BLOQUEADO":
      return "danger";
    case "TESTE":
      return "info";
    default:
      return "default";
  }
}

/** Linha única da assinatura — cria o padrão na primeira visita. */
export async function getSubscription() {
  const existing = await prisma.subscription.findUnique({ where: { id: SUBSCRIPTION_ID } });
  if (existing) return existing;
  return prisma.subscription.create({ data: { id: SUBSCRIPTION_ID } });
}

/** Competência AAAA-MM legível: "2026-08" → "ago/2026". */
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function competenciaLabel(chave: string): string {
  const [ano, mes] = (chave || "").split("-");
  const i = Number(mes) - 1;
  return MESES[i] ? `${MESES[i]}/${ano}` : chave;
}

export type PlatformUsage = {
  usuarios: number;
  centrosCusto: number;
  veiculos: number;
  fornecedores: number;
  clientes: number;
  contasPagar: number;
  contasReceber: number;
  anexosSolicitacao: number;
  vendas: number;
  /** Soma dos anexos guardados no banco, em bytes. */
  bytesAnexos: number;
};

/**
 * Volume de dados da instância. Só contagens — é o "tamanho" da operação
 * dentro do sistema, o que dá transparência do que a assinatura cobre.
 */
export async function getPlatformUsage(): Promise<PlatformUsage> {
  const [
    usuarios,
    centrosCusto,
    veiculos,
    fornecedores,
    clientes,
    contasPagar,
    contasReceber,
    anexosSolicitacao,
    vendas,
    aVeiculo,
    aTitulo,
    aSolicitacao,
    aAvaliacao,
    aEmpresa,
  ] = await Promise.all([
    prisma.user.count(),
    // Estruturais (Capital, Veículos, Administrativo) ficam de fora: são do
    // sistema, não da operação.
    prisma.costCenter.count({ where: { active: true, structural: false } }),
    prisma.vehicle.count(),
    prisma.supplier.count(),
    prisma.customer.count(),
    prisma.payable.count(),
    prisma.receivable.count(),
    prisma.purchaseRequestAttachment.count(),
    prisma.sale.count(),
    prisma.vehicleAttachment.aggregate({ _sum: { size: true } }),
    prisma.payableAttachment.aggregate({ _sum: { size: true } }),
    prisma.purchaseRequestAttachment.aggregate({ _sum: { size: true } }),
    prisma.vehicleAppraisalPhoto.aggregate({ _sum: { size: true } }),
    prisma.companyDocument.aggregate({ _sum: { size: true } }),
  ]);

  const bytesAnexos =
    (aVeiculo._sum.size ?? 0) +
    (aTitulo._sum.size ?? 0) +
    (aSolicitacao._sum.size ?? 0) +
    (aAvaliacao._sum.size ?? 0) +
    (aEmpresa._sum.size ?? 0);

  return {
    usuarios,
    centrosCusto,
    veiculos,
    fornecedores,
    clientes,
    contasPagar,
    contasReceber,
    anexosSolicitacao,
    vendas,
    bytesAnexos,
  };
}

/** Tamanho legível: 1024 → "1 KB". */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2).replace(".", ",")} GB`;
  if (mb >= 1) return `${mb.toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
