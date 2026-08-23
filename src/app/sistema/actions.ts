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
  if (!user || user.role !== "SUPER_ADMIN") {
    return { error: "Apenas administradores podem zerar os dados." };
  }
  const confirm = String(formData.get("confirm") || "").trim();
  if (confirm !== "ZERAR") {
    return { error: 'Para confirmar, digite exatamente ZERAR (em maiúsculas).' };
  }

  try {
    // Ordem respeitando as chaves estrangeiras (filhos primeiro). Cobre TODAS
    // as tabelas operacionais — preserva só usuários, perfis e parâmetros.
    await prisma.$transaction([
      prisma.investmentAllocation.deleteMany(),
      prisma.vehicleAttachment.deleteMany(),
      prisma.capitalTransaction.deleteMany(),
      prisma.accountTransfer.deleteMany(),
      prisma.fuelEntry.deleteMany(),
      prisma.vehicleCost.deleteMany(),
      prisma.receivable.deleteMany(),
      prisma.payable.deleteMany(),
      prisma.partSale.deleteMany(),
      prisma.sale.deleteMany(),
      prisma.preSale.deleteMany(),
      prisma.purchaseRequest.deleteMany(),
      prisma.recurringEntry.deleteMany(),
      prisma.part.deleteMany(),
      prisma.vehicle.deleteMany(),
      prisma.consortium.deleteMany(),
      prisma.monthlyClosing.deleteMany(),
      prisma.stockInterestRun.deleteMany(),
      prisma.cashboxSession.deleteMany(),
      prisma.launchCategory.deleteMany(),
      prisma.employee.deleteMany(),
      prisma.capitalBeneficiary.deleteMany(),
      prisma.costCenter.deleteMany(),
      prisma.financialAccount.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.supplier.deleteMany(),
      // Reinicia os contadores (sequences) dos números de documento para que
      // ordens/contratos/fichas/ordens de pagamento recomecem do 0001.
      prisma.$executeRawUnsafe(`
        DO $$
        BEGIN
          PERFORM setval(pg_get_serial_sequence('vehicles','orderNumber'), 1, false);
          PERFORM setval(pg_get_serial_sequence('sales','orderNumber'), 1, false);
          PERFORM setval(pg_get_serial_sequence('payables','orderNumber'), 1, false);
          PERFORM setval(pg_get_serial_sequence('pre_sales','number'), 1, false);
          PERFORM setval(pg_get_serial_sequence('purchase_requests','number'), 1, false);
        END $$;
      `),
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
  if (!user || user.role !== "SUPER_ADMIN") {
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
      // Apaga TUDO (filhos primeiro), incluindo usuários, perfis e parâmetros.
      prisma.investmentAllocation.deleteMany(),
      prisma.vehicleAttachment.deleteMany(),
      prisma.capitalTransaction.deleteMany(),
      prisma.accountTransfer.deleteMany(),
      prisma.fuelEntry.deleteMany(),
      prisma.vehicleCost.deleteMany(),
      prisma.receivable.deleteMany(),
      prisma.payable.deleteMany(),
      prisma.partSale.deleteMany(),
      prisma.sale.deleteMany(),
      prisma.preSale.deleteMany(),
      prisma.purchaseRequest.deleteMany(),
      prisma.recurringEntry.deleteMany(),
      prisma.part.deleteMany(),
      prisma.vehicle.deleteMany(),
      prisma.consortium.deleteMany(),
      prisma.monthlyClosing.deleteMany(),
      prisma.stockInterestRun.deleteMany(),
      prisma.cashboxSession.deleteMany(),
      prisma.launchCategory.deleteMany(),
      prisma.employee.deleteMany(),
      prisma.capitalBeneficiary.deleteMany(),
      prisma.costCenter.deleteMany(),
      prisma.financialAccount.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.supplier.deleteMany(),
      prisma.companyDocument.deleteMany(),
      prisma.companySettings.deleteMany(),
      prisma.user.deleteMany(),
      prisma.profile.deleteMany(),
    ];

    // Recria (pais primeiro). Só insere tabelas com registros.
    const inserts: [{ createMany: (a: { data: never[] }) => unknown }, string][] = [
      [prisma.profile, "profiles"],
      [prisma.companySettings, "companySettings"],
      [prisma.user, "users"],
      [prisma.supplier, "suppliers"],
      [prisma.customer, "customers"],
      [prisma.financialAccount, "financialAccounts"],
      [prisma.costCenter, "costCenters"],
      [prisma.consortium, "consortiums"],
      [prisma.recurringEntry, "recurringEntries"],
      [prisma.capitalBeneficiary, "capitalBeneficiaries"],
      [prisma.investmentAllocation, "investmentAllocations"],
      [prisma.employee, "employees"],
      [prisma.part, "parts"],
      [prisma.vehicle, "vehicles"],
      [prisma.preSale, "preSales"],
      [prisma.sale, "sales"],
      [prisma.partSale, "partSales"],
      [prisma.payable, "payables"],
      [prisma.vehicleCost, "vehicleCosts"],
      [prisma.receivable, "receivables"],
      [prisma.accountTransfer, "accountTransfers"],
      [prisma.cashboxSession, "cashboxSessions"],
      [prisma.launchCategory, "launchCategories"],
      [prisma.stockInterestRun, "stockInterestRuns"],
      [prisma.monthlyClosing, "monthlyClosings"],
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

    // Documentos da empresa: mesmo esquema (arquivo em base64 → Bytes).
    const companyDocRows = arr("companyDocuments").map((d) => {
      const { data, ...rest } = d as Record<string, unknown>;
      return { ...rest, data: Buffer.from(String(data ?? ""), "base64") };
    });
    if (companyDocRows.length) {
      ops.push(prisma.companyDocument.createMany({ data: companyDocRows as never[] }));
    }

    // Alinha os contadores (sequences) ao maior número restaurado, para o
    // próximo lançamento não colidir com um número já existente (@unique).
    ops.push(
      prisma.$executeRawUnsafe(`
        DO $$
        DECLARE v bigint;
        BEGIN
          SELECT COALESCE(MAX("orderNumber"),0) INTO v FROM "vehicles";
          PERFORM setval(pg_get_serial_sequence('vehicles','orderNumber'), GREATEST(v,1), v > 0);
          SELECT COALESCE(MAX("orderNumber"),0) INTO v FROM "sales";
          PERFORM setval(pg_get_serial_sequence('sales','orderNumber'), GREATEST(v,1), v > 0);
          SELECT COALESCE(MAX("orderNumber"),0) INTO v FROM "payables";
          PERFORM setval(pg_get_serial_sequence('payables','orderNumber'), GREATEST(v,1), v > 0);
          SELECT COALESCE(MAX("number"),0) INTO v FROM "pre_sales";
          PERFORM setval(pg_get_serial_sequence('pre_sales','number'), GREATEST(v,1), v > 0);
          SELECT COALESCE(MAX("number"),0) INTO v FROM "purchase_requests";
          PERFORM setval(pg_get_serial_sequence('purchase_requests','number'), GREATEST(v,1), v > 0);
        END $$;
      `),
    );

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

/**
 * Bloqueio do sistema (modo manutenção): liga/desliga o interruptor global.
 * Somente ADMIN. Registra quem e quando.
 */
export async function toggleSystemLockAction(
  lock: boolean,
): Promise<{ ok: boolean; locked?: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return { ok: false, error: "Apenas administradores podem bloquear o sistema." };
  }
  await prisma.companySettings.upsert({
    where: { id: "company" },
    update: {
      systemLocked: lock,
      systemLockedBy: lock ? user.name : null,
      systemLockedAt: lock ? new Date() : null,
    },
    create: {
      id: "company",
      systemLocked: lock,
      systemLockedBy: lock ? user.name : null,
      systemLockedAt: lock ? new Date() : null,
    },
  });
  revalidatePath("/", "layout");
  return { ok: true, locked: lock };
}
