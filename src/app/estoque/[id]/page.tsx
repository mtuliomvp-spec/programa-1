import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import DeleteVehicleButton from "./DeleteVehicleButton";
import VehicleStatusActions from "./VehicleStatusActions";
import VehicleCosts from "./VehicleCosts";
import VehicleDebtsLookup from "./VehicleDebtsLookup";
import VehicleAdvance from "./VehicleAdvance";
import VehicleAttachments from "./VehicleAttachments";
import VehicleCrlv from "./VehicleCrlv";
import VehiclePhotos from "./VehiclePhotos";
import ClientPhotoCapture from "./ClientPhotoCapture";
import AdSettings from "./AdSettings";
import ParecerIAButton from "@/components/ParecerIAButton";
import { userCan } from "@/lib/guards";
import { getActiveAccounts } from "@/lib/accounts";
import QRCode from "qrcode";
import { getBaseUrl } from "@/lib/base-url";
import { getCompany } from "@/lib/company";
import PrintButton from "@/components/PrintButton";
import { effectivePayableStatus } from "@/lib/status";
import { daysBetween } from "@/lib/reports";

export const dynamic = "force-dynamic";

const statusTone = { ESTOQUE: "info", RESERVADO: "warning", VENDIDO: "success" } as const;
const statusLabel = { ESTOQUE: "Em estoque", RESERVADO: "Reservado", VENDIDO: "Vendido" } as const;

const payableStatusTone = { PENDENTE: "warning", PAGO: "success", ATRASADO: "danger" } as const;
const payableStatusLabel = { PENDENTE: "Pendente", PAGO: "Pago", ATRASADO: "Atrasado" } as const;

export default async function VeiculoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      supplier: true,
      payables: { orderBy: { dueDate: "asc" } },
      costs: { include: { payable: { select: { id: true, status: true, dueDate: true } } }, orderBy: { date: "asc" } },
      sale: { include: { customer: true, receivables: true } },
      attachments: {
        select: {
          id: true,
          kind: true,
          description: true,
          filename: true,
          mimeType: true,
          size: true,
          latitude: true,
          longitude: true,
          geoAccuracy: true,
          address: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!vehicle) notFound();

  // Permissões granulares: cada controle de ação só aparece para quem pode.
  const [canEditar, canExcluir, canCustos, canDebitos, canPublicar, canVender, canComunicacao, canCrlv, canOpenPayable] =
    await Promise.all([
      userCan("estoque", "editar"),
      userCan("estoque", "excluir"),
      userCan("estoque", "custos"),
      userCan("estoque", "debitos"),
      userCan("estoque", "publicar"),
      userCan("vendas", "prevenda"),
      userCan("estoque", "comunicacao"),
      userCan("estoque", "crlv"),
      userCan("financeiro", "visualizar"),
    ]);

  // Suspeita de duplicidade: 2+ custos deste veículo com o MESMO valor (ex.:
  // custo manual + título gerado por solicitação de compra para o mesmo gasto).
  // Exceção: PARCELAS DA MESMA SÉRIE têm o mesmo valor por natureza ("Parcela
  // 1/2" e "2/2" do mesmo parcelamento) e não se acusam entre si.
  const isCompraCost = (c: { description: string }) => /^Compra \d{4}\/\d{4}/.test(c.description);
  const parcelOf = (desc: string): { series: string; idx: number } | null => {
    let m = desc.match(/^(.*)[-–]\s*Parcela\s*(\d+)\/(\d+)\s*$/i);
    if (m) return { series: m[1].trim().toLowerCase(), idx: Number(m[2]) };
    m = desc.match(/^(.*)\(parc\.\s*(\d+)\/(\d+)\)\s*$/i);
    if (m) return { series: m[1].trim().toLowerCase(), idx: Number(m[2]) };
    return null;
  };
  // Regras de conflito (valor igual NÃO basta — gastos diferentes coincidem de
  // valor o tempo todo). Um par de mesmo valor só é suspeito quando:
  //  a) as descrições são idênticas (mesmo gasto lançado duas vezes); ou
  //  b) é o padrão do lançamento em dobro: um manual × um título de solicitação
  //     de compra, com datas próximas (até 3 dias).
  // Parcelas irmãs do mesmo parcelamento nunca conflitam.
  const normDesc = (desc: string) => {
    const p = parcelOf(desc);
    return (p ? p.series : desc).trim().toLowerCase();
  };
  const conflicts = (a: { description: string; date: Date }, b: { description: string; date: Date }) => {
    const pa = parcelOf(a.description);
    const pb = parcelOf(b.description);
    if (pa && pb && pa.series === pb.series && pa.idx !== pb.idx) return false;
    if (normDesc(a.description) === normDesc(b.description)) return true;
    if (isCompraCost(a) === isCompraCost(b)) return false; // mesma origem, descrições diferentes: legítimo
    const days = Math.abs(a.date.getTime() - b.date.getTime()) / 86400000;
    return days <= 3;
  };
  const duplicateIds = new Set<string>();
  const dupAdvice = new Map<string, "excluir" | "manter">();
  {
    const groups = new Map<number, typeof vehicle.costs>();
    for (const c of vehicle.costs) {
      const key = Math.round(c.amount * 100);
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const conflicted = group.filter((c) => group.some((o) => o.id !== c.id && conflicts(c, o)));
      for (const c of conflicted) duplicateIds.add(c.id);
      // Recomendação dentro do par em conflito: a solicitação de compra é a raiz
      // formal (trilha/anexos) → manter a compra, excluir o lançamento manual.
      const compras = conflicted.filter((c) => isCompraCost(c));
      const manuais = conflicted.filter((c) => !isCompraCost(c));
      if (compras.length > 0 && manuais.length > 0) {
        for (const c of compras) dupAdvice.set(c.id, "manter");
        for (const c of manuais) dupAdvice.set(c.id, "excluir");
      }
    }
  }

  // Sinais / entradas antecipadas (só p/ veículo ainda não vendido)
  const inStock = vehicle.status !== "VENDIDO";

  // QR Code do para-brisa: aponta para o anúncio público (/vitrine/[id]) —
  // tudo que ele mostra é gerenciado na ficha (preço, fotos, dados, publicar).
  const [company, qrDataUrl] = await Promise.all([
    getCompany(),
    getBaseUrl().then((base) => QRCode.toDataURL(`${base}/vitrine/${vehicle.id}`, { margin: 1, width: 480 })),
  ]);

  // Pré-venda em aberto: enquanto existir, não oferecer "Vender veículo" (levaria
  // a um beco sem saída para outro cliente). Direciona para a pré-venda existente.
  const openPreSaleRow = inStock
    ? await prisma.preSale.findFirst({
        where: { vehicleId: id, status: "ABERTA" },
        select: { id: true, number: true, customerId: true },
        orderBy: { number: "asc" },
      })
    : null;
  const openPreSale = openPreSaleRow
    ? {
        ...openPreSaleRow,
        customerName:
          (await prisma.customer.findUnique({
            where: { id: openPreSaleRow.customerId },
            select: { name: true },
          }))?.name ?? null,
      }
    : null;
  const [advanceAccounts, advanceCustomers, advances] = inStock
    ? await Promise.all([
        getActiveAccounts(),
        prisma.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.receivable.findMany({
          where: { vehicleId: id, saleId: null, status: "RECEBIDO" },
          include: { account: { select: { name: true } }, customer: { select: { name: true } } },
          orderBy: { receivedDate: "desc" },
        }),
      ])
    : [[], [], []];

  const extraCosts = vehicle.costs.reduce((sum, c) => sum + c.amount, 0);
  const totalCost = vehicle.purchasePrice + extraCosts;
  const sold = vehicle.status === "VENDIDO" && vehicle.sale?.status === "CONCLUIDA";
  const margin = sold && vehicle.sale
    ? vehicle.sale.totalAmount - totalCost
    : vehicle.salePrice - totalCost;
  const daysInStock = daysBetween(
    vehicle.entryDate,
    sold && vehicle.sale ? vehicle.sale.saleDate : new Date(),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`${vehicle.brand} ${vehicle.model}`}
        description={`Placa ${vehicle.plate} · ${vehicle.manufactureYear}/${vehicle.modelYear}`}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/estoque/${vehicle.id}/ordem-compra`} variant="secondary">
              📄 Ordem de compra
            </LinkButton>
            <LinkButton href={`/estoque/${vehicle.id}/contrato`} variant="secondary">
              📜 Contrato de compra
            </LinkButton>
            <ParecerIAButton mode="vehicle" vehicleId={vehicle.id} variant="secondary" />
            {vehicle.status !== "VENDIDO" && canVender ? (
              openPreSale ? (
                <LinkButton href={`/vendas/pre-vendas/${openPreSale.id}`} variant="primary">
                  Abrir pré-venda nº {String(openPreSale.number).padStart(4, "0")}
                </LinkButton>
              ) : (
                <LinkButton href={`/vendas/novo?vehicleId=${vehicle.id}`} variant="primary">
                  Vender veículo
                </LinkButton>
              )
            ) : null}
            {vehicle.status !== "VENDIDO" && canEditar ? (
              <LinkButton href={`/estoque/${vehicle.id}/editar`} variant="secondary">
                Editar
              </LinkButton>
            ) : null}
          </div>
        }
      />

      {openPreSale ? (
        <Card className="mb-4 border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            🤝 Este veículo tem uma <strong>pré-venda em aberto</strong> (nº{" "}
            {String(openPreSale.number).padStart(4, "0")}
            {openPreSale.customerName ? ` — ${openPreSale.customerName}` : ""}). Para vender a
            outro cliente, <strong>cancele a pré-venda</strong> primeiro.
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Dados do veículo"
              action={
                <div className="flex flex-wrap items-center gap-1.5">
                  {vehicle.consigned ? <Badge tone="info">🏷️ Consignado</Badge> : null}
                  <Badge tone={statusTone[vehicle.status]}>{statusLabel[vehicle.status]}</Badge>
                </div>
              }
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
              <InfoItem label="Versão" value={vehicle.version || "-"} />
              <InfoItem label="Cor" value={vehicle.color || "-"} />
              <InfoItem label="KM" value={`${vehicle.km.toLocaleString("pt-BR")} km`} />
              <InfoItem label="Combustível" value={vehicle.fuel || "-"} />
              <InfoItem label="Câmbio" value={vehicle.transmission || "-"} />
              <InfoItem label="Chassi" value={vehicle.chassi || "-"} />
              <InfoItem label="RENAVAM" value={vehicle.renavam || "-"} />
              <InfoItem label="Data de entrada" value={formatDate(vehicle.entryDate)} />
              <InfoItem
                label={vehicle.consigned ? "Proprietário (consignante)" : "Fornecedor"}
                value={vehicle.supplier?.name || "-"}
              />
              {vehicle.consigned ? (
                <InfoItem
                  label="Valor acertado c/ proprietário"
                  value={
                    formatCurrency(vehicle.ownerRefundAmount) +
                    (vehicle.payoffAmount > 0 || vehicle.debtsAmount > 0
                      ? ` (líquido ${formatCurrency(Math.max(0, vehicle.ownerRefundAmount - vehicle.payoffAmount - vehicle.debtsAmount))})`
                      : "")
                  }
                />
              ) : null}
              <InfoItem
                label={sold ? "Dias até vender" : "Dias em estoque"}
                value={`${daysInStock} dia(s)`}
                valueClassName={!sold && daysInStock > 90 ? "text-rose-600" : !sold && daysInStock > 60 ? "text-amber-600" : undefined}
              />
              {vehicle.notes ? <InfoItem label="Observações" value={vehicle.notes} className="col-span-full" /> : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Resultado financeiro"
              description={sold ? "Lucro real desta venda" : "Projeção com base no preço anunciado"}
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
              <InfoItem label="Preço de compra" value={formatCurrency(vehicle.purchasePrice)} />
              <InfoItem label="Custos adicionais" value={formatCurrency(extraCosts)} />
              <InfoItem label="Custo total" value={formatCurrency(totalCost)} />
              <InfoItem
                label={sold ? "Valor de venda" : "Preço anunciado"}
                value={formatCurrency(sold && vehicle.sale ? vehicle.sale.totalAmount : vehicle.salePrice)}
              />
              <InfoItem
                label={sold ? "Lucro real" : "Margem projetada"}
                value={formatCurrency(margin)}
                valueClassName={margin >= 0 ? "text-emerald-600" : "text-rose-600"}
              />
              <InfoItem
                label="Margem %"
                value={`${(
                  (margin / ((sold && vehicle.sale ? vehicle.sale.totalAmount : vehicle.salePrice) || 1)) * 100
                ).toFixed(1)}%`}
                valueClassName={margin >= 0 ? "text-emerald-600" : "text-rose-600"}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Custos do veículo"
              description="Preparação, documentação, mecânica... cada lançamento gera conta a pagar integrada"
            />
            <VehicleCosts
              vehicleId={vehicle.id}
              sold={vehicle.status === "VENDIDO"}
              canManage={canCustos}
              canOpenPayable={canOpenPayable}
              costs={vehicle.costs.map((c) => ({
                id: c.id,
                description: c.description,
                category: c.category,
                amount: c.amount,
                date: c.date,
                postSale: c.postSale,
                notes: c.notes,
                payableId: c.payable?.id ?? null,
                payableStatus: c.payable
                  ? effectivePayableStatus(c.payable.status, c.payable.dueDate)
                  : null,
                duplicateSuspect: duplicateIds.has(c.id),
                // Órfão: custo gerado por solicitação de compra ("Compra NNNN/AAAA…")
                // cuja solicitação/título foram excluídos na raiz (payable sumiu).
                orphan: !c.payable && isCompraCost(c),
                dupAdvice: dupAdvice.get(c.id) ?? null,
              }))}
            />
            {vehicle.status !== "VENDIDO" && canDebitos ? (
              <VehicleDebtsLookup vehicleId={vehicle.id} />
            ) : null}
          </Card>

          {inStock ? (
            <Card>
              <CardHeader
                title="Sinal / entrada antecipada"
                description="Dinheiro recebido antes de fechar a venda. No fechamento, é abatido do que o cliente tem a pagar."
              />
              <VehicleAdvance
                vehicleId={vehicle.id}
                canManage={canEditar}
                accounts={advanceAccounts.map((a) => ({ id: a.id, name: a.name }))}
                customers={advanceCustomers}
                advances={advances.map((r) => ({
                  id: r.id,
                  amount: r.amount,
                  date: r.receivedDate ?? r.dueDate,
                  accountName: r.account?.name ?? null,
                  customerName: r.customer?.name ?? null,
                }))}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Contas a pagar vinculadas" description="Compra do veículo e custos lançados" />
            {vehicle.payables.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Nenhuma conta a pagar vinculada.</p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Descrição</Th>
                    <Th>Vencimento</Th>
                    <Th>Valor</Th>
                    <Th>Status</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {vehicle.payables.map((p) => (
                    <Tr key={p.id}>
                      <Td>{p.description}</Td>
                      <Td>{formatDate(p.dueDate)}</Td>
                      <Td>{formatCurrency(p.amount)}</Td>
                      <Td>
                        <Badge tone={payableStatusTone[p.status]}>{payableStatusLabel[p.status]}</Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {vehicle.sale ? (
            <Card>
              <CardHeader title="Venda registrada" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
                <InfoItem label="Cliente" value={vehicle.sale.customer.name} />
                <InfoItem label="Data da venda" value={formatDate(vehicle.sale.saleDate)} />
                <InfoItem label="Valor total" value={formatCurrency(vehicle.sale.totalAmount)} />
                <InfoItem label="Vendedor" value={vehicle.sale.sellerName || "-"} />
              </div>
              <div className="px-5 pb-5">
                <Link href={`/vendas/${vehicle.sale.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                  Ver detalhes da venda →
                </Link>
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Fotos do veículo"
              description="Galeria do veículo — envie várias fotos de uma vez"
            />
            <VehiclePhotos
              vehicleId={vehicle.id}
              photos={vehicle.attachments.filter((a) => a.kind === "FOTO_VEICULO")}
              published={vehicle.published}
              inStock={vehicle.status === "ESTOQUE"}
              canManage={canEditar}
              canPublish={canPublicar}
            />
          </Card>

          <Card>
            <CardHeader
              title="CRLV"
              description="Anexe o CRLV do veículo informando o ano em exercício (ex.: CRLV 2025)"
            />
            <VehicleCrlv
              vehicleId={vehicle.id}
              canManage={canCrlv}
              crlvs={vehicle.attachments.filter((a) => a.kind === "CRLV")}
            />
          </Card>

          <Card>
            <CardHeader
              title="Documentos do veículo"
              description="Anexe a Comunicação de venda (Detran) e outros documentos deste veículo"
            />
            <VehicleAttachments
              vehicleId={vehicle.id}
              canManage={canComunicacao}
              attachments={vehicle.attachments.filter(
                (a) => a.kind !== "FOTO_VEICULO" && a.kind !== "CRLV",
              )}
            />
          </Card>

          {canEditar ? (
            <Card>
              <CardHeader
                title="Foto do cliente (antifraude)"
                description="Registre o comprador com data/hora e localização — prova contra alegação de fraude"
              />
              <ClientPhotoCapture vehicleId={vehicle.id} />
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {inStock ? (
            <Card>
              <CardHeader
                title="QR Code do para-brisa"
                description="Imprima e cole no vidro: o cliente escaneia e vê o anúncio sempre atualizado"
              />
              <div className="p-5">
                {!vehicle.published ? (
                  <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    O veículo ainda não está publicado na vitrine — use <strong>Postar na vitrine</strong> (nas fotos)
                    para o QR mostrar as informações. O QR impresso continua o mesmo.
                  </p>
                ) : null}
                <div id="qr-parabrisa" className="rounded-xl border-2 border-slate-900 bg-white p-5 text-center">
                  {company.logoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={company.logoDataUrl} alt="" className="mx-auto h-10 w-auto" />
                  ) : (
                    <p className="text-lg font-black text-slate-900">{company.nomeFantasia}</p>
                  )}
                  <p className="mt-2 text-base font-bold text-slate-900">
                    {vehicle.brand} {vehicle.model}
                    {vehicle.version ? ` ${vehicle.version}` : ""} · {vehicle.modelYear}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt="QR Code do anúncio do veículo" className="mx-auto mt-3 h-52 w-52" />
                  <p className="mt-3 text-sm font-bold text-slate-900">
                    📱 Aponte a câmera e veja preço, fotos e informações
                  </p>
                  {company.phone ? <p className="mt-1 text-xs text-slate-500">📞 {company.phone}</p> : null}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <PrintButton title={`QR para-brisa ${vehicle.plate}`} rootSelector="#qr-parabrisa" />
                  <Link
                    href={`/vitrine/${vehicle.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-700 hover:underline"
                  >
                    Ver o anúncio que o QR abre
                  </Link>
                </div>
                {canEditar || canPublicar ? (
                  <AdSettings vehicleId={vehicle.id} promo={vehicle.adPromo} hiddenFields={vehicle.adHiddenFields} />
                ) : null}
              </div>
            </Card>
          ) : null}

          {vehicle.status !== "VENDIDO" && canEditar ? (
            <Card>
              <CardHeader title="Situação no estoque" />
              <div className="p-5">
                <VehicleStatusActions id={vehicle.id} status={vehicle.status} />
              </div>
            </Card>
          ) : null}

          {vehicle.status !== "VENDIDO" && canExcluir ? (
            <Card>
              <CardHeader title="Zona de risco" />
              <div className="p-5">
                <DeleteVehicleButton id={vehicle.id} />
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium text-slate-800 ${valueClassName || ""}`}>{value}</p>
    </div>
  );
}
