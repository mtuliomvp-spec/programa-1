import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/base-url";
import { getCompany } from "@/lib/company";
import { formatCurrency, formatDate } from "@/lib/format";
import { effectivePayableStatus } from "@/lib/status";
import { Badge, Card, LinkButton } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";
import OrdemPdfButton, { type OrdemPdfData } from "./OrdemPdfButton";

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

const statusInfo = {
  PENDENTE: { label: "Pendente", tone: "warning" as const },
  ATRASADO: { label: "Atrasado", tone: "danger" as const },
  PAGO: { label: "Pago", tone: "success" as const },
};

const accountTypeLabel: Record<string, string> = { corrente: "Corrente", poupanca: "Poupança" };

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={`text-right ${strong ? "font-semibold text-slate-900" : "text-slate-800"}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="mb-1 border-b border-slate-200 pb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

export default async function OrdemPagamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payable = await prisma.payable.findUnique({
    where: { id },
    include: {
      supplier: true,
      beneficiaryUser: { select: { id: true, name: true, email: true, document: true, phone: true, bankName: true, bankAgency: true, bankAccount: true, bankAccountType: true, pixKey: true } },
      costCenter: { select: { name: true } },
      account: { select: { name: true } },
      vehicle: { select: { brand: true, model: true, plate: true } },
    },
  });
  if (!payable) notFound();

  const company = await getCompany();
  const effective = effectivePayableStatus(payable.status, payable.dueDate);
  const catLabel = payable.categoryLabel || categoryLabel[payable.category];

  // Beneficiário do pagamento: o fornecedor tem prioridade; sem fornecedor, usa
  // o usuário vinculado (ex.: vendedor da comissão), com seus dados bancários.
  const src = payable.supplier ?? payable.beneficiaryUser ?? null;
  const beneKind: "fornecedor" | "usuario" | null = payable.supplier
    ? "fornecedor"
    : payable.beneficiaryUser
      ? "usuario"
      : null;
  const bene = src
    ? {
        name: src.name,
        document: src.document,
        phone: src.phone,
        email: src.email,
        bankName: src.bankName,
        bankAgency: src.bankAgency,
        bankAccount: src.bankAccount,
        bankAccountType: src.bankAccountType,
        pixKey: src.pixKey,
      }
    : null;

  // Forma de pagamento sugerida a partir dos dados bancários do beneficiário.
  const formaPagamento = bene?.pixKey ? "PIX" : bene?.bankName || bene?.bankAccount ? "Transferência" : "—";

  // URL pública de verificação + QR Code (gerado no servidor). Usa o domínio
  // oficial (NEXT_PUBLIC_APP_URL) quando definido; senão, o endereço de acesso.
  const verifyUrl = `${await getBaseUrl()}/verificar/pagamento/${payable.publicToken}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 320 });

  const orderNo = `Nº ${String(payable.orderNumber).padStart(4, "0")}`;
  const generatedAt = `Gerado em: ${new Date().toLocaleString("pt-BR")}`;
  const bankType = bene?.bankAccountType ? accountTypeLabel[bene.bankAccountType] || bene.bankAccountType : null;
  const hasBankData = Boolean(bene && (bene.bankName || bene.bankAccount || bene.pixKey));
  const beneTitle = beneKind === "usuario" ? "Dados do beneficiário" : "Dados do fornecedor";
  const beneEditHref = beneKind === "usuario" ? "/usuarios" : payable.supplier ? `/fornecedores/${payable.supplier.id}/editar` : null;

  // Dados estruturados para o PDF (mesmo conteúdo mostrado na tela).
  const tituloRows: [string, string][] = [
    ["Descrição", payable.description],
    ["Categoria", catLabel],
  ];
  if (payable.vehicle) tituloRows.push(["Veículo", `${payable.vehicle.brand} ${payable.vehicle.model} (${payable.vehicle.plate})`]);
  if (payable.costCenter?.name) tituloRows.push(["Centro de custo", payable.costCenter.name]);
  tituloRows.push(["Vencimento", formatDate(payable.dueDate)]);
  tituloRows.push(["Forma de pagamento", formaPagamento]);
  tituloRows.push(["Status", statusInfo[effective].label]);
  if (payable.status === "PAGO" && payable.paymentDate) tituloRows.push(["Pago em", formatDate(payable.paymentDate)]);
  if (payable.account?.name) tituloRows.push(["Conta", payable.account.name]);

  const fornecedorRows: [string, string][] = bene
    ? [
        ["Nome", bene.name],
        ["CPF/CNPJ", bene.document || "—"],
        ["Telefone", bene.phone || "—"],
        ["E-mail", bene.email || "—"],
      ]
    : [["Beneficiário", "Não informado"]];

  const naoCadMsg =
    beneKind === "usuario"
      ? "Não cadastrados — informe na ficha do usuário (Usuários)."
      : "Não cadastrados — informe na ficha do fornecedor.";
  const pagamentoRows: [string, string][] = hasBankData
    ? [
        ["Banco", bene!.bankName || "—"],
        ["Agência", bene!.bankAgency || "—"],
        ["Conta", bene!.bankAccount || "—"],
        ["Tipo", bankType || "—"],
        ["Chave PIX", bene!.pixKey || "—"],
      ]
    : [["Dados bancários", naoCadMsg]];

  const sections: OrdemPdfData["sections"] = [
    { title: "Dados do título", rows: tituloRows },
    { title: beneTitle, rows: fornecedorRows },
    { title: "Dados para pagamento", rows: pagamentoRows },
  ];
  if (payable.notes) sections.push({ title: "Observação", rows: [["Observação", payable.notes]] });

  const pdfData: OrdemPdfData = {
    fileName: `ordem-pagamento-${payable.description.slice(0, 30).replace(/[^\w]+/g, "-").toLowerCase() || "titulo"}.pdf`,
    companyName: company.nomeFantasia.toUpperCase(),
    companySub: [company.razaoSocial !== company.nomeFantasia ? company.razaoSocial : null, company.cnpj ? `CNPJ ${company.cnpj}` : null]
      .filter(Boolean)
      .join(" · ") || null,
    title: "ORDEM DE PAGAMENTO",
    number: orderNo,
    generatedAt,
    valorLabel: "Valor a pagar",
    valor: formatCurrency(payable.amount),
    sections,
    qrDataUrl,
    verifyUrl,
    footer: `Sistema Financeiro ${company.nomeFantasia} · Página 1 de 1`,
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <LinkButton variant="secondary" href="/financeiro/a-pagar">← Voltar</LinkButton>
        <OrdemPdfButton data={pdfData} />
      </div>

      <Card className="p-6 sm:p-8">
        <CompanyDocHeader
          company={company}
          right={
            <>
              <p className="font-bold">ORDEM DE PAGAMENTO</p>
              <p className="text-slate-500">{orderNo}</p>
              <p className="text-slate-500">{generatedAt.replace("Gerado em: ", "")}</p>
              <Badge tone={statusInfo[effective].tone}>{statusInfo[effective].label}</Badge>
            </>
          }
        />

        <Section title="Dados do título">
          {tituloRows.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </Section>

        <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Valor a pagar</span>
          <span className="text-2xl font-black text-slate-900">{formatCurrency(payable.amount)}</span>
        </div>

        <Section title={beneTitle}>
          {fornecedorRows.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </Section>

        <Section title="Dados para pagamento">
          {hasBankData ? (
            pagamentoRows.map(([label, value]) => <Row key={label} label={label} value={value} strong={label === "Chave PIX" && !!bene?.pixKey} />)
          ) : (
            <p className="py-1.5 text-sm text-amber-700">
              Dados bancários não cadastrados.{" "}
              {beneEditHref ? (
                <a href={beneEditHref} className="font-medium text-blue-700 hover:underline">
                  {beneKind === "usuario" ? "Cadastrar na ficha do usuário" : "Cadastrar na ficha do fornecedor"}
                </a>
              ) : (
                "Vincule um fornecedor ou vendedor a este título."
              )}
            </p>
          )}
        </Section>

        {payable.notes ? (
          <Section title="Observação">
            <p className="py-1 text-sm text-slate-800">{payable.notes}</p>
          </Section>
        ) : null}

        <div className="mt-6 flex items-center gap-4 border-t border-slate-200 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR Code de verificação" className="h-24 w-24" />
          <div className="min-w-0 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">Verificar autenticidade</p>
            <p className="mt-0.5">Aponte a câmera do celular para o QR Code para confirmar que esta ordem foi emitida pelo sistema.</p>
            <a href={verifyUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block break-all text-blue-700 hover:underline">
              {verifyUrl}
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
