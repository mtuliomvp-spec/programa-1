import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances } from "@/lib/accounts";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { matchesSearch, inDateRange, inValueRange } from "@/lib/search";
import { retornoLabel } from "@/lib/retorno";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import ReportToolbar from "@/components/ReportToolbar";
import { userCan, requireModule } from "@/lib/guards";
import FinancingSettleButton from "./FinancingSettleButton";
import InsuranceSettleButton from "./InsuranceSettleButton";
import ReverseSettleButton from "./ReverseSettleButton";
import TrocarFinanceira from "./TrocarFinanceira";
import QueuedSettleChip from "./QueuedSettleChip";
import { getCashboxState } from "@/lib/cashbox";

export const dynamic = "force-dynamic";

export default async function FinanciamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; de?: string; ate?: string; min?: string; max?: string }>;
}) {
  await requireModule("financeiro");
  const { q: qParam, de, ate, min, max } = await searchParams;
  const q = (qParam || "").trim();
  const canReceber = await userCan("financeiro", "receber");
  // Corrigir a financeira é conserto de registro, não recebimento: pede a mesma
  // permissão de cancelar/refazer uma venda.
  const canTrocar = await userCan("vendas", "cancelar");
  const [allSales, accounts, cashbox] = await Promise.all([
    prisma.sale.findMany({
      where: { status: "CONCLUIDA", paymentMethod: "FINANCIADO" },
      orderBy: { saleDate: "desc" },
      include: {
        customer: { select: { name: true } },
        vehicle: { select: { brand: true, model: true, plate: true } },
        financerAccount: { select: { name: true, sellerReturnPercent: true } },
      },
    }),
    getAccountsWithBalances(),
    getCashboxState(),
  ]);
  // Dia do movimento (aberto ou, fechado, o último): o crédito informado com
  // data DEPOIS dele vai para a fila do caixa daquele dia.
  const workDate = cashbox.session ? toDateInputValue(cashbox.session.workDate) : null;
  const nomeConta = new Map(accounts.map((a) => [a.id, a.name]));

  // Busca livre + intervalo de data + faixa de valor financiado.
  const sales = allSales.filter(
    (s) =>
      matchesSearch(
        q,
        formatDate(s.saleDate),
        s.customer.name,
        `${s.vehicle.brand} ${s.vehicle.model} ${s.vehicle.plate}`,
        s.financerAccount?.name,
        s.financerName,
        s.financedAmount,
        s.financedAmount ? formatCurrency(s.financedAmount) : null,
        s.financerSettledAt ? "Recebido" : "Receber",
        s.returnLevel > 0 ? retornoLabel(s.returnLevel) : null,
        s.returnNet > 0 ? formatCurrency(s.returnNet) : null,
      ) &&
      inDateRange(s.saleDate, de, ate) &&
      inValueRange(s.financedAmount ?? 0, min, max),
  );

  const financers = accounts.filter((a) => a.type === "FINANCEIRA" && a.active);
  const totalAReceber = financers.reduce((s, a) => s + a.balance, 0);
  const totalFinanciado = sales.reduce((s, v) => s + (v.financedAmount ?? 0), 0);
  // Seguros marcados na venda cuja comissão ainda não caiu — é a fila que o
  // dono não tinha como acompanhar ("não sabemos quando pagam").
  const segurosPendentes = allSales.filter((v) => v.insuranceSold && !v.insuranceSettledAt).length;
  // Contas da empresa (não-financeira) que podem receber o repasse.
  const companyAccounts = accounts
    .filter((a) => a.active && a.type !== "FINANCEIRA")
    .map((a) => ({ id: a.id, name: a.name }));

  return (
    <div>
      <PageHeader
        title="Financiamentos"
        description="Vendas financiadas: quem financiou, o veículo e o valor a receber da financeira"
        action={<LinkButton href="/financeiro/contas" variant="secondary">Contas das financeiras</LinkButton>}
      />

      <ReportToolbar
        basePath="/financeiro/financiamentos"
        printTitle="Financiamentos"
        q={q}
        placeholder="Buscar (cliente, veículo, financeira, valor...)"
        date
        value
        de={de}
        ate={ate}
        min={min}
        max={max}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Saldo nas financeiras"
          value={formatCurrency(totalAReceber)}
          hint="valor financiado ainda na conta das financeiras"
          tone={totalAReceber > 0 ? "warning" : "default"}
        />
        <StatCard label="Total financiado (histórico)" value={formatCurrency(totalFinanciado)} />
        <StatCard
          label="Seguros a receber"
          value={String(segurosPendentes)}
          hint="vendas com seguro marcado e comissão ainda não recebida"
          tone={segurosPendentes > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm text-blue-800">
        O valor financiado fica na conta da financeira. Quando a financeira pagar, clique em{" "}
        <strong>Receber (dar baixa)</strong> na linha do financiamento e escolha a conta da empresa —
        o valor sai da financeira e entra no caixa automaticamente. Caiu num dia{" "}
        <strong>à frente do movimento</strong>? Informe a data do crédito: ele fica na fila e entra no
        caixa daquele dia com um ok, em Contas e caixas.
      </div>

      <Card>
        <CardHeader title="Vendas financiadas" />
        {sales.length === 0 ? (
          <EmptyState
            title={q ? "Nada encontrado para a busca" : "Nenhuma venda financiada"}
            description={q ? "Tente outros termos ou limpe a busca." : "As vendas com forma de pagamento 'Financiado' aparecem aqui."}
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Financiado (cliente)</Th>
                <Th>Veículo</Th>
                <Th>Financeira</Th>
                <Th className="text-right">Valor financiado</Th>
                <Th className="text-right">Situação</Th>
                <Th className="text-right">Retorno</Th>
                <Th className="text-right">Seguro</Th>
              </Tr>
            </Thead>
            <tbody>
              {sales.map((s) => (
                <Tr key={s.id}>
                  <Td className="whitespace-nowrap">{formatDate(s.saleDate)}</Td>
                  <Td className="font-medium text-slate-900">{s.customer.name}</Td>
                  <Td>
                    {s.vehicle.brand} {s.vehicle.model} · {s.vehicle.plate}
                  </Td>
                  <Td>
                    {s.financerAccount?.name ? (
                      <Badge tone="info">{s.financerAccount.name}</Badge>
                    ) : (
                      <span className="text-slate-400">{s.financerName || "—"}</span>
                    )}
                    {s.financerAccountId && canTrocar ? (
                      <TrocarFinanceira
                        saleId={s.id}
                        atualId={s.financerAccountId}
                        financeiras={financers.map((f) => ({ id: f.id, name: f.name }))}
                      />
                    ) : null}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">
                    {formatCurrency(s.financedAmount ?? 0)}
                  </Td>
                  <Td className="text-right">
                    {s.financerSettledAt ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <Badge tone="success">Recebido {formatDate(s.financerSettledAt)}</Badge>
                        {canReceber ? <ReverseSettleButton saleId={s.id} mode="financing" /> : null}
                      </div>
                    ) : s.pendingFinancingDate ? (
                      <QueuedSettleChip
                        saleId={s.id}
                        tipo="financiamento"
                        data={s.pendingFinancingDate.toISOString()}
                        valor={s.financedAmount ?? 0}
                        conta={s.pendingFinancingAccountId ? (nomeConta.get(s.pendingFinancingAccountId) ?? null) : null}
                        podeTirar={canReceber}
                      />
                    ) : s.financerAccountId && canReceber ? (
                      <FinancingSettleButton saleId={s.id} accounts={companyAccounts} workDate={workDate} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {s.returnLevel > 0 && s.returnNet > 0 ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-slate-500">
                          {retornoLabel(s.returnLevel)} · {formatCurrency(s.returnNet)}
                        </span>
                        {s.returnSettledAt ? (
                          <>
                            <Badge tone="success">Recebido {formatDate(s.returnSettledAt)}</Badge>
                            {s.returnPaidAmount != null && Math.abs(s.returnPaidAmount - s.returnNet) > 0.005 ? (
                              <span className="text-[11px] text-slate-400">
                                pago {formatCurrency(s.returnPaidAmount)} ·{" "}
                                <span className={s.returnPaidAmount > s.returnNet ? "text-emerald-600" : "text-rose-500"}>
                                  {s.returnPaidAmount > s.returnNet ? "+" : "−"}
                                  {formatCurrency(Math.abs(s.returnPaidAmount - s.returnNet))}
                                </span>
                              </span>
                            ) : null}
                            {canReceber ? <ReverseSettleButton saleId={s.id} mode="return" /> : null}
                          </>
                        ) : s.pendingReturnDate ? (
                          <QueuedSettleChip
                            saleId={s.id}
                            tipo="retorno"
                            data={s.pendingReturnDate.toISOString()}
                            valor={s.pendingReturnAmount ?? s.returnNet}
                            conta={s.pendingReturnAccountId ? (nomeConta.get(s.pendingReturnAccountId) ?? null) : null}
                            podeTirar={canReceber}
                          />
                        ) : s.financerAccountId && canReceber ? (
                          <FinancingSettleButton
                            saleId={s.id}
                            accounts={companyAccounts}
                            workDate={workDate}
                            mode="return"
                            label="Receber retorno"
                            programmedAmount={s.returnNet}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {s.insuranceSold ? (
                      <div className="flex flex-col items-end gap-0.5">
                        {s.insuranceSettledAt ? (
                          <>
                            <span className="text-xs text-slate-500">
                              {formatCurrency(s.insuranceAmount ?? 0)}
                              {s.insuranceCommissionAmount > 0
                                ? ` · comissão ${formatCurrency(s.insuranceCommissionAmount)}`
                                : ""}
                            </span>
                            <Badge tone="success">Recebido {formatDate(s.insuranceSettledAt)}</Badge>
                            {canReceber ? <ReverseSettleButton saleId={s.id} mode="insurance" /> : null}
                          </>
                        ) : (
                          <>
                            <Badge tone="warning">A receber</Badge>
                            {canReceber ? (
                              <InsuranceSettleButton
                                saleId={s.id}
                                accounts={companyAccounts}
                                sellerPercent={s.financerAccount?.sellerReturnPercent ?? 0}
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
