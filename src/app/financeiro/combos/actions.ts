"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertCan, assertCanAny } from "@/lib/guards";
import { getSessionUser } from "@/lib/auth";
import { markPayablePaid, markPayablePending } from "@/lib/finance";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxWorkDate } from "@/lib/cashbox";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { freeCapitalOf } from "@/lib/investments";
import { structuralCenterId } from "@/lib/structural";
import { isAdminRole } from "@/lib/permissions";

const round2 = (n: number) => Math.round(n * 100) / 100;

type Result = { ok: boolean; error?: string };

function revalidate(comboId?: string) {
  revalidatePath("/financeiro/combos");
  if (comboId) revalidatePath(`/financeiro/combos/${comboId}`);
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/capital");
  revalidatePath("/");
}

/** Cria um combo ABERTO cujo beneficiário é o usuário logado. */
export async function createComboAction(name: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    await assertCan("combos", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const clean = (name || "").trim();
  if (!clean) return { ok: false, error: "Informe um nome para o combo." };
  const user = await getSessionUser();
  const combo = await prisma.paymentCombo.create({ data: { name: clean, userId: user?.id ?? null } });
  revalidate(combo.id);
  return { ok: true, id: combo.id };
}

/** Joga títulos (não pagos e sem combo) para dentro de um combo ABERTO ou
 * SOLICITADO (enquanto não for pago, o borderô ainda pode ser ajustado). */
export async function addPayablesToComboAction(comboId: string, ids: string[]): Promise<{ ok: boolean; added: number; error?: string }> {
  try {
    await assertCan("combos", "criar");
  } catch (e) {
    return { ok: false, added: 0, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (!ids.length) return { ok: false, added: 0, error: "Selecione ao menos um título." };
  const combo = await prisma.paymentCombo.findUnique({ where: { id: comboId }, select: { status: true } });
  if (!combo) return { ok: false, added: 0, error: "Combo não encontrado." };
  if (combo.status !== "ABERTO" && combo.status !== "SOLICITADO") {
    return { ok: false, added: 0, error: "Este combo já foi finalizado." };
  }
  const res = await prisma.payable.updateMany({
    where: { id: { in: ids }, status: { not: "PAGO" }, paymentComboId: null },
    data: { paymentComboId: comboId },
  });
  revalidate(comboId);
  return { ok: true, added: res.count };
}

/** Tira um título do combo (enquanto ABERTO ou SOLICITADO — não pago). */
export async function removePayableFromComboAction(payableId: string): Promise<Result> {
  try {
    await assertCan("combos", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const p = await prisma.payable.findUnique({
    where: { id: payableId },
    select: { paymentComboId: true, paymentCombo: { select: { status: true } } },
  });
  if (!p?.paymentComboId) return { ok: false, error: "Título não está em um combo." };
  if (p.paymentCombo?.status !== "ABERTO" && p.paymentCombo?.status !== "SOLICITADO") {
    return { ok: false, error: "O combo já foi finalizado." };
  }
  await prisma.payable.update({ where: { id: payableId }, data: { paymentComboId: null } });
  revalidate(p.paymentComboId);
  return { ok: true };
}

/** Encerra o combo: ABERTO → SOLICITADO (gera o total/borderô a pagar). */
export async function requestComboAction(comboId: string): Promise<Result> {
  try {
    await assertCan("combos", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const combo = await prisma.paymentCombo.findUnique({
    where: { id: comboId },
    select: { status: true, _count: { select: { payables: true } } },
  });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status !== "ABERTO") return { ok: false, error: "Este combo já foi fechado." };
  if (combo._count.payables === 0) return { ok: false, error: "Adicione ao menos um título antes de solicitar o pagamento." };
  await prisma.paymentCombo.update({ where: { id: comboId }, data: { status: "SOLICITADO", requestedAt: new Date() } });
  revalidate(comboId);
  return { ok: true };
}

/** Exclui um combo CANCELADO — só administrador. */
export async function deleteComboAction(comboId: string): Promise<Result> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sessão expirada." };
  if (!isAdminRole(user.role)) return { ok: false, error: "Apenas administrador pode excluir combos." };
  const combo = await prisma.paymentCombo.findUnique({ where: { id: comboId }, select: { status: true } });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status !== "CANCELADO") return { ok: false, error: "Só é possível excluir combos cancelados." };
  await prisma.$transaction([
    // Garantia: solta qualquer título ainda vinculado antes de apagar.
    prisma.payable.updateMany({ where: { paymentComboId: comboId }, data: { paymentComboId: null } }),
    prisma.paymentCombo.delete({ where: { id: comboId } }),
  ]);
  revalidate();
  return { ok: true };
}

/** Define como o beneficiário quer receber: conta cadastrada ou PIX. */
export async function setComboPayoutMethodAction(comboId: string, method: "conta" | "pix"): Promise<Result> {
  try {
    await assertCanAny([
      ["combos", "criar"],
      ["combos", "aprovar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  if (method !== "conta" && method !== "pix") return { ok: false, error: "Forma inválida." };
  const combo = await prisma.paymentCombo.findUnique({ where: { id: comboId }, select: { status: true } });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status === "PAGO" || combo.status === "CANCELADO") {
    return { ok: false, error: "Combo já finalizado — não é possível alterar." };
  }
  await prisma.paymentCombo.update({ where: { id: comboId }, data: { payoutMethod: method } });
  revalidate(comboId);
  return { ok: true };
}

/** Liga/desliga o pagamento integral (não abater o saldo devedor do beneficiário). */
export async function setComboPayFullAction(comboId: string, value: boolean): Promise<Result> {
  try {
    await assertCanAny([
      ["combos", "criar"],
      ["combos", "aprovar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const combo = await prisma.paymentCombo.findUnique({ where: { id: comboId }, select: { status: true } });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status === "PAGO" || combo.status === "CANCELADO") {
    return { ok: false, error: "Combo já finalizado — não é possível alterar." };
  }
  await prisma.paymentCombo.update({ where: { id: comboId }, data: { payFull: value } });
  revalidate(comboId);
  return { ok: true };
}

/** Paga o combo: quita todos os títulos de uma vez na conta escolhida. */
export async function payComboAction(comboId: string, accountId: string): Promise<Result> {
  try {
    await assertCan("combos", "aprovar");
    await assertBooksBalanced();
    await assertCashboxOpen();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bloqueado." };
  }
  if (!accountId) return { ok: false, error: "Escolha a conta que fará o pagamento." };
  const date = await getCashboxWorkDate();
  try {
    await assertMonthOpen(date);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Mês fechado." };
  }
  const combo = await prisma.paymentCombo.findUnique({
    where: { id: comboId },
    select: {
      status: true,
      name: true,
      userId: true,
      payFull: true,
      payables: { where: { status: { not: "PAGO" } }, select: { id: true, amount: true } },
    },
  });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status !== "SOLICITADO") return { ok: false, error: "Solicite o pagamento do combo antes de pagá-lo." };

  // Beneficiário do combo (quem o montou) com saldo LIVRE de capital negativo:
  // parte do total cobre esse débito como APORTE (igual à comissão do vendedor);
  // o resto sai em dinheiro. Fica equação-neutra (aporte na mesma conta).
  // Se o combo estiver marcado como "valor integral" (payFull), não abate.
  const total = round2(combo.payables.reduce((s, p) => s + p.amount, 0));
  let abate = 0;
  let beneficiary: { id: string; name: string } | null = null;
  if (combo.userId && !combo.payFull) {
    beneficiary = await prisma.capitalBeneficiary.findUnique({
      where: { userId: combo.userId },
      select: { id: true, name: true },
    });
    if (beneficiary) {
      const free = await freeCapitalOf(beneficiary.id);
      const debt = Math.max(0, round2(-free));
      abate = round2(Math.min(total, debt));
    }
  }

  // 1) Quita todos os títulos do combo na conta escolhida.
  for (const p of combo.payables) {
    await markPayablePaid(p.id, date, accountId);
  }

  // 2) Abate o saldo devedor do beneficiário: aporte na mesma conta (o par
  //    recebível↔capital é neutro e o DRE exclui o aporte pelo receivableId).
  if (abate > 0.005 && beneficiary) {
    const capitalCenterId = await structuralCenterId("CAPITAL");
    await prisma.$transaction(async (tx) => {
      const receivable = await tx.receivable.create({
        data: {
          costCenterId: capitalCenterId,
          description: `Aporte p/ abater saldo devedor de capital (combo ${combo.name}) - ${beneficiary!.name}`,
          category: "OUTROS",
          amount: abate,
          dueDate: date,
          receivedDate: date,
          status: "RECEBIDO",
          accountId,
          capitalBeneficiaryId: beneficiary!.id,
        },
      });
      await tx.capitalTransaction.create({
        data: {
          beneficiaryId: beneficiary!.id,
          kind: "APORTE",
          amount: abate,
          date,
          description: `Abatido do saldo devedor pelo combo ${combo.name}`,
          receivableId: receivable.id,
        },
      });
    });
  }

  await prisma.paymentCombo.update({
    where: { id: comboId },
    data: {
      status: "PAGO",
      paidAt: date,
      accountId,
      capitalAbatement: abate,
      // Pago é pago: se o combo estava pré-lançado (comprovante já lido), a
      // linha da fila do caixa sai junto — senão ficaria órfã pedindo um ok.
      pendingPaymentDate: null,
      pendingPaymentAmount: null,
      pendingPaymentAccountId: null,
      pendingPaymentNote: null,
    },
  });
  revalidate(comboId);
  return { ok: true };
}

/**
 * Reverte o pagamento de um combo PAGO: estorna todos os títulos (voltam a
 * PENDENTE, ainda presos ao combo — a retirada de capital de cada um é
 * desfeita e solicitações de compra concluídas voltam para Aprovada), desfaz
 * o abatimento de saldo devedor (apaga o par recebível↔aporte) e devolve o
 * combo para SOLICITADO — pronto para corrigir os títulos e pagar de novo.
 */
export async function revertComboPaymentAction(comboId: string): Promise<Result> {
  try {
    await assertCan("combos", "aprovar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const combo = await prisma.paymentCombo.findUnique({
    where: { id: comboId },
    select: {
      status: true,
      name: true,
      userId: true,
      paidAt: true,
      capitalAbatement: true,
      payables: { where: { status: "PAGO" }, select: { id: true } },
    },
  });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status !== "PAGO") return { ok: false, error: "Este combo não está pago." };
  if (combo.paidAt) {
    try {
      await assertMonthOpen(combo.paidAt);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "O mês do pagamento já foi fechado." };
    }
  }

  // Estorna título a título (mesma rotina do estorno individual: desfaz a
  // retirada de capital e reabre a solicitação de compra vinculada).
  for (const p of combo.payables) {
    await markPayablePending(p.id);
  }

  // Desfaz o abatimento do saldo devedor: apaga o aporte e o recebível gerados
  // na baixa (identificados pela descrição padrão + beneficiário + valor).
  if (combo.capitalAbatement > 0.005 && combo.userId) {
    const beneficiary = await prisma.capitalBeneficiary.findUnique({
      where: { userId: combo.userId },
      select: { id: true },
    });
    if (beneficiary) {
      const receivable = await prisma.receivable.findFirst({
        where: {
          capitalBeneficiaryId: beneficiary.id,
          status: "RECEBIDO",
          amount: combo.capitalAbatement,
          description: { startsWith: `Aporte p/ abater saldo devedor de capital (combo ${combo.name})` },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (receivable) {
        await prisma.$transaction([
          prisma.capitalTransaction.deleteMany({ where: { receivableId: receivable.id } }),
          prisma.receivable.delete({ where: { id: receivable.id } }),
        ]);
      }
    }
  }

  await prisma.paymentCombo.update({
    where: { id: comboId },
    data: { status: "SOLICITADO", paidAt: null, accountId: null, capitalAbatement: 0 },
  });
  revalidate(comboId);
  return { ok: true };
}

/** Cancela o combo (não pago): solta os títulos de volta e marca CANCELADO. */
export async function cancelComboAction(comboId: string): Promise<Result> {
  try {
    await assertCan("combos", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const combo = await prisma.paymentCombo.findUnique({ where: { id: comboId }, select: { status: true } });
  if (!combo) return { ok: false, error: "Combo não encontrado." };
  if (combo.status === "PAGO") return { ok: false, error: "Combo já pago — não pode ser cancelado." };
  await prisma.$transaction([
    prisma.payable.updateMany({ where: { paymentComboId: comboId }, data: { paymentComboId: null } }),
    prisma.paymentCombo.update({ where: { id: comboId }, data: { status: "CANCELADO" } }),
  ]);
  revalidate(comboId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Comprovante do combo: conferir o borderô e pré-lançar
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

export type ReadComboReceiptResult = {
  ok: boolean;
  error?: string;
  /** O arquivo foi anexado ao combo mesmo que a leitura falhe. */
  attached: boolean;
  /** O PDF pede senha de abertura: a tela pede a senha e reenvia o arquivo. */
  senhaNecessaria?: boolean;
  valor?: number | null;
  data?: string | null;
  contaLida?: string | null;
  beneficiario?: string | null;
  formaPagamento?: string | null;
  accountName?: string | null;
  /** O combo entrou na fila de espera do caixa. */
  enfileirado?: boolean;
  avisos?: string[];
};

/**
 * Lê o COMPROVANTE do pagamento de um combo (borderô) e põe o combo inteiro na
 * fila de espera do caixa.
 *
 * O combo é pago de uma vez só, então o comprovante é UM para todos os títulos
 * dele: anexá-lo a um título qualquer escondia isso, e não havia como
 * pré-lançar o borderô — ele ficava fora do que a tela de Contas e caixas
 * mostra como já pago. Aqui o arquivo fica no combo e a fila recebe uma linha
 * só; o ok, quando o movimento chegar no dia, baixa todos os títulos juntos
 * pelo mesmo caminho do botão "Pagar combo".
 */
export async function readComboReceiptAction(formData: FormData): Promise<ReadComboReceiptResult> {
  const vazio = { attached: false };
  try {
    await assertCanAny([
      ["combos", "criar"],
      ["combos", "aprovar"],
      ["financeiro", "pagar"],
    ]);
  } catch (e) {
    return { ok: false, ...vazio, error: e instanceof Error ? e.message : "Sem permissão." };
  }

  const comboId = String(formData.get("comboId") || "").trim();
  const file = formData.get("file");
  if (!comboId) return { ok: false, ...vazio, error: "Combo inválido." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, ...vazio, error: "Selecione o arquivo do comprovante." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, ...vazio, error: "Arquivo muito grande (máximo 15 MB)." };
  }

  const combo = await prisma.paymentCombo.findUnique({
    where: { id: comboId },
    select: {
      id: true,
      name: true,
      status: true,
      user: { select: { name: true, document: true } },
      payables: { where: { status: { not: "PAGO" } }, select: { amount: true, dueDate: true } },
    },
  });
  if (!combo) return { ok: false, ...vazio, error: "Combo não encontrado." };
  if (combo.status === "CANCELADO") {
    return { ok: false, ...vazio, error: "Combo cancelado — não há o que pré-lançar." };
  }

  let buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  // Mesma regra do título: comprovante em PDF com senha é decifrado antes de
  // ser lido e guardado (o que fica anexado abre sem senha depois).
  const { ehPdf, pdfPedeSenha, decifrarPdf, SenhaIncorretaError } = await import("@/lib/pdf-password");
  const senha = String(formData.get("senha") || "");
  if (ehPdf(buffer, mimeType) && (await pdfPedeSenha(buffer))) {
    if (!senha) {
      return {
        ok: false,
        ...vazio,
        senhaNecessaria: true,
        error: "Este comprovante está protegido por senha. Digite a senha do documento para o sistema abrir, ler e anexar.",
      };
    }
    try {
      buffer = Buffer.from(await decifrarPdf(buffer, senha));
    } catch (e) {
      return {
        ok: false,
        ...vazio,
        senhaNecessaria: true,
        error: e instanceof SenhaIncorretaError ? e.message : "Não foi possível abrir este PDF com a senha informada.",
      };
    }
  }

  // Um comprovante por combo (como o slot do título): reler substitui.
  await prisma.comboAttachment.deleteMany({ where: { comboId, kind: "COMPROVANTE" } });
  await prisma.comboAttachment.create({
    data: {
      comboId,
      kind: "COMPROVANTE",
      description: "Comprovante de pagamento",
      filename: file.name || "comprovante",
      mimeType,
      size: buffer.byteLength,
      data: buffer,
    },
  });
  revalidate(comboId);

  // Combo já pago: o comprovante é só o arquivo do que já foi baixado.
  if (combo.status === "PAGO") return { ok: true, attached: true, enfileirado: false };

  let lido;
  try {
    const { extractPaymentReceipts } = await import("@/lib/receipts-ai");
    const todos = await extractPaymentReceipts(buffer.toString("base64"), mimeType);
    lido = todos[0] ?? null;
  } catch (e) {
    return {
      ok: false,
      attached: true,
      error: `${e instanceof Error ? e.message : "Não foi possível ler o comprovante."} O arquivo ficou anexado — pague o combo à mão.`,
    };
  }
  if (!lido || lido.valor == null || lido.valor <= 0 || !lido.data || !/^\d{4}-\d{2}-\d{2}$/.test(lido.data)) {
    return {
      ok: false,
      attached: true,
      error: "Não consegui ler valor e data do comprovante — ele ficou anexado, mas o pagamento terá de ser manual.",
      valor: lido?.valor ?? null,
      data: lido?.data ?? null,
    };
  }

  const { contaDoComprovante, conferirComprovante, enfileirarCombo } = await import("@/lib/payment-queue");
  const { parseDateInput } = await import("@/lib/format");
  const dataPagamento = parseDateInput(lido.data);
  const accountId = await contaDoComprovante(lido);
  const conta = accountId
    ? await prisma.financialAccount.findUnique({ where: { id: accountId }, select: { name: true } })
    : null;

  const total = round2(combo.payables.reduce((s, p) => s + p.amount, 0));
  // Vencimento da conferência: o mais antigo do combo — é o que diz se atrasou.
  const vencimento = combo.payables.reduce<Date>(
    (menor, p) => (p.dueDate < menor ? p.dueDate : menor),
    combo.payables[0]?.dueDate ?? dataPagamento,
  );
  const { avisos } = conferirComprovante(
    {
      amount: total,
      dueDate: vencimento,
      description: `Combo ${combo.name}`,
      rotulo: "combo",
      // Quem recebe o borderô é quem o montou.
      partes: combo.user ? [{ nome: combo.user.name, documento: combo.user.document }] : [],
    },
    {
      valor: lido.valor,
      data: dataPagamento,
      beneficiario: lido.beneficiario,
      documentoBeneficiario: lido.documentoBeneficiario,
      formaPagamento: lido.formaPagamento,
    },
  );
  if (!accountId) {
    avisos.push(
      lido.contaDebitada
        ? `conta debitada "${lido.contaDebitada}" não bate com nenhuma conta cadastrada — escolha a conta ao confirmar`
        : "conta debitada não identificada no comprovante — escolha a conta ao confirmar",
    );
  }

  // O comprovante prova que o borderô saiu do banco: um combo ainda ABERTO é
  // fechado aqui (mesmo efeito de "Solicitar pagamento"), senão o ok da fila
  // esbarraria em "solicite o pagamento antes de pagá-lo".
  if (combo.status === "ABERTO") {
    await prisma.paymentCombo.update({
      where: { id: comboId },
      data: { status: "SOLICITADO", requestedAt: new Date() },
    });
    avisos.push("o combo estava aberto e foi fechado para pagamento");
  }

  await enfileirarCombo({
    comboId,
    data: dataPagamento,
    valor: lido.valor,
    accountId,
    nota: avisos.join(" · ") || null,
  });

  revalidate(comboId);
  return {
    ok: true,
    attached: true,
    enfileirado: true,
    valor: lido.valor,
    data: lido.data,
    contaLida: lido.contaDebitada ?? null,
    beneficiario: lido.beneficiario ?? null,
    formaPagamento: lido.formaPagamento ?? null,
    accountName: conta?.name ?? null,
    avisos,
  };
}

/** Tira o comprovante do combo (e o combo da fila, se estava pré-lançado). */
export async function removeComboReceiptAction(comboId: string): Promise<Result> {
  try {
    await assertCanAny([
      ["combos", "criar"],
      ["combos", "aprovar"],
      ["financeiro", "pagar"],
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const { desenfileirarCombo } = await import("@/lib/payment-queue");
  await prisma.comboAttachment.deleteMany({ where: { comboId, kind: "COMPROVANTE" } });
  await desenfileirarCombo(comboId);
  revalidate(comboId);
  return { ok: true };
}
