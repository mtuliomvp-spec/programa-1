import { prisma } from "@/lib/prisma";
import { ensureRecurringGenerated, ensureConsortiumInstallments } from "@/lib/recurring";
import { getActiveAccounts } from "@/lib/accounts";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { capitalStatusByBeneficiary } from "@/lib/investments";
import { getCashboxState } from "@/lib/cashbox";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { Card, EmptyState, LinkButton, PageHeader, Select } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import Can from "@/components/Can";
import { userCan } from "@/lib/guards";
import PayablesTable, { type PayableRow } from "./PayablesTable";

export const dynamic = "force-dynamic";

const categoryLabel = {
  COMPRA_VEICULO: "Compra de veículo",
  COMPRA_PECA: "Compra de peças",
  DESPESA_OPERACIONAL: "Despesa operacional",
  COMISSAO: "Comissão",
  SALARIO: "Salário",
  COMBUSTIVEL: "Combustível",
  DEVOLUCAO_CLIENTE: "Devolução ao cliente",
  OUTROS: "Outros",
} as const;

export default async function ContasAPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; de?: string; ate?: string; min?: string; max?: string; fornecedor?: string; beneficiario?: string; veiculo?: string }>;
}) {
  const { status: statusFilter, q: qParam, de, ate, min, max, fornecedor, beneficiario, veiculo } = await searchParams;
  const q = (qParam || "").trim();
  const [canPagar, canManage, canCombo] = await Promise.all([
    userCan("financeiro", "pagar"),
    userCan("financeiro", "criar"),
    userCan("combos", "criar"),
  ]);
  await ensureRecurringGenerated();
  await ensureConsortiumInstallments();

  const [payables, accounts, cashbox] = await Promise.all([
    prisma.payable.findMany({
      orderBy: { dueDate: "asc" },
      include: {
        supplier: true,
        vehicle: true,
        part: true,
        account: { select: { name: true } },
        beneficiaryUser: { select: { id: true, name: true } },
        capitalBeneficiary: { select: { id: true, name: true } },
        _count: { select: { attachments: true } },
        purchaseRequest: { select: { _count: { select: { attachments: true } } } },
      },
    }),
    getActiveAccounts(),
    getCashboxState(),
  ]);
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
    if (statusFilter && statusFilter !== "TODOS" && p.effective !== statusFilter) return false;
    if (fornecedor && p.supplierId !== fornecedor) return false;
    if (veiculo && p.vehicleId !== veiculo) return false;
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
    recurring: Boolean(p.recurringId),
    // Editável: qualquer título ainda não pago (pagos: reverter antes).
    editable: p.effective !== "PAGO",
    // Tem anexo no próprio título ou na solicitação de compra que o gerou.
    hasAttachment: p._count.attachments > 0 || (p.purchaseRequest?._count.attachments ?? 0) > 0,
    commissionExcess:
      p.category === "COMISSAO" && p.beneficiaryUserId && excessByUser.has(p.beneficiaryUserId)
        ? excessByUser.get(p.beneficiaryUserId)!
        : null,
  }));

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

  return (
    <div>
      <PageHeader
        title="Contas a pagar"
        description={`Pendente: ${formatCurrency(totalPendente)}${totalAtrasado > 0 ? ` · Atrasado: ${formatCurrency(totalAtrasado)}` : ""}`}
        action={
          <Can module="financeiro" action="criar">
            <div className="flex flex-wrap gap-2">
              <LinkButton href="/financeiro/a-pagar/contrato-locacao" variant="secondary">
                🏠 Contrato de locação
              </LinkButton>
              <LinkButton href="/financeiro/a-pagar/importar-pmz" variant="secondary">
                ⇪ Importar PMZ
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
        extra={
          <>
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Status
              <Select name="status" defaultValue={statusFilter || "TODOS"} className="mt-0.5 h-11 w-44">
                <option value="TODOS">Todos os status</option>
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
            <PayablesTable rows={tableRows} accounts={accounts} canPagar={canPagar} canManage={canManage} canCombo={canCombo} cashboxDate={cashboxDate} openCombos={openCombos} />
          </>
        )}
      </Card>
    </div>
  );
}
