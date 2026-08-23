import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { competenciaLabel, getSubscription, statusLabel, statusTone } from "@/lib/subscription";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { DeleteRowButton, EditContractForm, RegisterPaymentForm, UploadSignedContractForm } from "./SubscriptionForms";

export const dynamic = "force-dynamic";

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export default async function AssinaturaPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "SUPER_ADMIN") redirect("/");

  const sub = await getSubscription();
  const [pagamentos, contratos] = await Promise.all([
    prisma.subscriptionPayment.findMany({
      where: { subscriptionId: sub.id },
      orderBy: [{ competencia: "desc" }, { paidAt: "desc" }],
      select: {
        id: true, competencia: true, paidAt: true, amount: true, method: true, notes: true,
        proofFilename: true, proofSize: true,
      },
    }),
    prisma.subscriptionContract.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, filename: true, size: true, signedAt: true, notes: true, createdAt: true },
    }),
  ]);

  // Competência sugerida no lançamento: o mês seguinte ao último pago, ou o
  // mês corrente quando ainda não há histórico.
  const hoje = new Date();
  const ultima = pagamentos[0]?.competencia;
  let sugestao = `${hoje.getUTCFullYear()}-${String(hoje.getUTCMonth() + 1).padStart(2, "0")}`;
  if (ultima) {
    const [a, m] = ultima.split("-").map(Number);
    const prox = new Date(Date.UTC(a, m, 1));
    sugestao = `${prox.getUTCFullYear()}-${String(prox.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const totalPago = pagamentos.reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <PageHeader
        title="Assinatura"
        description="Status do contrato com o fornecedor do sistema e histórico de pagamentos."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
          <p className="mt-2">
            <Badge tone={statusTone(sub.status)}>{statusLabel(sub.status)}</Badge>
          </p>
        </Card>
        <StatCard label="Plano" value={sub.planName} />
        <StatCard label="Mensalidade" value={formatCurrency(sub.monthlyAmount)} />
        <StatCard label="Dia de vencimento" value={String(sub.dueDay)} hint="dia do mês" />
        <StatCard
          label="Próxima cobrança"
          value={sub.nextChargeAt ? formatDate(sub.nextChargeAt) : "—"}
        />
        <StatCard label="Contrato desde" value={sub.startedAt ? formatDate(sub.startedAt) : "—"} />
      </div>

      {sub.notes ? (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Observação do contrato:</strong> {sub.notes}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start gap-3">
        <EditContractForm
          contrato={{
            status: sub.status,
            planName: sub.planName,
            monthlyAmount: sub.monthlyAmount,
            dueDay: sub.dueDay,
            nextChargeAt: iso(sub.nextChargeAt),
            startedAt: iso(sub.startedAt),
            notes: sub.notes || "",
            providerName: sub.providerName || "",
            providerDocument: sub.providerDocument || "",
            providerAddress: sub.providerAddress || "",
            providerEmail: sub.providerEmail || "",
            providerPhone: sub.providerPhone || "",
          }}
        />
        <RegisterPaymentForm sugestao={{ competencia: sugestao, amount: sub.monthlyAmount }} />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Histórico de pagamentos"
          action={
            pagamentos.length > 0 ? (
              <span className="text-sm text-slate-500">
                {pagamentos.length} pagamento(s) · {formatCurrency(totalPago)} no total
              </span>
            ) : null
          }
        />
        {pagamentos.length === 0 ? (
          <EmptyState
            title="Nenhum pagamento registrado ainda"
            description="Lance cada mensalidade paga com o comprovante — é a memória do contrato."
          />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Competência</Th>
                <Th>Pago em</Th>
                <Th>Valor</Th>
                <Th>Forma</Th>
                <Th>Comprovante</Th>
                <Th>Observação</Th>
                <Th />
              </Tr>
            </Thead>
            <tbody>
              {pagamentos.map((p) => (
                <Tr key={p.id}>
                  <Td>{competenciaLabel(p.competencia)}</Td>
                  <Td>{formatDate(p.paidAt)}</Td>
                  <Td>{formatCurrency(p.amount)}</Td>
                  <Td>{p.method || "—"}</Td>
                  <Td>
                    {p.proofFilename ? (
                      <a
                        href={`/sistema/assinatura/arquivo/${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-blue-700 hover:underline"
                      >
                        Abrir
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">{p.notes || "—"}</Td>
                  <Td className="text-right print:hidden">
                    <DeleteRowButton id={p.id} kind="pagamento" />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Contrato de prestação de serviço"
          action={
            <Link
              href="/sistema/assinatura/contrato"
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              Abrir contrato →
            </Link>
          }
        />
        <div className="space-y-4 p-5">
          <p className="text-sm text-slate-600">
            O sistema gera o contrato de licenciamento em modelo SaaS já preenchido com os dados da
            contratada e da sua empresa, pronto para <strong>baixar em PDF</strong> ou{" "}
            <strong>imprimir</strong>. Depois de assinado, anexe a via aqui — contrato, pagamentos e
            comprovantes ficam no mesmo lugar.
          </p>

          <div className="rounded-xl border border-dashed border-slate-300 p-4">
            <p className="text-sm font-semibold text-slate-800">📎 Contrato assinado</p>
            <p className="mb-3 text-xs text-slate-500">
              Anexe a via assinada (PDF ou imagem, até 10 MB) após coletar as assinaturas das partes.
            </p>
            <UploadSignedContractForm />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contratos anexados</p>
            {contratos.length === 0 ? (
              <p className="mt-2 rounded-lg border border-slate-200 px-4 py-3 text-sm italic text-slate-500">
                Nenhum contrato assinado anexado.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {contratos.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{c.filename}</p>
                      <p className="text-xs text-slate-500">
                        {c.signedAt ? `Assinado em ${formatDate(c.signedAt)} · ` : ""}
                        anexado em {formatDate(c.createdAt)} · {Math.max(1, Math.round(c.size / 1024))} KB
                        {c.notes ? ` · ${c.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <a
                        href={`/sistema/assinatura/arquivo/${c.id}?tipo=contrato`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Abrir
                      </a>
                      <a
                        href={`/sistema/assinatura/arquivo/${c.id}?tipo=contrato&download=1`}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Baixar
                      </a>
                      <DeleteRowButton id={c.id} kind="contrato" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Boas práticas: registre cada mensalidade no mês da competência, sempre com o comprovante; mantenha o
        status fiel à realidade (&quot;Atrasado&quot; e &quot;Bloqueado&quot; existem para avisar o time); e
        anexe o contrato assinado. O volume de dados da sua instância fica em{" "}
        <Link href="/sistema/uso" className="font-medium text-blue-700 hover:underline">
          Uso da plataforma
        </Link>
        .
      </p>
    </div>
  );
}
