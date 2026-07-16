"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export type ResetState = { error?: string; success?: string };

/**
 * Zera os dados operacionais do sistema (somente ADMIN), preservando os
 * usuários e os parâmetros da empresa. Exige confirmação digitando "ZERAR".
 */
export async function resetSystemDataAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { error: "Apenas administradores podem zerar os dados." };
  }
  const confirm = String(formData.get("confirm") || "").trim();
  if (confirm !== "ZERAR") {
    return { error: 'Para confirmar, digite exatamente ZERAR (em maiúsculas).' };
  }

  try {
    // Ordem respeitando as chaves estrangeiras (filhos primeiro).
    await prisma.$transaction([
      prisma.accountTransfer.deleteMany(),
      prisma.capitalTransaction.deleteMany(),
      prisma.fuelEntry.deleteMany(),
      prisma.vehicleCost.deleteMany(),
      prisma.receivable.deleteMany(),
      prisma.payable.deleteMany(),
      prisma.partSale.deleteMany(),
      prisma.sale.deleteMany(),
      prisma.part.deleteMany(),
      prisma.vehicle.deleteMany(),
      prisma.purchaseRequest.deleteMany(),
      prisma.consortium.deleteMany(),
      prisma.recurringEntry.deleteMany(),
      prisma.capitalBeneficiary.deleteMany(),
      prisma.employee.deleteMany(),
      prisma.costCenter.deleteMany(),
      prisma.financialAccount.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.supplier.deleteMany(),
    ]);
  } catch {
    return { error: "Não foi possível zerar os dados. Tente novamente." };
  }

  revalidatePath("/", "layout");
  return {
    success:
      "Dados zerados com sucesso. Usuários e parâmetros da empresa foram preservados. Faça um novo backup quando quiser.",
  };
}

/**
 * Restaura um backup (JSON gerado pelo botão "Fazer backup agora"). Apaga
 * TUDO (inclusive usuários e parâmetros) e recria a partir do arquivo.
 */
export async function restoreBackupAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return { error: "Apenas administradores podem restaurar backup." };
  }
  const file = formData.get("backup");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o arquivo de backup (.json)." };
  }

  let data: Record<string, unknown[]> & { _meta?: { app?: string } };
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { error: "Arquivo inválido — não parece ser um JSON de backup." };
  }
  if (!data || data._meta?.app !== "MVP Veículos") {
    return { error: "Este arquivo não é um backup do MVP Veículos." };
  }

  const arr = (k: string) => (Array.isArray(data[k]) ? (data[k] as never[]) : []);

  try {
    const ops: unknown[] = [
      // Apaga tudo (filhos primeiro).
      prisma.vehicleAttachment.deleteMany(),
      prisma.accountTransfer.deleteMany(),
      prisma.capitalTransaction.deleteMany(),
      prisma.fuelEntry.deleteMany(),
      prisma.vehicleCost.deleteMany(),
      prisma.receivable.deleteMany(),
      prisma.payable.deleteMany(),
      prisma.partSale.deleteMany(),
      prisma.sale.deleteMany(),
      prisma.part.deleteMany(),
      prisma.vehicle.deleteMany(),
      prisma.purchaseRequest.deleteMany(),
      prisma.consortium.deleteMany(),
      prisma.recurringEntry.deleteMany(),
      prisma.capitalBeneficiary.deleteMany(),
      prisma.employee.deleteMany(),
      prisma.costCenter.deleteMany(),
      prisma.financialAccount.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.supplier.deleteMany(),
      prisma.companySettings.deleteMany(),
      prisma.user.deleteMany(),
    ];

    // Recria (pais primeiro). Só insere tabelas com registros.
    const inserts: [{ createMany: (a: { data: never[] }) => unknown }, string][] = [
      [prisma.companySettings, "companySettings"],
      [prisma.user, "users"],
      [prisma.supplier, "suppliers"],
      [prisma.customer, "customers"],
      [prisma.financialAccount, "financialAccounts"],
      [prisma.costCenter, "costCenters"],
      [prisma.consortium, "consortiums"],
      [prisma.recurringEntry, "recurringEntries"],
      [prisma.capitalBeneficiary, "capitalBeneficiaries"],
      [prisma.employee, "employees"],
      [prisma.part, "parts"],
      [prisma.vehicle, "vehicles"],
      [prisma.sale, "sales"],
      [prisma.partSale, "partSales"],
      [prisma.payable, "payables"],
      [prisma.vehicleCost, "vehicleCosts"],
      [prisma.receivable, "receivables"],
      [prisma.accountTransfer, "accountTransfers"],
      [prisma.capitalTransaction, "capitalTransactions"],
      [prisma.fuelEntry, "fuelEntries"],
      [prisma.purchaseRequest, "purchaseRequests"],
    ];
    for (const [model, key] of inserts) {
      const rows = arr(key);
      if (rows.length) ops.push(model.createMany({ data: rows }));
    }

    // Anexos de veículo: o arquivo vem em base64 no backup; volta para Bytes.
    // Entram depois dos veículos (têm FK para eles).
    const attachmentRows = arr("vehicleAttachments").map((a) => {
      const { data, ...rest } = a as Record<string, unknown>;
      return { ...rest, data: Buffer.from(String(data ?? ""), "base64") };
    });
    if (attachmentRows.length) {
      ops.push(prisma.vehicleAttachment.createMany({ data: attachmentRows as never[] }));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(ops as any);
  } catch {
    return {
      error:
        "Não foi possível restaurar. Confira se o arquivo é um backup completo e de uma versão compatível do sistema.",
    };
  }

  revalidatePath("/", "layout");
  return {
    success:
      "Backup restaurado com sucesso. Se os usuários mudaram, pode ser necessário entrar novamente.",
  };
}
