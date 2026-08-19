import { prisma } from "@/lib/prisma";
import { timed } from "@/lib/perf";
import { ensureRecurringGeneratedForPage } from "@/lib/recurring";
import { getActiveAccounts } from "@/lib/accounts";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { capitalStatusByBeneficiary, freeCapitalOf } from "@/lib/investments";
import { getCashboxState } from "@/lib/cashbox";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { Card, EmptyState, LinkButton, PageHeader, Select } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import Can from "@/components/Can";
import { userCan } from "@/lib/guards";
import PayablesTable, { type PayableRow } from "./PayablesTable";
import SolicitedCombosCard, { type SolicitedCombo } from "./SolicitedCombosCard";
import ImportReceiptsButton from "./ImportReceiptsButton";
import ImportDuplicatasButton from "./ImportDuplicatasButton";

export const dynamic = "force-dynamic";

const categoryLabel = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  DEVOLUCAO_CLIENTE: "Devolução ao cliente",
  DEVOLUCAO_PROPRIETARIO: "Devolução ao proprietário",
  OUTROS: "Outros",
} as const;

export default async function ContasAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; de?: string; ate?: string; min?: string; max?: string; fornecedor?: string; beneficiario?: string; veiculo?: string; vendidos?: string; p?: string }>;
}) {
  const { status: statusFilter, q: qParam, de, ate, min, max, fornecedor, beneficiario, veiculo, vendidos, p: pParam } = await searchParams;
  const q = (qParam || "").trim();
  const [canPagar, canManage, canCombo, canPayCombo, canEditOnly, canFixDate] = await Promise.all([
    userCan("financeiro", "pagar"),
    userCan("financeiro", "criar"),
    userCan("combos", "criar"),
    userCan("combos", "aprovar"),
    userCan("financeiro", "editar"),
    userCan("financeiro", "corrigirdata"),
  ]);
  // Link "Editar" da linha: lançadores OU quem tem só a permissão de editar.
  const canEdit = canManage || canEditOnly;
  await ensureRecurringGeneratedForPage();

  const [payables, accounts, cashbox] = await timed("tela: contas a pagar", () =>
    Promise.all([
      // `select` enxuto de propósito: `supplier: true`/`vehicle: true` traziam a
      // linha inteira de cada cadastro (o veículo tem dezenas de colunas) para
      // milhares de títulos — era o maior peso da tela.
      prisma.payable.findMany({
        orderBy: { dueDate: "asc" },
        select: {
          id: true,
          orderNumber: true,
          description: true,
          category: true,
          categoryLabel: true,
          documentNumber: true,
          amount: true,
          dueDate: true,
          status: true,
          paymentDate: true,
          recurringId: true,
          saleId: true,
          purchaseRequestId: true,
          capitalBeneficiaryId: true,
          beneficiaryUserId: true,
          cardInvoice: true,
          supplierId: true,
          supplier: { select: { id: true, name: true } },
          vehicleId: true,
          vehicle: { select: { id: true, brand: true, model: true, plate: true, status: true } },
          // Para o filtro "vendidos" (linha do painel): custo pré-venda de carro vendido.
          vehicleCost: { select: { postSale: true } },
          account: { select: { name: true } },
          beneficiaryUser: { select: { id: true, name: true } },
          capitalBeneficiary: { select: { id: true, name: true } },
          paymentCombo: { select: { id: true, name: true, status: true, user: { select: { name: true } } } },
          _count: { select: { attachments: true } },
          purchaseRequest: { select: { _count: { select: { attachments: true } } } },
        },
      }),
      getActiveAccounts(),
      getCashboxState(),
    ]),
  );
  // Combos ABERTOS para o botão "Adicionar ao combo" na seleção em lote.
  const openCombos = await prisma.paymentCombo.findMany({
    where: { status: "ABERTO" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
  // Data em que as baixas vão cair (data de trabalho do caixa aberto).
  const cashboxDate =
    cashbox.open && cashbox.session ? formatDate(cashbox.session.workDate) : null;

  const withStatus = payables.map((p) => ({ ...p, effective: effectivePayableStatus(p.status, p.dueDate) }));

  // Combos SOLICITADOS viram pagamento ÚNICO: seus títulos pendentes saem da
  // tabela individual e aparecem agrupados no card próprio, com baixa única.
  const inSolicitedCombo = (p: (typeof withStatus)[number]) =>
    p.paymentCombo?.status === "SOLICITADO" && p.effective !== "PAGO";
  const solicitedComboMap = new Map<string, SolicitedCombo>();
  for (const p of withStatus) {
    if (!inSolicitedCombo(p)) continue;
    const combo = p.paymentCombo!;
    const entry = solicitedComboMap.get(combo.id) ?? {
      id: combo.id,
      name: combo.name,
      userName: combo.user?.name ?? null,
      count: 0,
      total: 0,
    };
    entry.count += 1;
    entry.total = Math.round((entry.total + p.amount) * 100) / 100;
    solicitedComboMap.set(combo.id, entry);
  }
  const solicitedCombos = Array.from(solicitedComboMap.values());

  // Opções distintas presentes nos títulos, para os filtros separados.
  const supplierOptions = Array.from(
    new Map(payables.filter((p) => p.supplier).map((p) => [p.supplier!.id, p.supplier!.name])).entries(),
  )
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const vehicleOptions = Array.from(
    new Map(
      payables.filter((p) => p.vehicle).map((p) => [p.vehicle!.id, `${p.vehicle!.brand} ${p.vehicle!.model} · ${p.vehicle!.plate}`]),
    ).entries(),
  )
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  // Beneficiários = vendedores (usuário, valor "u:<id>") + sócios do capital
  // (valor "c:<id>", com sufixo), unidos numa lista só.
  const beneficiaryMap = new Map<string, string>();
  for (const p of payables) {
    if (p.beneficiaryUser) beneficiaryMap.set(`u:${p.beneficiaryUser.id}`, p.beneficiaryUser.name);
    if (p.capitalBeneficiary) beneficiaryMap.set(`c:${p.capitalBeneficiary.id}`, `${p.capitalBeneficiary.name} (sócio)`);
  }
  const beneficiaryOptions = Array.from(beneficiaryMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const filtered = withStatus.filter((p) => {
    if (inSolicitedCombo(p)) return false;
    // "NAO_PAGO" agrupa pendente + atrasado: é tudo que ainda tem de ser pago.
    // "TODOS" inclui os pagos, então não servia para essa pergunta.
    if (statusFilter === "NAO_PAGO") {
      if (p.effective === "PAGO") return false;
    } else if (statusFilter && statusFilter !== "TODOS" && p.effective !== statusFilter) {
      return false;
    }
    if (fornecedor && p.supplierId !== fornecedor) return false;
    if (veiculo && p.vehicleId !== veiculo) return false;
    // Linha "A pagar de veículos vendidos" do painel: títulos em aberto de carro
    // já VENDIDO — quitação da compra (COMPRA_VEICULO) ou custo pré-venda
    // vinculado. Espelha o cálculo do lucro patrimonial.
    if (vendidos) {
      if (p.effective === "PAGO") return false;
      if (p.vehicle?.status !== "VENDIDO") return false;
      const custoPreVenda = p.vehicleCost ? !p.vehicleCost.postSale : false;
      if (p.category !== "COMPRA_VEICULO" && !custoPreVenda) return false;
    }
    if (beneficiario) {
      const [kind, bid] = [beneficiario.slice(0, 2), beneficiario.slice(2)];
      if (kind === "u:" && p.beneficiaryUserId !== bid) return false;
      if (kind === "c:" && p.capitalBeneficiaryId !== bid) return false;
    }
    return true;
  });

  // Comissões de vendedores vinculados a um beneficiário do capital: permitem
  // pagar um valor maior (o excedente vira retirada de capital). Mapeia o
  // vendedor → { nome do beneficiário, capital livre } para a tela.
  const commissionSellerIds = Array.from(
    new Set(payables.filter((p) => p.category === "COMISSAO" && p.beneficiaryUserId).map((p) => p.beneficiaryUserId as string)),
  );
  const linkedBeneficiaries = commissionSellerIds.length
    ? await prisma.capitalBeneficiary.findMany({
        where: { userId: { in: commissionSellerIds } },
        select: { id: true, name: true, userId: true },
      })
    : [];
  const capStatus = linkedBeneficiaries.length ? await capitalStatusByBeneficiary() : new Map();
  const excessByUser = new Map<string, { beneficiaryName: string; free: number; capital: number }>();
  for (const b of linkedBeneficiaries) {
    if (b.userId)
      excessByUser.set(b.userId, {
        beneficiaryName: b.name,
        free: capStatus.get(b.id)?.free ?? 0,
        capital: capStatus.get(b.id)?.capital ?? 0,
      });
  }

  const totalPendente = withStatus.filter((p) => p.effective !== "PAGO").reduce((s, p) => s + p.amount, 0);
  const totalAtrasado = withStatus.filter((p) => p.effective === "ATRASADO").reduce((s, p) => s + p.amount, 0);

  const mappedRows: PayableRow[] = filtered.map((p) => ({
    id: p.id,
    orderNumber: p.orderNumber,
    description: p.description,
    categoryLabel: p.categoryLabel || categoryLabel[p.category],
    documentNumber: p.documentNumber ?? null,
    supplierName: p.supplier?.name ?? null,
    beneficiaryName: p.beneficiaryUser?.name ?? p.capitalBeneficiary?.name ?? null,
    vehicleLabel: p.vehicle ? `${p.vehicle.brand} ${p.vehicle.model} · ${p.vehicle.plate}` : null,
    dueDate: p.dueDate.toISOString(),
    amount: p.amount,
    effective: p.effective,
    status: p.status,
    accountName: p.account?.name ?? null,
    paymentDateInput: p.paymentDate ? toDateInputValue(p.paymentDate) : null,
    recurring: Boolean(p.recurringId),
    // Combo de pagamento: sinaliza que alguém montou/solicitou o pagamento.
    combo: p.paymentCombo
      ? {
          id: p.paymentCombo.id,
          name: p.paymentCombo.name,
          status: p.paymentCombo.status,
          userName: p.paymentCombo.user?.name ?? null,
        }
      : null,
    // Editável: qualquer título ainda não pago (pagos: reverter antes).
    editable: p.effective !== "PAGO",
    // Fatura de cartão: linha ganha o link do relatório de lançamentos (busca/PDF).
    cardInvoice: p.cardInvoice,
    // Tem anexo no próprio título ou na solicitação de compra que o gerou.
    hasAttachment: p._count.attachments > 0 || (p.purchaseRequest?._count.attachments ?? 0) > 0,
    commissionExcess:
      p.category === "COMISSAO" && p.beneficiaryUserId && excessByUser.has(p.beneficiaryUserId)
        ? excessByUser.get(p.beneficiaryUserId)!
        : null,
    // Comissão de um vendedor que NÃO está vinculado a um beneficiário do capital:
    // a opção "aplicar no capital" não aparece — mostramos uma dica de como habilitar.
    commissionSellerUnlinked:
      p.category === "COMISSAO" && !!p.beneficiaryUserId && !excessByUser.has(p.beneficiaryUserId),
    // Retirada de capital pura (sócio, sem veículo): pode ser paga com
    // substituição quando o capital do sócio está aplicado.
    capitalBeneficiaryId: p.capitalBeneficiaryId ?? null,
    isCapitalRetirada: !!p.capitalBeneficiaryId && !p.vehicle,
  }));

  // Dados para "Pagar com substituição": para cada sócio que tem retirada de
  // capital PENDENTE (sem veículo), as aplicações onde ele tem fatia e a lista de
  // possíveis substitutos (capital livre). Só calcula se houver esses títulos.
  const subBenefIds = Array.from(
    new Set(
      mappedRows
        .filter((r) => r.isCapitalRetirada && r.effective !== "PAGO" && r.capitalBeneficiaryId)
        .map((r) => r.capitalBeneficiaryId as string),
    ),
  );
  const substitutionData: Record<
    string,
    {
      appliedAccounts: { accountId: string; accountName: string; applied: number }[];
      substitutes: { id: string; name: string; free: number }[];
    }
  > = {};
  if (subBenefIds.length) {
    const otherBenefs = await prisma.capitalBeneficiary.findMany({
      where: { active: true },
      orderBy: [{ isCompany: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    });
    for (const bId of subBenefIds) {
      const appliedRows = await prisma.investmentAllocation.groupBy({
        by: ["accountId"],
        where: { beneficiaryId: bId },
        _sum: { amount: true },
      });
      const positives = appliedRows.filter((r) => (r._sum.amount ?? 0) > 0.005);
      if (positives.length === 0) continue; // sem capital aplicado → sem substituição
      const acctNames = await prisma.financialAccount.findMany({
        where: { id: { in: positives.map((r) => r.accountId) } },
        select: { id: true, name: true },
      });
      const nameById = new Map(acctNames.map((a) => [a.id, a.name]));
      const appliedAccounts = positives.map((r) => ({
        accountId: r.accountId,
        accountName: nameById.get(r.accountId) ?? "—",
        applied: Math.round((r._sum.amount ?? 0) * 100) / 100,
      }));
      const substitutes = await Promise.all(
        otherBenefs
          .filter((s) => s.id !== bId)
          .map(async (s) => ({ id: s.id, name: s.name, free: await freeCapitalOf(s.id) })),
      );
      substitutionData[bId] = { appliedAccounts, substitutes };
    }
  }

  // Busca livre pelos campos exibidos (nº, descrição, categoria, fornecedor,
  // veículo, vencimento, valor, status, conta).
  const statusText = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;
  const tableRows = mappedRows.filter(
    (r) =>
      matchesSearch(
        q,
        String(r.orderNumber).padStart(4, "0"),
        r.description,
        r.documentNumber,
        r.categoryLabel,
        r.supplierName,
        r.beneficiaryName,
        r.vehicleLabel,
        formatDate(r.dueDate),
        r.amount,
        formatCurrency(r.amount),
        statusText[r.effective],
        r.accountName,
      ) &&
      inDateRange(r.dueDate, de, ate) &&
      inValueRange(r.amount, min, max),
  );

  // Contas em aberto (atrasadas e pendentes) primeiro; pagas por último. Ordenação
  // estável: dentro de cada grupo mantém o vencimento crescente (ordem do findMany).
  tableRows.sort((a, b) => (a.effective === "PAGO" ? 1 : 0) - (b.effective === "PAGO" ? 1 : 0));

  // Página de 100 linhas: a busca e os filtros continuam valendo sobre TODOS os
  // títulos — só o que vai para a tela é fatiado. Sem isso, milhares de linhas
  // eram enviadas ao navegador de uma vez (o que travava no celular).
  const PER_PAGE = 100;
  const totalRows = tableRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / PER_PAGE));
  const currentPage = Math.min(Math.max(1, Number(pParam) || 1), pageCount);
  const pageStart = (currentPage - 1) * PER_PAGE;
  const pageRows = tableRows.slice(pageStart, pageStart + PER_PAGE);
  // Link de outra página preservando busca e filtros.
  const pageHref = (n: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: statusFilter, q, de, ate, min, max, fornecedor, beneficiario, veiculo, vendidos })) {
      if (v) sp.set(k, String(v));
    }
    if (n > 1) sp.set("p", String(n));
    const qs = sp.toString();
    return qs ? `/financeiro/a-pagar?${qs}` : "/financeiro/a-pagar";
  };

  return (
    <div>
      <PageHeader
        title="Contas a pagar"
        description={`Pendente: ${formatCurrency(totalPendente)}${totalAtrasado > 0 ? ` · Atrasado: ${formatCurrency(totalAtrasado)}` : ""}`}
        action={
          <Can module="financeiro" action="criar">
            <div className="flex flex-wrap gap-2">
              <ImportReceiptsButton />
              <ImportDuplicatasButton />
              <LinkButton href="/financeiro/a-pagar/contrato-locacao" variant="secondary">
                🏠 Contrato de locação
              </LinkButton>
              <LinkButton href="/financeiro/a-pagar/novo">+ Nova conta</LinkButton>
            </div>
          </Can>
        }
      />

      <ReportToolbar
        basePath="/financeiro/a-pagar"
        printTitle="Contas a pagar"
        q={q}
        placeholder="Buscar (descrição, fornecedor, beneficiário, veículo, valor...)"
        date
        value
        de={de}
        ate={ate}
        min={min}
        max={max}
        filtersKey={`${statusFilter ?? ""}|${fornecedor ?? ""}|${beneficiario ?? ""}|${veiculo ?? ""}|${vendidos ?? ""}`}
        extra={
          <>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Status
              <Select name="status" defaultValue={statusFilter || "TODOS"} className="mt-0.5 h-11 w-44">
                <option value="TODOS">Todos os status</option>
                <option value="NAO_PAGO">Não pago (pendente + atrasado)</option>
                <option value="PENDENTE">Pendente</option>
                <option value="ATRASADO">Atrasado</option>
                <option value="PAGO">Pago</option>
              </Select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Fornecedor
              <Select name="fornecedor" defaultValue={fornecedor || ""} className="mt-0.5 h-11 w-52">
                <option value="">Todos os fornecedores</option>
                {supplierOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Beneficiário
              <Select name="beneficiario" defaultValue={beneficiario || ""} className="mt-0.5 h-11 w-52">
                <option value="">Todos os beneficiários</option>
                {beneficiaryOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Veículo
              <Select name="veiculo" defaultValue={veiculo || ""} className="mt-0.5 h-11 w-52">
                <option value="">Todos os veículos</option>
                {vehicleOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </label>
          </>
        }
      />

      {vendidos ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm text-rose-800">
            🚗 Mostrando os títulos em aberto de <strong>veículos já vendidos</strong> — a linha
            vermelha &quot;A pagar de veículos vendidos&quot; do painel. Total:{" "}
            <strong className="tabular-nums">
              {formatCurrency(filtered.reduce((s, p) => s + p.amount, 0))}
            </strong>
            . Marque e pague em lote abaixo.
          </p>
          <LinkButton href="/financeiro/a-pagar" variant="secondary">
            Limpar filtro
          </LinkButton>
        </div>
      ) : null}

      {statusFilter !== "PAGO" ? (
        <SolicitedCombosCard
          combos={solicitedCombos}
          accounts={accounts}
          canPay={canPayCombo}
          cashboxDate={cashboxDate}
        />
      ) : null}

      <Card>
        {tableRows.length === 0 ? (
          <EmptyState title={q ? "Nada encontrado para a busca" : "Nenhuma conta a pagar encontrada"} />
        ) : (
          <>
            {canPagar ? (
              <p className="border-b border-slate-100 px-5 py-2.5 text-xs text-slate-500">
                Marque um ou vários títulos, escolha a conta e pague de uma vez (em lote).
              </p>
            ) : null}
            <PayablesTable rows={pageRows} accounts={accounts} canPagar={canPagar} canFixDate={canFixDate} canManage={canManage} canEdit={canEdit} canCombo={canCombo} cashboxDate={cashboxDate} openCombos={openCombos} substitutionData={substitutionData} />
            {pageCount > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 print:hidden">
                <p className="text-xs text-slate-500">
                  Mostrando {pageStart + 1}-{pageStart + pageRows.length} de {totalRows} título(s)
                  {" · "}página {currentPage} de {pageCount}
                </p>
                <div className="flex gap-2">
                  {currentPage > 1 ? (
                    <LinkButton href={pageHref(currentPage - 1)} variant="secondary">
                      ← Anterior
                    </LinkButton>
                  ) : null}
                  {currentPage < pageCount ? (
                    <LinkButton href={pageHref(currentPage + 1)} variant="secondary">
                      Próxima →
                    </LinkButton>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
