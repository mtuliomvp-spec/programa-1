"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  addPartStockWithPayable,
  createCashEntry,
  deleteCashEntry,
  registerPartSale,
  resolveSupplierByName,
} from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { assertBooksBalanced } from "@/lib/books-health";
import { assertCashboxOpen, getCashboxState } from "@/lib/cashbox";
import { assertCan } from "@/lib/guards";
import { assertMonthOpen } from "@/lib/monthly-closing";
import { parseDateInput } from "@/lib/format";
import { resolveDespesaCategory, resolveReceitaCategory } from "@/lib/categories";
import { isStructuralKey, STRUCTURAL_KEY_VALUES } from "@/lib/structural-flows";
import { nameKey } from "@/lib/person-keys";

const schema = z.object({
  kind: z.enum(["entrada", "saida"]),
  description: z.string().min(1, "Informe a descrição"),
  amount: z.coerce.number().min(0.01, "Informe um valor válido"),
  date: z.string().min(1, "Informe a data"),
  accountId: z.string().min(1, "Escolha a conta"),
  categoryLabel: z.string().optional(),
  documentNumber: z.string().optional(),
  structuralKey: z.enum(STRUCTURAL_KEY_VALUES).optional(),
  supplierName: z.string().optional(),
  vehicleId: z.string().optional(),
  // Fluxo Peças: peça do almoxarifado que entra/sai com este lançamento.
  partId: z.string().optional(),
  partQuantity: z.coerce.number().int().min(0).default(0),
  customerId: z.string().optional(),
  capitalBeneficiaryId: z.string().optional(),
  notes: z.string().optional(),
});

export type CashEntryState = {
  error?: string;
  ok?: boolean;
  /** O lançamento foi para a FILA do caixa (data fora do movimento aberto). */
  preLancado?: boolean;
  /** Data (dd/mm/aaaa) em que ele espera o caixa. */
  quando?: string;
};

/** Comprovante anexado ao lançamento (opcional): 15 MB, como no resto. */
const MAX_ANEXO = 15 * 1024 * 1024;

async function anexarComprovante(
  file: unknown,
  alvo: { payableId?: string | null; receivableId?: string | null },
) {
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_ANEXO) return;
  const data = Buffer.from(await file.arrayBuffer());
  const comum = {
    kind: "COMPROVANTE",
    description: "Comprovante de pagamento",
    filename: file.name || "comprovante",
    mimeType: file.type || "application/octet-stream",
    size: data.byteLength,
    data,
  };
  if (alvo.payableId) {
    await prisma.payableAttachment.create({ data: { payableId: alvo.payableId, ...comum } });
  } else if (alvo.receivableId) {
    await prisma.receivableAttachment.create({
      data: { receivableId: alvo.receivableId, ...comum, description: "Comprovante do recebimento" },
    });
  }
}

export type LeituraComprovante = {
  ok: boolean;
  error?: string;
  /** O PDF pede senha de abertura: a tela pede a senha e reenvia o arquivo. */
  senhaNecessaria?: boolean;
  /** Valor pago/recebido. */
  valor?: number | null;
  /** Data do comprovante (yyyy-mm-dd, para o campo de data). */
  data?: string | null;
  /** Para que lado o dinheiro andou: o formulário já marca Entrada ou Saída. */
  kind?: "entrada" | "saida" | null;
  /** Conta cadastrada reconhecida (a debitada na saída, a creditada na entrada). */
  accountId?: string | null;
  accountName?: string | null;
  /** Quem recebeu — vira o fornecedor sugerido. */
  beneficiario?: string | null;
  /** Descrição sugerida (o usuário ajusta). */
  descricao?: string | null;
  /** PIX, TED, DOC, TRANSFERENCIA, BOLETO… */
  formaPagamento?: string | null;
  /** Fluxo e categoria da última vez com este fornecedor (sugestão). */
  fluxo?: string | null;
  categoria?: string | null;
  /** Lançamento igual que já existe — mesmo valor, dia e conta. */
  duplicado?: { descricao: string; quando: string; status: string } | null;
  /**
   * Título/recebimento EM ABERTO que este comprovante provavelmente paga. O
   * lugar certo do comprovante é dentro dele (lá ele dá a baixa daquele
   * título); lançar aqui criaria um segundo lançamento para o mesmo dinheiro.
   */
  emAberto?: {
    id: string;
    numero: string;
    descricao: string;
    valor: number;
    vencimento: string;
    href: string;
    /** Por que casou: "mesmo valor" ou "mesmo beneficiário". */
    motivo: string;
    /** Quantos outros candidatos existem além deste. */
    outros: number;
  } | null;
};

/** Fornecedor já cadastrado com este nome — SEM criar um novo (a leitura não grava). */
async function fornecedorCadastrado(nome: string): Promise<string | null> {
  const limpo = nome.trim();
  if (!limpo) return null;
  const exato = await prisma.supplier.findFirst({
    where: { name: { equals: limpo, mode: "insensitive" } },
    select: { id: true },
  });
  if (exato) return exato.id;
  const chave = nameKey(limpo);
  if (!chave) return null;
  const todos = await prisma.supplier.findMany({ select: { id: true, name: true } });
  return todos.find((s) => nameKey(s.name) === chave)?.id ?? null;
}

/**
 * Título (ou recebimento) EM ABERTO que este comprovante provavelmente quita.
 *
 * O comprovante de um pagamento que JÁ TEM título pertence ao título: é lá que
 * ele confere valor/data/conta e dá a baixa daquele título. Lançado aqui, no
 * movimento de caixa, ele vira um SEGUNDO lançamento para o mesmo dinheiro — o
 * título continua em aberto e o caixa ganha uma saída repetida.
 *
 * Só avisa (não bloqueia): pode ser mesmo um pagamento sem título. Casa por
 * valor igual com vencimento perto da data do comprovante, ou pelo mesmo
 * beneficiário com valor próximo (boleto pago com juros/desconto).
 */
async function tituloEmAberto(
  kind: "entrada" | "saida",
  valor: number,
  data: Date,
  beneficiario: string | null,
): Promise<LeituraComprovante["emAberto"]> {
  const JANELA = 45 * 24 * 60 * 60 * 1000;
  const perto = { gte: new Date(data.getTime() - JANELA), lte: new Date(data.getTime() + JANELA) };
  const mesmoValor = { gte: valor - 0.005, lte: valor + 0.005 };
  // Valor próximo: boleto pago com juros/multa ou desconto não bate no centavo.
  // A folga é pequena de propósito — 5% ou R$ 20, o que for menor.
  const folga = Math.min(valor * 0.05, 20);
  const proximo = { gte: valor - folga, lte: valor + folga };
  const chaveBenef = nameKey(beneficiario || "");

  /** O candidato casa pelo beneficiário/fornecedor lido no comprovante? */
  const doBeneficiario = (nomes: (string | null | undefined)[]) =>
    chaveBenef.length >= 4 &&
    nomes.some((n) => {
      const k = nameKey(n || "");
      return k.length >= 4 && (k.includes(chaveBenef) || chaveBenef.includes(k));
    });

  if (kind === "saida") {
    const candidatos = await prisma.payable.findMany({
      where: {
        status: { not: "PAGO" },
        // Já pré-lançado não entra: esse caso é o do aviso de duplicidade.
        pendingPaymentDate: null,
        dueDate: perto,
        OR: [{ amount: mesmoValor }, { amount: proximo }],
      },
      orderBy: { dueDate: "asc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        description: true,
        amount: true,
        dueDate: true,
        supplier: { select: { name: true } },
        beneficiaryUser: { select: { name: true } },
        capitalBeneficiary: { select: { name: true } },
      },
    });
    const exatos = candidatos.filter((c) => Math.abs(c.amount - valor) <= 0.005);
    const porNome = candidatos.filter((c) =>
      doBeneficiario([c.supplier?.name, c.beneficiaryUser?.name, c.capitalBeneficiary?.name]),
    );
    // Preferência: valor exato E beneficiário; depois valor exato; depois
    // beneficiário com valor próximo. Sem nenhum dos três, não avisa nada.
    const escolhido =
      exatos.find((c) => porNome.includes(c)) ?? exatos[0] ?? porNome[0] ?? null;
    if (!escolhido) return null;
    const motivo =
      Math.abs(escolhido.amount - valor) <= 0.005
        ? porNome.includes(escolhido)
          ? "mesmo valor e mesmo beneficiário"
          : "mesmo valor"
        : "mesmo beneficiário, valor próximo";
    return {
      id: escolhido.id,
      numero: String(escolhido.orderNumber).padStart(4, "0"),
      descricao: escolhido.description,
      valor: escolhido.amount,
      vencimento: escolhido.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      href: `/financeiro/a-pagar/${escolhido.id}/editar`,
      motivo,
      outros: Math.max(0, new Set([...exatos, ...porNome]).size - 1),
    };
  }

  const candidatos = await prisma.receivable.findMany({
    where: {
      status: { not: "RECEBIDO" },
      pendingReceiptDate: null,
      dueDate: perto,
      OR: [{ amount: mesmoValor }, { amount: proximo }],
    },
    orderBy: { dueDate: "asc" },
    take: 6,
    select: {
      id: true,
      description: true,
      amount: true,
      dueDate: true,
      customer: { select: { name: true } },
      capitalBeneficiary: { select: { name: true } },
    },
  });
  const exatos = candidatos.filter((c) => Math.abs(c.amount - valor) <= 0.005);
  const porNome = candidatos.filter((c) =>
    doBeneficiario([c.customer?.name, c.capitalBeneficiary?.name]),
  );
  const escolhido = exatos.find((c) => porNome.includes(c)) ?? exatos[0] ?? porNome[0] ?? null;
  if (!escolhido) return null;
  return {
    id: escolhido.id,
    // O recebimento não tem número de ordem — quem identifica é a descrição.
    numero: "",
    descricao: escolhido.description,
    valor: escolhido.amount,
    vencimento: escolhido.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
    href: `/financeiro/a-receber/${escolhido.id}/editar`,
    motivo:
      Math.abs(escolhido.amount - valor) <= 0.005 ? "mesmo valor" : "mesmo pagador, valor próximo",
    outros: Math.max(0, new Set([...exatos, ...porNome]).size - 1),
  };
}

/**
 * Lançamento que já existe com o mesmo valor, no mesmo dia e na mesma conta —
 * pago ou esperando o caixa.
 *
 * Com o pré-lançamento vindo de vários lugares (título, lote, movimento de
 * caixa), lançar o mesmo comprovante duas vezes ficou fácil. Isto não bloqueia
 * nada: só avisa antes, que é quando dá para desistir.
 */
async function lancamentoIgual(
  valor: number,
  dia: Date,
  accountId: string | null,
): Promise<LeituraComprovante["duplicado"]> {
  const faixa = { gte: valor - 0.005, lte: valor + 0.005 };
  const conta = accountId ? { accountId } : {};
  const contaPre = accountId ? { pendingPaymentAccountId: accountId } : {};
  const titulo = await prisma.payable.findFirst({
    where: {
      amount: faixa,
      OR: [
        { paymentDate: dia, ...conta },
        { pendingPaymentDate: dia, ...contaPre },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { description: true, status: true, paymentDate: true, pendingPaymentDate: true },
  });
  if (titulo) {
    const quando = titulo.paymentDate ?? titulo.pendingPaymentDate ?? dia;
    return {
      descricao: titulo.description,
      quando: quando.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
      status: titulo.status === "PAGO" ? "já pago" : "esperando o caixa",
    };
  }
  const recebimento = await prisma.receivable.findFirst({
    where: {
      amount: faixa,
      OR: [
        { receivedDate: dia, ...conta },
        { pendingReceiptDate: dia, ...(accountId ? { pendingReceiptAccountId: accountId } : {}) },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { description: true, status: true, receivedDate: true, pendingReceiptDate: true },
  });
  if (!recebimento) return null;
  const quando = recebimento.receivedDate ?? recebimento.pendingReceiptDate ?? dia;
  return {
    descricao: recebimento.description,
    quando: quando.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
    status: recebimento.status === "RECEBIDO" ? "já recebido" : "esperando o caixa",
  };
}

/**
 * Lê o COMPROVANTE anexado no formulário e devolve o que dá para preencher
 * sozinho: valor, data, sentido (entrada/saída), conta, quem recebeu, uma
 * descrição e — pelo histórico do fornecedor — o fluxo e a categoria da última
 * vez. Avisa também quando já existe um lançamento igual.
 *
 * Não grava nada: quem grava é o lançamento, quando o usuário confirmar. Tudo
 * o que vem daqui é sugestão — a descrição e o fluxo seguem editáveis, porque
 * o comprovante diz o que o banco fez, não a que obra da loja aquilo pertence.
 */
export async function lerComprovanteCaixaAction(formData: FormData): Promise<LeituraComprovante> {
  try {
    await assertCan("financeiro", "criar");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sem permissão." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Anexe o comprovante." };
  if (file.size > MAX_ANEXO) return { ok: false, error: "Arquivo muito grande (máximo 15 MB)." };

  let buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  const { ehPdf, pdfPedeSenha, decifrarPdf, SenhaIncorretaError } = await import("@/lib/pdf-password");
  const senha = String(formData.get("senha") || "");
  if (ehPdf(buffer, mimeType) && (await pdfPedeSenha(buffer))) {
    if (!senha) {
      return {
        ok: false,
        senhaNecessaria: true,
        error: "Este comprovante está protegido por senha. Digite a senha do documento para o sistema ler.",
      };
    }
    try {
      buffer = Buffer.from(await decifrarPdf(buffer, senha));
    } catch (e) {
      return {
        ok: false,
        senhaNecessaria: true,
        error: e instanceof SenhaIncorretaError ? e.message : "Não foi possível abrir este PDF com a senha informada.",
      };
    }
  }

  let lido;
  try {
    const { extractPaymentReceipts } = await import("@/lib/receipts-ai");
    lido = (await extractPaymentReceipts(buffer.toString("base64"), mimeType))[0];
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não consegui ler este comprovante." };
  }
  if (!lido) {
    return { ok: false, error: "Não achei um comprovante neste arquivo. Confira se é o documento certo." };
  }

  // ENTRADA (Pix recebido, depósito): a conta da loja é a CREDITADA — a conta
  // do outro lado, a debitada, é do pagador e não está no nosso cadastro.
  const entrada = String(lido.sentido || "").toUpperCase() === "ENTRADA";
  const { contaDoComprovante } = await import("@/lib/payment-queue");
  const accountId = await contaDoComprovante(
    entrada
      ? { banco: lido.bancoDestino, agencia: lido.agenciaDestino, conta: lido.contaDestino }
      : lido,
  );
  const conta = accountId
    ? await prisma.financialAccount.findUnique({ where: { id: accountId }, select: { name: true } })
    : null;

  // Como este fornecedor foi classificado da última vez: o fluxo e a categoria
  // de um mesmo pagamento raramente mudam de mês para mês.
  let fluxo: string | null = null;
  let categoria: string | null = null;
  if (lido.beneficiario && !entrada) {
    const supplierId = await fornecedorCadastrado(lido.beneficiario);
    if (supplierId) {
      const ultimo = await prisma.payable.findFirst({
        where: { supplierId },
        orderBy: { createdAt: "desc" },
        select: { categoryLabel: true, costCenter: { select: { key: true } } },
      });
      categoria = ultimo?.categoryLabel ?? null;
      fluxo = isStructuralKey(ultimo?.costCenter?.key) ? ultimo!.costCenter!.key : null;
    }
  }

  const dataIso = lido.data && /^\d{4}-\d{2}-\d{2}$/.test(lido.data) ? lido.data : null;
  const duplicado =
    lido.valor != null && lido.valor > 0 && dataIso
      ? await lancamentoIgual(lido.valor, parseDateInput(dataIso), accountId)
      : null;
  // Este pagamento já tem título esperando? Então o comprovante é dele — aqui
  // ele viraria um segundo lançamento para o mesmo dinheiro.
  const emAberto =
    !duplicado && lido.valor != null && lido.valor > 0 && dataIso
      ? await tituloEmAberto(
          entrada ? "entrada" : "saida",
          lido.valor,
          parseDateInput(dataIso),
          lido.beneficiario ?? null,
        )
      : null;

  return {
    ok: true,
    valor: lido.valor ?? null,
    data: dataIso,
    kind: entrada ? "entrada" : "saida",
    accountId,
    accountName: conta?.name ?? null,
    beneficiario: lido.beneficiario ?? null,
    descricao: (lido.descricao || lido.beneficiario || "").trim() || null,
    formaPagamento: lido.formaPagamento ?? null,
    fluxo,
    categoria,
    duplicado,
    emAberto,
  };
}

export async function createCashEntryAction(
  _prev: CashEntryState,
  formData: FormData,
): Promise<CashEntryState> {
  try {
    await assertCan("financeiro", "criar");
    await assertBooksBalanced();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lançamento bloqueado." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Dados inválidos." };
  const d = parsed.data;
  const dataLancamento = parseDateInput(d.date);
  try {
    await assertMonthOpen(dataLancamento);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Mês fechado." };
  }

  /*
   * Data fora do movimento aberto = PRÉ-LANÇAMENTO.
   *
   * Todo lançamento tem a data do caixa aberto — é a trava que mantém caixa e
   * extrato conversando. Mas o dinheiro não espera o caixa: paga-se um boleto
   * hoje com o movimento ainda no dia 08. Antes isso era um erro ("ajuste a
   * data ou abra o caixa"); agora o lançamento nasce PENDENTE e vai para a
   * fila, igual ao título a pagar com comprovante — quando o movimento chegar
   * naquele dia, ele aparece pronto em Contas e caixas para o ok.
   */
  const { session } = await getCashboxState();
  const workDate = session && !session.closedAt ? session.workDate : null;
  const preLancar =
    !workDate || workDate.toISOString().slice(0, 10) !== dataLancamento.toISOString().slice(0, 10);
  if (!preLancar) {
    try {
      await assertCashboxOpen();
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Caixa fechado." };
    }
  }
  const quando = dataLancamento.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const filaOk = { ok: true, preLancado: preLancar, quando } as const;

  const label = (d.categoryLabel || "").trim();
  const isCapital = d.structuralKey === "CAPITAL";
  // Compra/venda de peça do almoxarifado: a categoria é do próprio movimento
  // (Compra de peças), então o formulário não pede categoria neste caso.
  const isPeca = d.structuralKey === "PECAS" && !!(d.partId || "").trim();
  const supplierName = (d.supplierName || "").trim();

  // Toda saída precisa de categoria; e de fornecedor — exceto no Capital, onde
  // o fornecedor é opcional (o valor pode ter sido pago ao próprio beneficiário).
  if (d.kind === "saida") {
    if (!label && !isPeca) return { error: "Informe a categoria do lançamento." };
    if (isCapital && !d.capitalBeneficiaryId) {
      return { error: "Escolha o beneficiário do capital." };
    }
    if (!supplierName && !isCapital) {
      return { error: "Informe o fornecedor do lançamento." };
    }
  } else {
    if (isCapital && !d.capitalBeneficiaryId) {
      // Entrada no Capital = aporte: precisa do beneficiário.
      return { error: "Escolha o beneficiário do capital (aporte)." };
    }
    // Entrada também é classificada (venda de peça do almoxarifado tem a
    // categoria do próprio movimento, como na saída).
    if (!label && !isPeca) return { error: "Informe a categoria do lançamento." };
  }

  // -------------------------------------------------------------------------
  // Fluxo PEÇAS com peça indicada: o lançamento mexe no almoxarifado.
  //   saída  = compra paga na hora  -> entra no estoque (custo médio)
  //   entrada = venda de balcão     -> sai do estoque (margem no L/P)
  // Sem peça indicada, segue como lançamento comum do fluxo Peças (frete,
  // ferramenta, etc.) — nada de estoque.
  // -------------------------------------------------------------------------
  if (isPeca) {
    const partId = (d.partId || "").trim();
    const quantidade = d.partQuantity;
    if (quantidade < 1) return { error: "Informe a quantidade de peças." };
    const peca = await prisma.part.findUnique({
      where: { id: partId },
      select: { id: true, name: true, quantity: true },
    });
    if (!peca) return { error: "Peça não encontrada." };
    const unitario = d.amount / quantidade;

    try {
      // O ESTOQUE se move agora nos dois casos (a peça entrou ou saiu de
      // verdade); o que espera o caixa, no pré-lançamento, é só o dinheiro.
      if (d.kind === "saida") {
        const { payableId } = await addPartStockWithPayable({
          partId,
          quantity: quantidade,
          costPrice: unitario,
          supplierId: supplierName ? await resolveSupplierByName(supplierName) : null,
          alreadyPaid: !preLancar,
          accountId: d.accountId,
          dueDate: dataLancamento,
          date: dataLancamento,
          description: d.description,
          documentNumber: d.documentNumber?.trim() || null,
          notes: d.notes || null,
        });
        await anexarComprovante(formData.get("file"), { payableId });
        if (preLancar && payableId) {
          const { enfileirarPagamento } = await import("@/lib/payment-queue");
          await enfileirarPagamento({
            payableId,
            data: dataLancamento,
            valor: d.amount,
            accountId: d.accountId,
            nota: null,
          });
        }
      } else {
        if (peca.quantity < quantidade) {
          return { error: `Estoque insuficiente de "${peca.name}". Disponível: ${peca.quantity}.` };
        }
        const venda = await registerPartSale({
          partId,
          customerId: d.customerId || null,
          quantity: quantidade,
          unitPrice: unitario,
          saleDate: dataLancamento,
          paymentMethod: "A_VISTA",
          accountId: d.accountId,
          notes: d.notes || d.description || null,
          pending: preLancar,
        });
        await anexarComprovante(formData.get("file"), { receivableId: venda.receivableId });
        if (preLancar && venda.receivableId) {
          const { enfileirarRecebimento } = await import("@/lib/payment-queue");
          await enfileirarRecebimento({
            receivableId: venda.receivableId,
            data: dataLancamento,
            valor: d.amount,
            accountId: d.accountId,
            nota: null,
          });
        }
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Não foi possível lançar a peça." };
    }

    revalidatePath("/pecas");
    revalidatePath(`/pecas/${partId}`);
    revalidatePath("/financeiro/livro-caixa");
    revalidatePath("/financeiro/contas");
    revalidatePath("/financeiro/a-pagar");
    revalidatePath("/financeiro/a-receber");
    revalidatePath("/");
    return filaOk;
  }

  // Resolve a categoria (rótulo canônico; cria custom se nova). Na SAÍDA o
  // enum da categoria vale — é ele que classifica a despesa. Na ENTRADA fica
  // só o rótulo: o enum da receita avulsa continua "OUTROS", que é o que o
  // Lucro/Prejuízo lê como outra receita. Escolher "Venda de veículo" aqui,
  // por exemplo, tiraria o dinheiro do resultado (caixa sobe, lucro não) e
  // derrubaria o farol — a classificação é do usuário, o motor não muda.
  const catDespesa = label && d.kind === "saida" ? await resolveDespesaCategory(label) : null;
  const catReceita = label && d.kind === "entrada" ? await resolveReceitaCategory(label) : null;
  const categoryLabel = catDespesa?.label ?? catReceita?.label ?? null;

  // Fornecedor: reaproveita ou cadastra pelo nome (ex.: o banco da tarifa).
  // Também no Capital — pode-se pagar a um fornecedor por conta do beneficiário.
  const supplierId =
    d.kind === "saida" && supplierName ? await resolveSupplierByName(supplierName) : null;

  const criado = await createCashEntry({
    kind: d.kind,
    description: d.description,
    amount: d.amount,
    date: dataLancamento,
    accountId: d.accountId,
    category: d.kind === "saida" ? catDespesa?.category ?? "OUTROS" : undefined,
    categoryLabel,
    documentNumber: d.documentNumber?.trim() || null,
    structuralKey: d.structuralKey,
    supplierId,
    vehicleId: d.structuralKey === "VEICULOS" ? d.vehicleId || null : null,
    customerId: d.kind === "entrada" ? d.customerId || null : null,
    capitalBeneficiaryId: isCapital ? d.capitalBeneficiaryId || null : null,
    notes: d.notes || null,
    pending: preLancar,
  });

  await anexarComprovante(
    formData.get("file"),
    d.kind === "saida" ? { payableId: criado.id } : { receivableId: criado.id },
  );

  // Pré-lançado: entra na fila do caixa daquele dia, esperando o ok — é o
  // mesmo lugar em que caem os títulos pagos antes de o movimento chegar.
  if (preLancar) {
    const { enfileirarPagamento, enfileirarRecebimento } = await import("@/lib/payment-queue");
    if (d.kind === "saida") {
      await enfileirarPagamento({
        payableId: criado.id,
        data: dataLancamento,
        valor: d.amount,
        accountId: d.accountId,
        nota: null,
      });
    } else {
      await enfileirarRecebimento({
        receivableId: criado.id,
        data: dataLancamento,
        valor: d.amount,
        accountId: d.accountId,
        nota: null,
      });
    }
  }

  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/estoque");
  revalidatePath("/capital");
  revalidatePath("/");
  return filaOk;
}

export async function deleteCashEntryAction(kind: "entrada" | "saida", id: string) {
  await assertCan("financeiro", "criar");
  await deleteCashEntry(kind, id);
  revalidatePath("/financeiro/livro-caixa");
  revalidatePath("/financeiro/contas");
  // Estornar uma baixa devolve o título a PENDENTE em Contas a pagar/receber e
  // pode desfazer uma retirada/aporte de capital — as mesmas telas que o create
  // revalida precisam ser atualizadas aqui, senão o título estornado não
  // reaparece como pendente (cache de rota) e o capital fica desatualizado.
  revalidatePath("/financeiro/a-pagar");
  revalidatePath("/financeiro/a-receber");
  revalidatePath("/financeiro/fluxo-caixa");
  revalidatePath("/capital");
  revalidatePath("/estoque");
  revalidatePath("/");
}
