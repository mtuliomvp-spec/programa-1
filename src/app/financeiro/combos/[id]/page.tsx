import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAction, userCan } from "@/lib/guards";
import { getActiveAccounts } from "@/lib/accounts";
import { getCashboxState } from "@/lib/cashbox";
import { getCompany } from "@/lib/company";
import { freeCapitalOf } from "@/lib/investments";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, LinkButton, Table, Td, Th, Thead, Tr } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";
import CopyBarcode from "@/components/CopyBarcode";
import PrintButton from "@/components/PrintButton";
import ComboActions from "./ComboActions";
import AddTitlesToCombo, { RemoveFromCombo } from "./AddTitlesToCombo";
import PayFullToggle from "./PayFullToggle";
import PayoutMethodPicker from "./PayoutMethodPicker";
import ComboReceipt from "./ComboReceipt";
import ReadReceiptAi from "../../a-pagar/ReadReceiptAi";

export const dynamic = "force-dynamic";

const statusInfo = {
  ABERTO: { label: "Aberto", tone: "info" as const },
  SOLICITADO: { label: "Aguardando pagamento", tone: "warning" as const },
  PAGO: { label: "Pago", tone: "success" as const },
  CANCELADO: { label: "Cancelado", tone: "danger" as const },
};
const accountTypeLabel: Record<string, string> = { corrente: "Corrente", poupanca: "Poupança" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{value}</span>
    </div>
  );
}

export default async function ComboBorderoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAction("combos", "visualizar");
  const { id } = await params;

  const combo = await prisma.paymentCombo.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, document: true, phone: true, email: true, bankName: true, bankAgency: true, bankAccount: true, bankAccountType: true, pixKey: true, pixKeyType: true } },
      account: { select: { name: true } },
      pendingPaymentAccount: { select: { name: true } },
      payables: {
        orderBy: { dueDate: "asc" },
        include: {
          supplier: { select: { name: true } },
          beneficiaryUser: { select: { name: true } },
          // Só os METADADOS: os bytes iriam inteiros para o navegador. O
          // arquivo é servido por /financeiro/a-pagar/anexos/[id].
          attachments: {
            orderBy: { createdAt: "asc" },
            select: { id: true, kind: true, description: true, filename: true },
          },
        },
      },
      // Só os METADADOS: os BYTES do comprovante iriam inteiros para o
      // navegador. O arquivo é servido por /financeiro/combos/anexos/[id].
      attachments: {
        orderBy: { createdAt: "desc" },
        select: { id: true, kind: true, description: true, filename: true, size: true, createdAt: true },
      },
    },
  });
  if (!combo) notFound();

  const [company, accounts, cashbox, canPagar, canManage] = await Promise.all([
    getCompany(),
    getActiveAccounts(),
    getCashboxState(),
    userCan("combos", "aprovar"),
    userCan("combos", "criar"),
  ]);
  const cashboxDate = cashbox.open && cashbox.session ? formatDate(cashbox.session.workDate) : null;

  // Enquanto o combo não foi pago, um título pode ter sido quitado por fora (na
  // tela de Contas a pagar). Esse título já pago não deve mais aparecer nem
  // somar no combo em aberto — o pagamento do combo já ignora os pagos. Num
  // combo PAGO, todos os títulos são o registro do que foi quitado (mantém).
  const comboPayables =
    combo.status === "PAGO" ? combo.payables : combo.payables.filter((p) => p.status !== "PAGO");
  const total = comboPayables.reduce((s, p) => s + p.amount, 0);
  const info = statusInfo[combo.status];
  const bene = combo.user;

  // Abatimento do saldo devedor de capital do beneficiário (mesmo mecanismo da
  // comissão): se pago, usa o valor gravado; senão calcula o débito livre ao vivo.
  // `debtTotal` = saldo devedor TOTAL (livre) do beneficiário — informativo, pode
  // ser maior que o abatido neste combo.
  const round2 = (n: number) => Math.round(n * 100) / 100;
  let abatimento = combo.status === "PAGO" ? combo.capitalAbatement : 0;
  let debtTotal = 0;
  if (combo.userId && combo.status !== "CANCELADO") {
    const beneficiary = await prisma.capitalBeneficiary.findUnique({
      where: { userId: combo.userId },
      select: { id: true },
    });
    if (beneficiary) {
      const free = await freeCapitalOf(beneficiary.id);
      debtTotal = Math.max(0, round2(-free));
      // "Valor integral" (payFull) não abate; senão abate até o total.
      if (combo.status !== "PAGO") abatimento = combo.payFull ? 0 : Math.min(total, debtTotal);
    }
  }
  const liquido = round2(total - abatimento);
  const restante = round2(Math.max(0, debtTotal - abatimento));
  // Mostra o toggle "valor integral" quando há débito e o combo ainda pode mudar.
  const showPayFullToggle =
    debtTotal > 0.005 && (combo.status === "ABERTO" || combo.status === "SOLICITADO") && (canManage || canPagar);
  const bankType = bene?.bankAccountType ? accountTypeLabel[bene.bankAccountType] || bene.bankAccountType : null;
  const hasBankData = Boolean(bene && (bene.bankName || bene.bankAccount || bene.pixKey));

  // Títulos disponíveis para adicionar (enquanto o combo não foi pago):
  // pendentes/atrasados, não pagos e ainda sem combo.
  const comboEditavel = combo.status === "ABERTO" || combo.status === "SOLICITADO";
  // Comprovante do borderô: quem monta ou quem paga pode anexar, enquanto o
  // combo não estiver cancelado (no pago, o arquivo fica como documento).
  // Borderô da FATURA (sem dono): quem recebe é o fornecedor dos títulos.
  const semDono = !combo.userId;
  const fornecedores = Array.from(
    new Set(comboPayables.map((p) => p.supplier?.name).filter(Boolean) as string[]),
  );
  const comprovante = combo.attachments.find((a) => a.kind === "COMPROVANTE") ?? null;
  // Os outros documentos do borderô: hoje, o boleto e o relatório de
  // detalhamento da fatura que o unificou.
  const documentos = combo.attachments.filter((a) => a.kind !== "COMPROVANTE");
  const podeComprovante = (canManage || canPagar) && combo.status !== "CANCELADO";
  const available =
    comboEditavel
      ? (
          await prisma.payable.findMany({
            where: { status: { not: "PAGO" }, paymentComboId: null },
            orderBy: { dueDate: "asc" },
            include: {
              supplier: { select: { name: true } },
              beneficiaryUser: { select: { name: true } },
              capitalBeneficiary: { select: { name: true } },
              vehicle: { select: { brand: true, model: true, plate: true } },
            },
            take: 500,
          })
        ).map((p) => ({
          id: p.id,
          description: p.description,
          supplierName: p.supplier?.name ?? "",
          beneficiaryName: p.beneficiaryUser?.name ?? p.capitalBeneficiary?.name ?? "",
          vehicleLabel: p.vehicle ? `${p.vehicle.brand} ${p.vehicle.model} · ${p.vehicle.plate}` : "",
          dueDate: p.dueDate.toISOString(),
          amount: p.amount,
        }))
      : [];

  return (
    <div className="mx-auto max-w-5xl">
      {/* O borderô é documento (impressão) — fica em largura de página; só a área
          de trabalho "Adicionar títulos" abaixo usa a largura maior da tela. */}
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
          <LinkButton href="/financeiro/combos" variant="secondary">← Voltar</LinkButton>
          <PrintButton title={`Bordero ${combo.name}`} rootSelector="#bordero" />
        </div>

      <Card className="p-6 sm:p-8">
        <main id="bordero">
          <CompanyDocHeader
            company={company}
            right={
              <>
                <p className="font-bold">BORDERÔ DE PAGAMENTO</p>
                <p className="text-slate-500">{combo.name}</p>
                <p className="text-slate-500">{formatDate(combo.createdAt)}</p>
                <Badge tone={info.tone}>{info.label}</Badge>
              </>
            }
          />

          {combo.status === "CANCELADO" ? (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
              <span className="text-2xl">⛔</span>
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-rose-700">Combo cancelado</p>
                <p className="text-sm text-rose-600">Este combo foi cancelado — os títulos voltaram soltos para o Contas a pagar.</p>
              </div>
            </div>
          ) : null}

          <section className="mb-4">
            <h2 className="mb-1 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Beneficiário</h2>
            {semDono ? (
              // Borderô SEM dono: nasceu de uma fatura, não do pedido de um
              // sócio. Quem recebe é o fornecedor dos títulos, pelo boleto —
              // não há dado bancário de usuário a cobrar nem forma a escolher.
              <>
                <Row label="Nome" value={fornecedores.join(" · ") || "—"} />
                <p className="py-1.5 text-xs text-slate-500">
                  Borderô da fatura: paga-se o boleto do fornecedor, não há repasse a sócio.
                </p>
              </>
            ) : (
              <>
            <Row label="Nome" value={bene?.name || "—"} />
            <Row label="CPF/CNPJ" value={bene?.document || "—"} />
            <Row label="Telefone" value={bene?.phone || "—"} />
            {hasBankData ? (
              <>
                {combo.payoutMethod !== "pix" ? (
                  <>
                    <Row label="Banco" value={bene?.bankName || "—"} />
                    <Row label="Agência" value={bene?.bankAgency || "—"} />
                    <Row label="Conta" value={bene?.bankAccount || "—"} />
                    <Row label="Tipo" value={bankType || "—"} />
                  </>
                ) : null}
                {combo.payoutMethod !== "conta" ? (
                  <Row
                    label={
                      bene?.pixKeyType
                        ? `Chave PIX (${{ cpf: "CPF", cnpj: "CNPJ", telefone: "Telefone", email: "E-mail", aleatoria: "Aleatória" }[bene.pixKeyType] || bene.pixKeyType})`
                        : "Chave PIX"
                    }
                    value={bene?.pixKey || "—"}
                  />
                ) : null}
              </>
            ) : (
              <p className="py-1.5 text-sm text-amber-700">
                Dados bancários não cadastrados — informe na ficha do usuário (Usuários).
              </p>
            )}
            {combo.payoutMethod ? (
              <div className="mt-1 flex justify-between gap-4 border-t border-slate-100 py-1.5 text-sm">
                <span className="shrink-0 font-semibold text-slate-600">Forma de recebimento</span>
                <span className="text-right font-bold text-slate-900">
                  {combo.payoutMethod === "pix" ? "⚡ PIX" : "🏦 Transferência para a conta cadastrada"}
                </span>
              </div>
            ) : null}
            {(combo.status === "ABERTO" || combo.status === "SOLICITADO") && (canManage || canPagar) ? (
              <PayoutMethodPicker
                comboId={combo.id}
                method={combo.payoutMethod}
                hasPix={Boolean(bene?.pixKey)}
                hasConta={Boolean(bene?.bankName || bene?.bankAccount)}
              />
            ) : null}
              </>
            )}
          </section>

          <section className="mb-4">
            <h2 className="mb-1 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Títulos do combo</h2>
            {comboPayables.length === 0 ? (
              <p className="py-3 text-sm text-slate-500">Nenhum título neste combo ainda.</p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Descrição</Th>
                    <Th>Fornecedor</Th>
                    <Th>Vencimento</Th>
                    <Th className="text-right">Valor</Th>
                    {comboEditavel && canManage ? <Th /> : null}
                  </Tr>
                </Thead>
                <tbody>
                  {comboPayables.map((p) => (
                    <Tr key={p.id}>
                      {/*
                        Dentro do borderô o título sai da lista do Contas a
                        pagar — e era por lá que se abria a ordem dele e os
                        anexos (a comunicação de venda de um carro que não está
                        no estoque só existe aqui). Então a descrição leva à
                        Ordem de Pagamento e cada anexo abre direto.
                      */}
                      <Td className="font-medium text-slate-900">
                        <Link
                          href={`/financeiro/a-pagar/${p.id}/ordem`}
                          className="text-blue-700 hover:underline print:text-slate-900 print:no-underline"
                        >
                          {p.description}
                        </Link>
                        {p.attachments.length ? (
                          <span className="mt-0.5 block text-xs font-normal print:hidden">
                            {p.attachments.map((a) => (
                              <a
                                key={a.id}
                                href={`/financeiro/a-pagar/anexos/${a.id}`}
                                target="_blank"
                                rel="noreferrer"
                                title={a.filename}
                                className="mr-2 text-slate-500 hover:text-blue-700 hover:underline"
                              >
                                📎 {a.description || a.filename}
                              </a>
                            ))}
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-slate-600">{p.supplier?.name || p.beneficiaryUser?.name || "—"}</Td>
                      <Td className="whitespace-nowrap text-slate-600">{formatDate(p.dueDate)}</Td>
                      <Td className="text-right tabular-nums">{formatCurrency(p.amount)}</Td>
                      {comboEditavel && canManage ? (
                        <Td className="text-right">
                          <RemoveFromCombo payableId={p.id} comboId={combo.id} />
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>

          {showPayFullToggle ? (
            <PayFullToggle comboId={combo.id} payFull={combo.payFull} beneficiaryName={bene?.name} />
          ) : null}

          {abatimento > 0.005 || debtTotal > 0.005 ? (
            <div className="mb-2 rounded-lg bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between py-0.5 text-sm text-slate-600">
                <span>Total dos títulos</span>
                <span className="tabular-nums">{formatCurrency(total)}</span>
              </div>
              {debtTotal > 0.005 ? (
                <div className="flex items-center justify-between py-0.5 text-sm text-rose-700">
                  <span>
                    Saldo devedor de capital (livre){bene?.name ? ` de ${bene.name}` : ""}
                    {combo.status === "PAGO" ? " (em aberto)" : ""}
                  </span>
                  <span className="tabular-nums font-semibold">− {formatCurrency(debtTotal)}</span>
                </div>
              ) : null}
              {abatimento > 0.005 ? (
                <div className="flex items-center justify-between py-0.5 text-sm text-amber-700">
                  <span>{combo.status === "PAGO" ? "Abatido neste combo" : "A abater neste combo"}</span>
                  <span className="tabular-nums">− {formatCurrency(abatimento)}</span>
                </div>
              ) : null}
              <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {combo.status === "PAGO" ? "Líquido pago" : "Líquido a pagar"}
                </span>
                <span className="text-2xl font-black text-slate-900">{formatCurrency(liquido)}</span>
              </div>
              {combo.payFull && debtTotal > 0.005 ? (
                <p className="mt-1 text-xs text-blue-600">
                  Valor integral — o saldo devedor de capital do beneficiário <strong>não será abatido</strong> neste combo.
                </p>
              ) : restante > 0.005 && combo.status !== "PAGO" ? (
                <p className="mt-1 text-xs text-rose-500">
                  Este combo cobre {formatCurrency(abatimento)} do saldo devedor; restam {formatCurrency(restante)} para um próximo combo/comissão.
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">
                  Parte do total cobre o saldo devedor de capital do beneficiário (vira aporte); só a diferença sai em dinheiro.
                </p>
              )}
            </div>
          ) : (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Total a pagar</span>
              <span className="text-2xl font-black text-slate-900">{formatCurrency(total)}</span>
            </div>
          )}
          {combo.status === "PAGO" ? (
            <p className="text-sm text-slate-500">
              Pago em {combo.paidAt ? formatDate(combo.paidAt) : "—"}
              {combo.account?.name ? ` · ${combo.account.name}` : ""}.
            </p>
          ) : null}
        </main>

        {/*
          O que o borderô cobra e como pagá-lo: quando ele nasceu de uma fatura
          (comunicação de venda), a observação traz a linha digitável do boleto
          e os dois PDFs ficam aqui — é onde quem paga vai procurá-los.
        */}
        {combo.notes || combo.barcode || documentos.length ? (
          <section className="mt-4 border-t border-slate-200 pt-4">
            {combo.notes || combo.barcode ? (
              <>
                <p className="text-sm font-semibold text-slate-800">📄 Boleto do borderô</p>
                {combo.notes ? (
                  <p className="mt-0.5 text-xs text-slate-600">{combo.notes}</p>
                ) : null}
                {combo.barcode ? (
                  <div className="mt-2">
                    <CopyBarcode value={combo.barcode} />
                  </div>
                ) : null}
              </>
            ) : null}
            {documentos.length ? (
              <ul className="mt-2 flex flex-wrap gap-3 text-sm print:hidden">
                {documentos.map((d) => (
                  <li key={d.id}>
                    <a
                      href={`/financeiro/combos/anexos/${d.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {d.description || d.filename} →
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {/*
          Comprovante do BORDERÔ: o combo é pago de uma vez só, então o
          comprovante é um só para todos os títulos. Lido aqui, o combo entra na
          fila de espera do caixa como uma linha só — e aparece em Contas e
          caixas junto com os títulos avulsos já pagos.
        */}
        {podeComprovante ? (
          <section className="print:hidden mt-4 border-t border-slate-200 pt-4">
            {comprovante ? (
              <>
                <p className="text-sm font-semibold text-slate-800">🧾 Comprovante do combo</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {combo.pendingPaymentDate
                    ? `Pré-lançado: pago em ${formatDate(combo.pendingPaymentDate)}${
                        combo.pendingPaymentAccount?.name ? ` · debita em ${combo.pendingPaymentAccount.name}` : ""
                      }. O ok para debitar fica em Contas e caixas, quando o movimento chegar nesse dia.`
                    : "Anexado ao combo."}
                </p>
                {combo.pendingPaymentNote ? (
                  <p className="mt-1 text-xs font-medium text-amber-700">⚠ {combo.pendingPaymentNote}</p>
                ) : null}
                <ComboReceipt
                  comboId={combo.id}
                  anexo={{
                    id: comprovante.id,
                    filename: comprovante.filename,
                    size: comprovante.size,
                    createdAt: comprovante.createdAt.toISOString(),
                  }}
                  podeRemover={canManage || canPagar}
                />
              </>
            ) : (
              <ReadReceiptAi
                alvo={{ tipo: "combo", id: combo.id }}
                amountAtual={total}
                cashboxDate={cashbox.open && cashbox.session ? cashbox.session.workDate.toISOString() : null}
              />
            )}
          </section>
        ) : null}

        <ComboActions
          comboId={combo.id}
          status={combo.status}
          accounts={accounts}
          canPagar={canPagar}
          canManage={canManage}
          cashboxDate={cashboxDate}
        />
      </Card>
      </div>

      {comboEditavel && canManage ? (
        <Card className="mt-4 print:hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Adicionar títulos</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Marque os títulos a pagar que entram neste combo.
              {combo.status === "SOLICITADO" ? " O total do borderô é atualizado na hora." : ""}
            </p>
          </div>
          <div className="p-4">
            <AddTitlesToCombo comboId={combo.id} available={available} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
