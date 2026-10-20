import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import DeleteVehicleButton from "./DeleteVehicleButton";
import VehicleStatusActions from "./VehicleStatusActions";
import VehicleKm from "./VehicleKm";
import VehicleCostRefund from "./VehicleCostRefund";
import RenaveCopyData, { type CampoRenave } from "./RenaveCopyData";
import RenaveWsPanel, { type RenaveWsRegistro } from "./RenaveWsPanel";
import { lerAmbienteRenave, lerEstadoEstoque, cpfValido, hojeSaoPaulo } from "@/lib/renave-ws-dados";
import type { EstoqueRenave } from "@/lib/renave-ws";

import ComunicacaoVendaCopy from "./ComunicacaoVendaCopy";
import DocumentosCompra from "./DocumentosCompra";
import {
  cepR30,
  documentoR30,
  maiusculasR30,
  municipioR30,
  telefoneR30,
  tipoPessoaR30,
  ufR30,
  valorR30,
} from "@/lib/comunicacao-venda";
import RenaveJanelaAviso from "@/components/RenaveJanelaAviso";
import VehicleNfe, { type EntradaPrevia, type NotaResumo } from "./VehicleNfe";
import { lerNfeConfig, ncmDoVeiculo } from "@/lib/nfe-config";
import { montarNfeEntrada, montarNfeSaida, descricaoVeiculo, valorDoVeiculoNaVenda } from "@/lib/nfe-entrada";
import { lerEndereco } from "@/lib/endereco";
import { getSessionUser } from "@/lib/auth";
import type { AtpvExtraido } from "@/lib/atpv-ai";
import VehicleCosts from "./VehicleCosts";
import VehicleDebtsLookup from "./VehicleDebtsLookup";
import VehicleAdvance from "./VehicleAdvance";
import VehicleAttachments from "./VehicleAttachments";
import VehicleCrlv from "./VehicleCrlv";
import VehicleAtpv from "./VehicleAtpv";
import { detectarFaseAtpv, faseDaDescricao, numeroDaDescricao, pdfAssinado, type FaseAtpv } from "@/lib/atpv-fases";
import VehicleRenave, { type DocumentoDoVeiculo, type RenaveDados } from "./VehicleRenave";
import {
  pendenciasRenave,
  diasParaAtpvConsignacao,
  detranOperando,
  RENAVE_PRAZO_PADRAO,
  tituloLabel,
} from "@/lib/renave";
import VehicleBoletos from "./VehicleBoletos";
import TransferInProgressSetting from "./TransferInProgressSetting";
import VehicleTransferQuote from "./VehicleTransferQuote";
import VehiclePhotos from "./VehiclePhotos";
import ClientPhotoCapture from "./ClientPhotoCapture";
import SaleTransferSetting from "./SaleTransferSetting";
import AdSettings from "./AdSettings";
import ParecerIAButton from "@/components/ParecerIAButton";
import { userCan } from "@/lib/guards";
import { getActiveAccounts } from "@/lib/accounts";
import { resumoDeVisitas } from "@/lib/showroom-visits";
import { crlvNoNomeDoComprador, houseNameKeys, isOwnName, sameParty } from "@/lib/doc-owner";
import { docKey, nameKey } from "@/lib/person-keys";
import QRCode from "qrcode";
import { getBaseUrl } from "@/lib/base-url";
import { getCompany } from "@/lib/company";
import PrintButton from "@/components/PrintButton";
import { effectivePayableStatus } from "@/lib/status";
import { computeVehicleSaleResult, daysBetween } from "@/lib/reports";

export const dynamic = "force-dynamic";
// Anexar o CRLV dispara a leitura por IA (preenche RENAVAM/chassi), que leva
// alguns segundos — o padrão de 10s da Vercel cortaria a ação no meio.
export const maxDuration = 300;

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
      // Reembolsos de custo (cliente devolve um gasto do carro).
      costRefunds: {
        select: { id: true, description: true, amount: true, status: true, dueDate: true, receivedDate: true },
        orderBy: { createdAt: "asc" },
      },
      costs: {
        include: {
          payable: {
            select: { id: true, status: true, dueDate: true, category: true, description: true, vehicleId: true },
          },
        },
        orderBy: { date: "asc" },
      },
      // payables da venda: transferência DETRAN, comissões, devolução —
      // títulos ligados à VENDA (não ao carro) que também aparecem no cartão
      // "Contas a pagar vinculadas", marcados como "da venda".
      sale: { include: { customer: true, receivables: true, payables: { orderBy: { dueDate: "asc" } } } },
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
          atpvLido: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!vehicle) notFound();

  // Permissões granulares: cada controle de ação só aparece para quem pode.
  const [canEditar, canExcluir, canCustos, canDebitos, canPublicar, canVender, canComunicacao, canCrlv, canOpenPayable, canFoto, canLucro, canSinal, canAtpv, canOrcamento, canBoletos, canTransferencia, canKm, canSituacao, canRenave, canNfe, canNfeCancelar, canRenaveWs] =
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
      userCan("vendas", "foto"),
      userCan("estoque", "lucro"),
      userCan("estoque", "sinal"),
      userCan("estoque", "atpv"),
      userCan("estoque", "orcamento"),
      userCan("estoque", "boletos"),
      userCan("estoque", "transferencia"),
      userCan("estoque", "km"),
      userCan("estoque", "situacao"),
      userCan("estoque", "renave"),
      userCan("estoque", "nfe"),
      userCan("estoque", "nfecancelar"),
      userCan("estoque", "renavews"),
    ]);

  // Visitas ao anúncio na vitrine (mostradas no cartão de fotos).
  const visitas = await resumoDeVisitas({ vehicleId: vehicle.id });

  // Títulos ligados à VENDA (transferência DETRAN, comissões, devolução ao
  // cliente): não são custos do carro, por isso não estavam no cartão — e o
  // usuário procurava a transferência na ficha sem achar. Entram marcados como
  // "da venda", sem repetir o que já está ligado ao veículo. Venda cancelada
  // não tem títulos (foram revertidos).
  const idsDoVeiculo = new Set(vehicle.payables.map((p) => p.id));
  const titulosDaVenda =
    vehicle.sale && vehicle.sale.status !== "CANCELADA"
      ? vehicle.sale.payables.filter((p) => !idsDoVeiculo.has(p.id))
      : [];

  // Vendido, sem a transferência marcada, mas com o CRLV mais recente já em
  // nome de terceiro (o comprador): a ficha oferece confirmar com um toque.
  const ultimoCrlv = vehicle.attachments.find((a) => a.kind === "CRLV") ?? null;
  const crlvDoComprador =
    vehicle.docOwnerName && vehicle.sale
      ? crlvNoNomeDoComprador({
          status: vehicle.status,
          docOwnerName: vehicle.docOwnerName,
          docOwnerIsOurs: isOwnName(vehicle.docOwnerName, await houseNameKeys()),
          lastCrlvAt: ultimoCrlv?.createdAt ?? null,
          sale: vehicle.sale,
          intermediation: vehicle.intermediation,
          transferToName: vehicle.transferToName,
        })
      : false;

  // Renave: o que a escrituração exige, o que falta e o prazo citado nos avisos.
  const renaveCompany = await getCompany();
  const renavePrazo = renaveCompany.renaveObrigatorioEm ?? RENAVE_PRAZO_PADRAO;
  const renavePendencias = pendenciasRenave(vehicle);
  const renaveDiasAtpv = diasParaAtpvConsignacao(vehicle);
  // Documentos já anexados: é entre eles que costuma estar o DANFE da compra.
  const renaveDocumentos: DocumentoDoVeiculo[] = vehicle.attachments
    .filter((a) => a.kind === "DOCUMENTO")
    .map((a) => ({ id: a.id, description: a.description, filename: a.filename }));

  const renaveDados: RenaveDados = {
    vehicleId: vehicle.id,
    consigned: vehicle.consigned,
    vendido: vehicle.status === "VENDIDO",
    situacao: vehicle.renaveSituacao,
    renaveEntradaTitulo: vehicle.renaveEntradaTitulo,
    renaveEntradaProtocolo: vehicle.renaveEntradaProtocolo,
    renaveEntradaEm: vehicle.renaveEntradaEm?.toISOString() ?? null,
    entryNfeKey: vehicle.entryNfeKey,
    entryNfeNumber: vehicle.entryNfeNumber,
    entryNfeSerie: vehicle.entryNfeSerie,
    entryNfeIssuedAt: vehicle.entryNfeIssuedAt?.toISOString() ?? null,
    renavePreviaTipo: vehicle.renavePreviaTipo,
    renavePreviaNumero: vehicle.renavePreviaNumero,
    renavePreviaEm: vehicle.renavePreviaEm?.toISOString() ?? null,
    renaveAssinaturaTipo: vehicle.renaveAssinaturaTipo,
    renaveAssinaturaEm: vehicle.renaveAssinaturaEm?.toISOString() ?? null,
    consignContractId: vehicle.consignContractId,
    consignContractAt: vehicle.consignContractAt?.toISOString() ?? null,
    renaveSaidaTitulo: vehicle.renaveSaidaTitulo,
    renaveSaidaProtocolo: vehicle.renaveSaidaProtocolo,
    renaveSaidaEm: vehicle.renaveSaidaEm?.toISOString() ?? null,
    exitNfeKey: vehicle.exitNfeKey,
    exitNfeNumber: vehicle.exitNfeNumber,
    exitNfeSerie: vehicle.exitNfeSerie,
    exitNfeIssuedAt: vehicle.exitNfeIssuedAt?.toISOString() ?? null,
    crvNumber: vehicle.crvNumber,
    crvSecurityCode: vehicle.crvSecurityCode,
    renaveVinculoMotivo: vehicle.renaveVinculoMotivo,
    renaveNotes: vehicle.renaveNotes,
  };

  // NF-e emitida pelo sistema (Focus NFe): histórico e a prévia da nota de
  // entrada — o que falta para emitir aparece antes de qualquer clique.
  const nfeConfig = lerNfeConfig(renaveCompany.nfeConfig);
  const notasFiscais: NotaResumo[] = (
    await prisma.notaFiscal.findMany({ where: { vehicleId: vehicle.id }, orderBy: { createdAt: "desc" } })
  ).map((n) => ({
    id: n.id,
    tipo: n.tipo,
    ambiente: n.ambiente,
    status: n.status,
    numero: n.numero,
    serie: n.serie,
    chave: n.chave,
    mensagem: n.mensagem,
    createdAt: n.createdAt.toISOString(),
    emitidaPor: n.emitidaPor,
    valor: n.valor,
    cfop: n.cfop,
    temXml: !!n.caminhoXml,
    temDanfe: !!n.caminhoDanfe,
    justificativaCancelamento: n.justificativaCancelamento,
  }));
  // NCM pela cilindrada (versão/modelo); sem como saber, vale o padrão.
  const ncmVeiculo = ncmDoVeiculo(nfeConfig, vehicle);
  const previaEntrada = montarNfeEntrada({
    cfg: nfeConfig,
    empresa: { cnpj: renaveCompany.cnpj, inscricaoEstadual: renaveCompany.inscricaoEstadual, uf: renaveCompany.uf },
    veiculo: vehicle,
    vendedor: vehicle.supplier
      ? {
          name: vehicle.supplier.name,
          document: vehicle.supplier.document,
          phone: vehicle.supplier.phone,
          endereco: lerEndereco(vehicle.supplier.endereco),
          inscricaoEstadual: vehicle.supplier.inscricaoEstadual,
        }
      : null,
    agora: new Date(),
  });
  const nfeEntrada: EntradaPrevia = {
    faltas: previaEntrada.ok ? [] : previaEntrada.faltas,
    descricao: previaEntrada.ok ? previaEntrada.descricao : descricaoVeiculo(vehicle),
    ncm: ncmVeiculo.ncm,
    ncmMotivo: ncmVeiculo.motivo,
    cfop: previaEntrada.ok ? previaEntrada.cfop : null,
    valor: vehicle.purchasePrice,
    vendedor: vehicle.supplier?.name ?? null,
    vendedorEmpresa: (vehicle.supplier?.document ?? "").replace(/\D/g, "").length === 14,
    vendedorIe: vehicle.supplier?.inscricaoEstadual ?? null,
  };
  // NF-e de entrada RECEBIDA: quando quem vende é empresa (locadora,
  // concessionária), a nota de venda DELA é a entrada do carro — a chave fica
  // no Renave e o DANFE em Documentos. Não é nota emitida pelo sistema, mas é
  // aqui que se procura por ela; e com ela não há entrada a emitir.
  const anexoNfeCompra = vehicle.attachments.find((a) => /^NF-?e de compra/i.test(a.description)) ?? null;
  const chaveEntrada = (vehicle.entryNfeKey ?? "").replace(/\D/g, "");
  const nfeRecebida =
    (chaveEntrada && !notasFiscais.some((n) => n.tipo === "ENTRADA" && (n.chave ?? "").replace(/\D/g, "") === chaveEntrada)) ||
    anexoNfeCompra
      ? {
          chave: chaveEntrada || null,
          numero: vehicle.entryNfeNumber,
          serie: vehicle.entryNfeSerie,
          emitidaEm: vehicle.entryNfeIssuedAt ? formatDate(vehicle.entryNfeIssuedAt) : null,
          emitente: vehicle.supplier?.name ?? null,
          anexoId: anexoNfeCompra?.id ?? null,
        }
      : null;
  // Nota de venda: só com venda registrada (e não cancelada).
  const vendaNfe = vehicle.sale && vehicle.sale.status !== "CANCELADA" ? vehicle.sale : null;
  const previaSaida = vendaNfe
    ? montarNfeSaida({
        cfg: nfeConfig,
        empresa: { cnpj: renaveCompany.cnpj, inscricaoEstadual: renaveCompany.inscricaoEstadual, uf: renaveCompany.uf },
        veiculo: vehicle,
        comprador: {
          name: vendaNfe.customer.name,
          document: vendaNfe.customer.document,
          phone: vendaNfe.customer.phone,
          endereco: lerEndereco(vendaNfe.customer.endereco),
          inscricaoEstadual: vendaNfe.customer.inscricaoEstadual,
        },
        venda: vendaNfe,
        agora: new Date(),
      })
    : null;
  const nfeSaida: EntradaPrevia | null =
    vendaNfe && previaSaida
      ? {
          faltas: previaSaida.ok ? [] : previaSaida.faltas,
          descricao: previaSaida.ok ? previaSaida.descricao : descricaoVeiculo(vehicle),
          ncm: ncmVeiculo.ncm,
          ncmMotivo: ncmVeiculo.motivo,
          cfop: previaSaida.ok ? previaSaida.cfop : null,
          valor: valorDoVeiculoNaVenda(vendaNfe),
          vendedor: vendaNfe.customer.name,
          vendedorEmpresa: (vendaNfe.customer.document ?? "").replace(/\D/g, "").length === 14,
          vendedorIe: vendaNfe.customer.inscricaoEstadual,
        }
      : null;

  // "Copiar dados para o ControlStock": o que o registro no painel da
  // integradora pede, campo a campo (vazio = falta, com a dica de onde
  // completar). Valores como o painel aceita: só dígitos onde é número.
  const soDigitos = (s: string | null | undefined) => (s ? s.replace(/\D/g, "") || null : null);
  // "Informa Entrada" do ControlStock: Placa → Documento do proprietário
  // (CPF/CNPJ) → Número. Proprietário = em nome de quem o CRLV está; sem CRLV
  // lido, o vendedor. Documento: o do fornecedor quando é a mesma pessoa, o
  // CNPJ da loja quando já está no nome dela; senão falta (o CRLV não guarda).
  const donoNome = vehicle.docOwnerName ?? vehicle.supplier?.name ?? null;
  const donoEhLoja =
    !!vehicle.docOwnerName &&
    isOwnName(vehicle.docOwnerName, [nameKey(renaveCompany.razaoSocial), nameKey(renaveCompany.nomeFantasia)]);
  const donoDoc = donoEhLoja
    ? soDigitos(renaveCompany.cnpj)
    : vehicle.supplier && (!vehicle.docOwnerName || sameParty(vehicle.docOwnerName, null, vehicle.supplier))
      ? soDigitos(vehicle.supplier.document)
      : null;
  // Mesma ordem do "Informa Entrada": 1ª tela (placa + documento do
  // proprietário) e, depois do "Avançar", o formulário completo.
  const renaveCopiaEntrada: CampoRenave[] = [
    { secao: "1ª tela — antes do “Avançar”", rotulo: "Placa", valor: vehicle.plate || null },
    { rotulo: "Proprietário (em nome de quem está o CRLV)", valor: donoNome, dica: "anexe o CRLV" },
    {
      rotulo: "Documento do proprietário",
      valor: donoDoc ? (donoDoc.length === 14 ? "CNPJ" : "CPF") : null,
      dica: "escolha CPF ou CNPJ conforme o CRLV",
    },
    {
      rotulo: "Número do documento",
      valor: donoDoc,
      dica: donoEhLoja ? "CNPJ em Parâmetros da empresa" : "CPF/CNPJ de quem está no CRLV (cadastro do fornecedor)",
    },
    { secao: "Depois do “Avançar”", rotulo: "Renavam", valor: soDigitos(vehicle.renavam), dica: "Editar veículo" },
    {
      rotulo: "Tipo Entrada",
      valor: vehicle.consigned ? tituloLabel.CONSIGNACAO : "Solicitação de Entrada Veículo Próprio",
    },
    { rotulo: "Marca", valor: vehicle.brand || null },
    { rotulo: "Modelo", valor: vehicle.model || null },
    { rotulo: "Versão", valor: vehicle.version || null, dica: "Editar veículo" },
    { rotulo: "Ano de fabricação", valor: vehicle.manufactureYear ? String(vehicle.manufactureYear) : null },
    { rotulo: "Ano do modelo", valor: vehicle.modelYear ? String(vehicle.modelYear) : null },
    {
      // ATPV-e anexada = CRV digital (é o que sai no papel branco); CRV de
      // papel antigo é AZUL ou VERDE, pela cor do documento — só olhando.
      rotulo: "Tipo CRV",
      valor: vehicle.attachments.some((a) => /ATPV/i.test(a.description)) ? "DIGITAL/BRANCO" : null,
      dica: "sem ATPV-e anexada: veja a cor do CRV de papel — AZUL ou VERDE",
    },
    { rotulo: "Número CRV", valor: soDigitos(vehicle.crvNumber), dica: "lido da ATPV-e (formulário do Renave)" },
    { rotulo: "Código Segurança CRV", valor: soDigitos(vehicle.crvSecurityCode), dica: "lido da ATPV-e" },
    { rotulo: "Valor da compra", valor: vehicle.purchasePrice ? vehicle.purchasePrice.toFixed(2).replace(".", ",") : null },
    { rotulo: "Data Entrada Estoque", valor: formatDate(vehicle.entryDate) },
    { rotulo: "Hodômetro", valor: vehicle.km ? String(vehicle.km) : null, dica: "KM na ficha" },
    { rotulo: "Data Hodômetro", valor: formatDate(vehicle.entryDate), dica: "dia em que o km foi lido" },
    { rotulo: "Chave da Nota Fiscal", valor: soDigitos(vehicle.entryNfeKey), dica: "formulário do Renave (ler a NF-e)" },
  ];
  // Renave direto (Renave-WS / SERPRO): ambiente em uso, o estoque do veículo
  // nesse ambiente e o que preenche os formulários de entrada e saída.
  const renaveWsAmbiente = lerAmbienteRenave(renaveCompany.renaveWsAmbiente);
  const renaveWs = renaveWsAmbiente
    ? await (async () => {
        const [reg, ops, usuario] = await Promise.all([
          prisma.renaveRegistro.findUnique({
            where: { vehicleId_ambiente: { vehicleId: vehicle.id, ambiente: renaveWsAmbiente } },
          }),
          prisma.renaveOperacao.findMany({
            where: { vehicleId: vehicle.id, ambiente: renaveWsAmbiente },
            orderBy: { createdAt: "desc" },
            take: 15,
            select: { id: true, operacao: true, status: true, mensagem: true, userName: true, createdAt: true },
          }),
          getSessionUser().then((u) =>
            u ? prisma.user.findUnique({ where: { id: u.id }, select: { document: true } }) : null,
          ),
        ]);
        const est = (reg?.estoque ?? null) as EstoqueRenave | null;
        const registro: RenaveWsRegistro = reg
          ? {
              idEstoque: reg.idEstoque,
              estado: lerEstadoEstoque(reg.estado),
              sincronizadoEm: reg.sincronizadoEm?.toISOString() ?? null,
              assinaturaEnviadaEm: reg.assinaturaEnviadaEm?.toISOString() ?? null,
              atpveNumero: reg.atpveNumero,
              codigoCrvAtual: reg.codigoCrvAtual,
              mock: (reg.mock ?? null) as NonNullable<RenaveWsRegistro>["mock"],
              cancelado: !!est?.cancelamentoEstoque,
              // Entrada de veículo próprio: o Renave grava a loja como vendedora.
              proprio:
                !!est &&
                (!est.entradaEstoque?.vendedor?.numeroDocumento ||
                  soDigitos(est.entradaEstoque.vendedor.numeroDocumento) === soDigitos(renaveCompany.cnpj) ||
                  (renaveWsAmbiente === "HOMOLOGACAO" && !!(reg.mock as { proprio?: boolean } | null)?.proprio)),
              notaEntrada: est?.entradaEstoque?.chaveNotaFiscalEntrada ?? null,
              notaSaida: est?.saidaEstoque?.chaveNotaFiscalSaida ?? null,
              termoEntrada: est?.entradaEstoque?.numeroTermoEntradaEstoque ?? null,
              termoSaida: est?.saidaEstoque?.numeroTermoSaidaEstoque ?? null,
              compradorNome: est?.saidaEstoque?.comprador?.nome ?? null,
              restricoes: (est?.restricoesVeiculo ?? []).map((r) => r.tipoRestricao ?? "").filter(Boolean),
            }
          : null;
        const cpfUsuario = soDigitos(usuario?.document);
        const cpfOperador = cpfUsuario && cpfValido(cpfUsuario) ? cpfUsuario : (renaveCompany.renaveWsCpfOperador ?? "");
        const emailLoja = renaveCompany.renaveWsEmail || renaveCompany.email || "";
        const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
        const valor = (n: number) => (n > 0 ? n.toFixed(2).replace(".", ",") : "");
        const entrada = {
          placa: vehicle.plate ?? "",
          renavam: soDigitos(vehicle.renavam) ?? "",
          tipoCrv: vehicle.crvTipo ?? "",
          numeroCrv: soDigitos(vehicle.crvNumber) ?? "",
          codigoSegurancaCrv: soDigitos(vehicle.crvSecurityCode) ?? "",
          km: vehicle.km ? String(vehicle.km) : "",
          kmEm: `${diaSP(vehicle.entryDate)}T09:00`,
          documentoProprietario: donoDoc ?? soDigitos(vehicle.supplier?.document) ?? "",
          dataCompra: diaSP(vehicle.entryDate),
          valorCompra: valor(vehicle.purchasePrice),
          emailVendedor: vehicle.supplier?.email ?? "",
          emailEstabelecimento: emailLoja,
          cpfOperador,
        };
        const venda = vehicle.sale && vehicle.sale.status !== "CANCELADA" ? vehicle.sale : null;
        const end = venda ? lerEndereco(venda.customer.endereco) : null;
        const saida = venda
          ? {
              placa: vehicle.plate ?? "",
              renavam: soDigitos(vehicle.renavam) ?? "",
              numeroCrv: soDigitos(vehicle.crvNumber) ?? "",
              codigoSegurancaCrv: reg?.codigoCrvAtual ?? "",
              dataVenda: diaSP(venda.saleDate),
              valorVenda: valor(valorDoVeiculoNaVenda(venda)),
              compradorDocumento: soDigitos(venda.customer.document) ?? "",
              compradorNome: venda.customer.name,
              compradorEmail: venda.customer.email ?? "",
              cep: end?.cep ?? "",
              logradouro: end?.logradouro ?? "",
              numero: end?.numero ?? "",
              complemento: end?.complemento ?? "",
              bairro: end?.bairro ?? "",
              cidade: end?.cidade ?? "",
              uf: end?.uf ?? "",
              codigoMunicipio: "",
              emailEstabelecimento: emailLoja,
              cpfOperador,
            }
          : null;
        // Assinatura do vendedor: a ATPV-e assinada (ou foto do CRV) anexada.
        const anexos = vehicle.attachments
          .filter((a) => /^image\/|application\/pdf/.test(a.mimeType) && (a.kind === "DOCUMENTO" || a.kind === "CRLV"))
          .sort((a, b) => Number(/assinad/i.test(b.description)) - Number(/assinad/i.test(a.description)))
          .map((a) => ({ id: a.id, description: a.description, filename: a.filename }));
        return {
          ambiente: renaveWsAmbiente,
          registro,
          operacoes: ops.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() })),
          entrada,
          proprioSugerido: donoEhLoja,
          vendido: vehicle.status === "VENDIDO",
          saida,
          anexos,
          chaves: { entrada: soDigitos(vehicle.entryNfeKey), saida: soDigitos(vehicle.exitNfeKey) },
          hoje: hojeSaoPaulo(),
        };
      })()
    : null;

  const cliente = vehicle.sale?.customer ?? null;
  const renaveCopiaSaida: CampoRenave[] | null = vehicle.sale
    ? [
        { rotulo: "Título do negócio", valor: tituloLabel[vehicle.renaveSaidaTitulo ?? "VENDA"] },
        { rotulo: "Placa", valor: vehicle.plate || null },
        { rotulo: "RENAVAM", valor: soDigitos(vehicle.renavam), dica: "Editar veículo" },
        { rotulo: "Chassi", valor: vehicle.chassi, dica: "Editar veículo" },
        { rotulo: "Hodômetro (km)", valor: vehicle.km ? String(vehicle.km) : null, dica: "KM na ficha" },
        { rotulo: "Data da venda", valor: formatDate(vehicle.sale.saleDate) },
        { rotulo: "Valor da venda", valor: vehicle.sale.totalAmount.toFixed(2).replace(".", ",") },
        { rotulo: "Comprador", valor: cliente?.name ?? null },
        { rotulo: "CPF/CNPJ do comprador", valor: soDigitos(cliente?.document), dica: "cadastro do cliente" },
        { rotulo: "Endereço do comprador", valor: cliente?.address ?? null, dica: "cadastro do cliente" },
        { rotulo: "Telefone do comprador", valor: soDigitos(cliente?.phone) },
        { rotulo: "E-mail do comprador", valor: cliente?.email ?? null },
        { rotulo: "Nº do CRV", valor: soDigitos(vehicle.crvNumber), dica: "lido da ATPV-e" },
        { rotulo: "Código de segurança do CRV", valor: soDigitos(vehicle.crvSecurityCode), dica: "lido da ATPV-e" },
        { rotulo: "Chave da NF-e de saída", valor: soDigitos(vehicle.exitNfeKey), dica: "formulário do Renave" },
      ]
    : null;

  // Comunicação de venda (SICOVE) pela R30: os dados do formulário dela, na
  // ordem e no formato em que ele pede (prints da tela "Consultar por Veículo"
  // e "Dados da Venda"), para copiar e colar — sem integração com o site.
  // Fase de cada arquivo da ATPV-e (emitida, preenchida, assinada, termo):
  // a gravada na descrição; nos arquivos antigos, deduzida do próprio arquivo.
  const atpvDocs = vehicle.attachments.filter((a) => a.kind === "DOCUMENTO" && /atpv/i.test(a.description));
  const semFase = atpvDocs.filter((a) => !faseDaDescricao(a.description));
  const fasesInferidas = new Map<string, FaseAtpv>();
  if (semFase.length) {
    const bytes = await prisma.vehicleAttachment.findMany({
      where: { id: { in: semFase.map((a) => a.id) } },
      select: { id: true, data: true, mimeType: true },
    });
    const { textoDoPdf } = await import("@/lib/pdf-text");
    for (const a of semFase) {
      const b = bytes.find((x) => x.id === a.id);
      const pdf = b?.mimeType === "application/pdf";
      let texto = "";
      try {
        texto = pdf && b ? textoDoPdf(Buffer.from(b.data)) : "";
      } catch {
        texto = "";
      }
      fasesInferidas.set(
        a.id,
        detectarFaseAtpv({
          filename: a.filename,
          texto,
          assinadoDigital: !!(pdf && b && pdfAssinado(b.data)),
          dataVenda: (a.atpvLido as { dataVenda?: string | null } | null)?.dataVenda ?? null,
        }),
      );
    }
  }
  const faseAtpvDe = (id: string): FaseAtpv | null => {
    const a = atpvDocs.find((x) => x.id === id);
    return a ? (faseDaDescricao(a.description) ?? fasesInferidas.get(id) ?? null) : null;
  };
  const endSistema = cliente ? lerEndereco(cliente.endereco) : null;
  // A ATPV-e DA VENDA (comprador = o cliente da venda; senão a mais recente
  // lida depois da venda) completa o que o cadastro não tem: é o documento
  // oficial que a R30 confere — CRV, vendedor, comprador e valor declarado.
  const atpvAnexos = vehicle.attachments.filter((a) => /ATPV/i.test(a.description));
  const atpvLidas = atpvAnexos
    .map((a) => ({ a, l: (a.atpvLido ?? null) as AtpvExtraido | null }))
    .filter((x): x is { a: (typeof atpvAnexos)[number]; l: AtpvExtraido } => !!x.l);
  const atpvVenda =
    (cliente
      ? atpvLidas.find(
          (x) =>
            (docKey(cliente.document) && docKey(cliente.document) === docKey(x.l.compradorDocumento)) ||
            (!!x.l.compradorNome && sameParty(x.l.compradorNome, null, cliente)),
        )?.l
      : null) ??
    (vehicle.sale ? atpvLidas.find((x) => x.a.createdAt >= vehicle.sale!.saleDate)?.l : null) ??
    null;
  // O termo de conformidade não tem dados do veículo: não é "ATPV-e não lida".
  const atpvSemLeitura =
    atpvAnexos.find((a) => !a.atpvLido && faseAtpvDe(a.id) !== "TERMO")?.id ?? null;
  const daAtpv = "da ATPV-e";
  // Endereço do comprador: o do cadastro; faltando, o da ATPV-e.
  const endComprador = {
    cep: endSistema?.cep || atpvVenda?.compradorCep || null,
    logradouro: endSistema?.logradouro || atpvVenda?.compradorLogradouro || null,
    numero: endSistema?.numero || atpvVenda?.compradorNumero || null,
    complemento: endSistema?.complemento || atpvVenda?.compradorComplemento || null,
    bairro: endSistema?.bairro || atpvVenda?.compradorBairro || null,
    cidade: endSistema?.cidade || atpvVenda?.compradorMunicipio || null,
    uf: endSistema?.uf || atpvVenda?.compradorUf || null,
  };
  const endDaAtpv = !endSistema?.logradouro && !!atpvVenda?.compradorLogradouro;
  const docCliente = cliente?.document || atpvVenda?.compradorDocumento || null;
  const nomeCliente = cliente?.name || atpvVenda?.compradorNome || null;
  // Proprietário = quem VENDE (em nome de quem o CRV está na hora da venda).
  // A ATPV-e da venda diz quem é; sem ela, se o documento já passou para o
  // comprador, quem vendeu foi a loja.
  const proprietarioEhLoja =
    donoEhLoja || !vehicle.docOwnerName || (!!cliente && sameParty(vehicle.docOwnerName, null, cliente));
  const propDoc = atpvVenda?.vendedorDocumento || (proprietarioEhLoja ? soDigitos(renaveCompany.cnpj) : donoDoc);
  const propNome = atpvVenda?.vendedorNome || (proprietarioEhLoja ? renaveCompany.razaoSocial : donoNome);
  const crvComunicacao = soDigitos(atpvVenda?.numeroCrv) ?? soDigitos(vehicle.crvNumber);
  const valorSistema = vehicle.sale ? valorDoVeiculoNaVenda(vehicle.sale) : 0;
  const valorAtpv = atpvVenda?.valorDeclarado ?? null;
  const temAtpv = atpvAnexos.length > 0;
  const comunicacaoCampos: CampoRenave[] | null = vehicle.sale
    ? [
        { secao: "1ª tela — Consultar por Veículo", rotulo: "TIPO-CVE", valor: "1-COMUNICAÇÃO DE VENDA DIRETA" },
        { rotulo: "Placa", valor: vehicle.plate && !/^0KM-/i.test(vehicle.plate) ? vehicle.plate : null, dica: "Editar veículo" },
        { rotulo: "RENAVAM", valor: soDigitos(vehicle.renavam) ?? soDigitos(atpvVenda?.renavam), dica: "Editar veículo" },
        {
          rotulo: "Tipo CRV",
          // ATPV-e (CRV digital) é o "BRANCO"; CRV de papel antigo, pela cor.
          valor: temAtpv ? "BRANCO" : null,
          dica: "anexe a ATPV-e da venda (card ATPV-e) — CRV de papel antigo: AZUL ou VERDE, pela cor",
        },
        {
          rotulo: "Número CRV",
          valor: crvComunicacao,
          dica: "anexe a ATPV-e da venda (card ATPV-e)",
          nota: atpvVenda?.numeroCrv ? daAtpv : undefined,
        },
        { rotulo: "Data da Venda", valor: formatDate(vehicle.sale.saleDate) },
        { rotulo: "Tipo Pessoa (proprietário)", valor: tipoPessoaR30(propDoc), dica: "anexe a ATPV-e da venda — ela traz o CPF/CNPJ do vendedor" },
        {
          rotulo: "CPF/CNPJ Proprietário",
          valor: documentoR30(propDoc),
          dica: `anexe a ATPV-e da venda — ela traz o CPF/CNPJ de ${propNome ?? "quem está no CRV"}`,
          nota: atpvVenda?.vendedorDocumento ? `${daAtpv} (${municipioR30(atpvVenda.vendedorNome) ?? "vendedor"})` : undefined,
        },
        {
          secao: "Dados da Venda",
          rotulo: "Valor da Venda",
          // O valor DECLARADO na ATPV-e é o que a R30 confere; sem ela, só o
          // carro (a transferência cobrada junto não é preço do veículo).
          valor: valorR30(valorAtpv ?? valorSistema),
          nota:
            valorAtpv != null
              ? Math.abs(valorAtpv - valorSistema) > 0.5
                ? `${daAtpv} — a venda no sistema está em ${valorR30(valorSistema)}`
                : daAtpv
              : undefined,
        },
        { rotulo: "Data da Venda", valor: formatDate(vehicle.sale.saleDate) },
        {
          rotulo: "Data da Firma",
          valor: formatDate(vehicle.sale.saleDate),
          dica: "data em que as assinaturas da ATPV-e foram reconhecidas",
        },
        { rotulo: "UF", valor: ufR30(renaveCompany.uf), dica: "UF da loja em Parâmetros da empresa" },
        { rotulo: "Município", valor: municipioR30(renaveCompany.city), dica: "cidade da loja em Parâmetros da empresa" },
        { rotulo: "Telefone do Informante", valor: telefoneR30(renaveCompany.phone), dica: "telefone com DDD em Parâmetros da empresa" },
        { rotulo: "Nome do Informante", valor: municipioR30(renaveCompany.nomeFantasia) },
        // Tela do vendedor: ordem a confirmar pelo print.
        { secao: "Dados do Vendedor", rotulo: "Nome", valor: propNome ? municipioR30(propNome) : null, dica: "anexe a ATPV-e da venda" },
        { rotulo: "CPF/CNPJ", valor: documentoR30(propDoc), dica: "anexe a ATPV-e da venda" },
        // Mesma ordem da tela "Dados do Comprador". A lupa do CEP no site já
        // preenche endereço, bairro, UF e município — confira com o daqui.
        {
          secao: "Dados do Comprador",
          rotulo: "Tipo Pessoa",
          valor: tipoPessoaR30(docCliente),
          dica: "CPF/CNPJ no cadastro do cliente",
        },
        {
          rotulo: soDigitos(docCliente)?.length === 14 ? "CNPJ" : "CPF",
          valor: documentoR30(docCliente),
          dica: "cadastro do cliente",
        },
        { rotulo: "Nome", valor: nomeCliente ? municipioR30(nomeCliente) : null, dica: "cadastro do cliente" },
        { rotulo: "CEP", valor: cepR30(endComprador.cep), dica: "endereço do cliente (CEP)", nota: endDaAtpv ? daAtpv : undefined },
        { rotulo: "Endereço", valor: maiusculasR30(endComprador.logradouro), dica: "endereço do cliente" },
        { rotulo: "Nº", valor: maiusculasR30(endComprador.numero), dica: "endereço do cliente (use S/N se não houver)" },
        ...(endComprador.complemento ? [{ rotulo: "Complemento", valor: maiusculasR30(endComprador.complemento) }] : []),
        { rotulo: "Bairro", valor: maiusculasR30(endComprador.bairro), dica: "endereço do cliente" },
        { rotulo: "UF", valor: ufR30(endComprador.uf), dica: "endereço do cliente" },
        { rotulo: "Município", valor: municipioR30(endComprador.cidade), dica: "endereço do cliente" },
        // Telefone não é obrigatório no site: vazio não conta como falta.
        ...(telefoneR30(cliente?.phone) ? [{ rotulo: "Telefone", valor: telefoneR30(cliente?.phone) }] : []),
      ]
    : null;
  const comunicacaoTitulo = vehicle.payables.find(
    (p) => p.categoryLabel === "Comunicação de venda" && !/^cancelamento/i.test(p.description),
  );
  const comunicacaoEnviada = comunicacaoTitulo ? formatDate(comunicacaoTitulo.createdAt) : null;

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

  // Compra do carro lançada TAMBÉM como custo: o preço de compra já está no
  // cadastro do veículo, então o mesmo dinheiro conta duas vezes no custo total.
  // (A guarda em finance.ts impede novos casos; a tela de correção limpa os
  // antigos.) Mesmas regras de src/app/estoque/corrigir-custo-compra/detect.ts.
  const purchaseDuplicated = vehicle.costs.filter((c) =>
    c.payable
      ? c.payable.category === "COMPRA_VEICULO" ||
        (c.payable.description.startsWith("Compra do veículo") && c.payable.vehicleId === vehicle.id)
      : c.description.includes("Compra do veículo") &&
        Math.abs(c.amount - vehicle.purchasePrice) < 0.01,
  );

  // Sinais / entradas antecipadas (só p/ veículo ainda não vendido)
  const inStock = vehicle.status !== "VENDIDO";

  // Sócios ativos: só o veículo vendido oferece custear o pós-venda pelo capital.
  const costBeneficiaries =
    vehicle.status === "VENDIDO" && canCustos
      ? await prisma.capitalBeneficiary.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : [];

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
          // Sinais/entradas antecipadas: pendentes (aguardando crédito) e já creditados.
          where: { vehicleId: id, saleId: null, status: { in: ["PENDENTE", "RECEBIDO"] } },
          include: { account: { select: { name: true } }, customer: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], [], []];
  // Sinais devolvidos deste veículo (histórico): a devolução e a parte retida
  // de cada um, pela marca da devolução.
  const sinaisDevolvidos = inStock
    ? await prisma.receivable.findMany({
        where: { sinalVehicleId: id, sinalParContabil: false },
        select: {
          id: true,
          amount: true,
          status: true,
          receivedDate: true,
          dueDate: true,
          sinalGroup: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const gruposDevolucao = sinaisDevolvidos.map((r) => r.sinalGroup).filter((g): g is string => !!g);
  const [devolucoesSinal, retidosSinal] = gruposDevolucao.length
    ? await Promise.all([
        prisma.payable.findMany({
          where: { sinalGroup: { in: gruposDevolucao }, sinalParContabil: false },
          select: { sinalGroup: true, amount: true, status: true },
        }),
        prisma.receivable.findMany({
          where: { sinalGroup: { in: gruposDevolucao }, sinalParContabil: true },
          select: { sinalGroup: true, amount: true },
        }),
      ])
    : [[], []];

  // Custos custeados pelo capital de um sócio ficam FORA do custo/margem do carro
  // (são do sócio, dono do resultado — viram retirada, não custo da loja). Eles
  // seguem visíveis na lista de custos, sinalizados.
  const extraCosts = vehicle.costs
    .filter((c) => !c.capitalBeneficiaryId)
    .reduce((sum, c) => sum + c.amount, 0);
  // Nome do sócio de cada custo custeado pelo capital (para o selo na lista).
  const costCapitalIds = [
    ...new Set(vehicle.costs.map((c) => c.capitalBeneficiaryId).filter((x): x is string => !!x)),
  ];
  const costCapitalNames = costCapitalIds.length
    ? new Map(
        (
          await prisma.capitalBeneficiary.findMany({
            where: { id: { in: costCapitalIds } },
            select: { id: true, name: true },
          })
        ).map((b) => [b.id, b.name]),
      )
    : new Map<string, string>();
  // Consignado: o custo do negócio é o valor acertado com o proprietário (o carro
  // não é comprado, purchasePrice 0). Os custos adicionais entram igual ao próprio.
  const sold = vehicle.status === "VENDIDO" && vehicle.sale?.status === "CONCLUIDA";
  // Vendido: vale a cópia travada na venda (é a que o relatório usa).
  const consignedCost = sold && vehicle.sale ? vehicle.sale.ownerRefundAmount || 0 : vehicle.consigned ? vehicle.ownerRefundAmount : 0;
  const totalCost = vehicle.purchasePrice + consignedCost + extraCosts;
  const margin = sold && vehicle.sale
    ? vehicle.sale.totalAmount - totalCost
    : vehicle.salePrice - totalCost;
  const daysInStock = daysBetween(
    vehicle.entryDate,
    sold && vehicle.sale ? vehicle.sale.saleDate : new Date(),
  );
  // Resultado da venda na mesma conta do relatório "Lucro por veículo".
  const saleResult =
    sold && vehicle.sale
      ? computeVehicleSaleResult({
          purchasePrice: vehicle.purchasePrice,
          extraCosts,
          sale: vehicle.sale,
        })
      : null;

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
              <VehicleKm vehicleId={vehicle.id} km={vehicle.km} canEdit={canKm || canEditar} />
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

          {canLucro ? (
            <Card>
              <CardHeader
                title="Resultado financeiro"
                description={
                  sold
                    ? "Compra e custos do carro — as despesas da venda entram no card da venda"
                    : "Projeção com base no preço anunciado"
                }
              />
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
                <InfoItem
                  label={vehicle.consigned ? "Valor acertado (proprietário)" : "Preço de compra"}
                  value={formatCurrency(vehicle.consigned ? consignedCost : vehicle.purchasePrice)}
                />
                <InfoItem label="Custos adicionais" value={formatCurrency(extraCosts)} />
                <InfoItem label="Custo total" value={formatCurrency(totalCost)} />
                <InfoItem
                  label={sold ? "Valor de venda" : "Preço anunciado"}
                  value={formatCurrency(sold && vehicle.sale ? vehicle.sale.totalAmount : vehicle.salePrice)}
                />
                <InfoItem
                  label={sold ? "Lucro bruto" : "Margem projetada"}
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
              {sold ? (
                <p className="px-5 pb-4 text-xs text-slate-400">
                  Lucro bruto = valor de venda − custo total. Comissão, indicações, transferência e
                  o retorno da financeira entram no resultado final, no card &quot;Venda registrada&quot;.
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Custos do veículo"
              description="Preparação, documentação, mecânica... cada lançamento gera conta a pagar integrada"
            />
            {purchaseDuplicated.length > 0 ? (
              <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-medium">⚠️ A compra do carro está contando duas vezes</p>
                <p className="mt-1">
                  A linha{" "}
                  <strong>{purchaseDuplicated.map((c) => c.description).join(" · ")}</strong> é a
                  própria compra do veículo, que já está no campo &quot;preço de compra&quot;. Por
                  isso o custo total está{" "}
                  {formatCurrency(purchaseDuplicated.reduce((s, c) => s + c.amount, 0))} acima do
                  real.
                </p>
                <Link
                  href="/estoque/corrigir-custo-compra"
                  className="mt-2 inline-block font-medium text-blue-700 hover:underline"
                >
                  Conferir e corrigir →
                </Link>
              </div>
            ) : null}
            <VehicleCosts
              vehicleId={vehicle.id}
              sold={vehicle.status === "VENDIDO"}
              canManage={canCustos}
              canOpenPayable={canOpenPayable}
              beneficiaries={costBeneficiaries}
              attachedBeneficiaryId={vehicle.postSaleCapitalBeneficiaryId}
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
                capitalBeneficiaryName: c.capitalBeneficiaryId
                  ? costCapitalNames.get(c.capitalBeneficiaryId) ?? "sócio"
                  : null,
                duplicateSuspect: duplicateIds.has(c.id),
                // Órfão: custo gerado por solicitação de compra ("Compra NNNN/AAAA…")
                // cuja solicitação/título foram excluídos na raiz (payable sumiu).
                orphan: !c.payable && isCompraCost(c),
                dupAdvice: dupAdvice.get(c.id) ?? null,
                refund: Boolean(c.receivableId),
              }))}
            />
            <VehicleCostRefund
              vehicleId={vehicle.id}
              canManage={canCustos}
              costs={vehicle.costs
                .filter((c) => c.amount > 0 && !c.receivableId)
                .map((c) => ({ id: c.id, description: c.description, amount: c.amount }))}
              refunds={vehicle.costRefunds.map((r) => ({
                id: r.id,
                description: r.description,
                amount: r.amount,
                status: r.status,
                dueDate: r.dueDate.toISOString(),
                receivedDate: r.receivedDate ? r.receivedDate.toISOString() : null,
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
                canManage={canSinal}
                accounts={advanceAccounts.map((a) => ({ id: a.id, name: a.name }))}
                customers={advanceCustomers}
                advances={advances.map((r) => ({
                  id: r.id,
                  amount: r.amount,
                  // Pendente: mostra a data do depósito (dueDate); creditado: a data do crédito.
                  date: r.receivedDate ?? r.dueDate,
                  accountName: r.account?.name ?? null,
                  customerName: r.customer?.name ?? null,
                  status: r.status === "RECEBIDO" ? ("RECEBIDO" as const) : ("PENDENTE" as const),
                  proofAttachmentId: r.proofAttachmentId,
                }))}
                devolvidos={sinaisDevolvidos.map((r) => {
                  const dev = devolucoesSinal.find((p) => p.sinalGroup === r.sinalGroup);
                  return {
                    id: r.id,
                    amount: r.amount,
                    date: r.receivedDate ?? r.dueDate,
                    customerName: r.customer?.name ?? null,
                    devolvido: dev?.amount ?? 0,
                    retido: retidosSinal.find((x) => x.sinalGroup === r.sinalGroup)?.amount ?? 0,
                    devolucaoPaga: dev ? dev.status === "PAGO" : null,
                    sinalPendente: r.status !== "RECEBIDO",
                  };
                })}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Contas a pagar vinculadas"
              description={
                titulosDaVenda.length > 0
                  ? "Compra do veículo, custos lançados e os títulos da venda (transferência, comissões, devolução)"
                  : "Compra do veículo e custos lançados"
              }
            />
            {vehicle.payables.length === 0 && titulosDaVenda.length === 0 ? (
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
                  {titulosDaVenda.map((p) => (
                    <Tr key={p.id}>
                      <Td>
                        {p.description}
                        <span className="ml-2 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                          da venda
                        </span>
                      </Td>
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

          {/* Venda vinculada: cancelada vira card de histórico (discreto e
              claramente marcado) — o veículo voltou ao estoque. */}
          {vehicle.sale ? (
            vehicle.sale.status === "CANCELADA" ? (
              <Card className="opacity-80">
                <CardHeader
                  title="Venda cancelada"
                  description="Fica como histórico — o veículo voltou ao estoque e pode ser vendido normalmente."
                  action={<Badge tone="danger">Cancelada</Badge>}
                />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
                  <InfoItem label="Cliente" value={vehicle.sale.customer.name} />
                  <InfoItem label="Data da venda" value={formatDate(vehicle.sale.saleDate)} />
                  <InfoItem label="Valor total" value={formatCurrency(vehicle.sale.totalAmount)} />
                  <InfoItem label="Vendedor" value={vehicle.sale.sellerName || "-"} />
                </div>
                <div className="px-5 pb-5">
                  <Link href={`/vendas/${vehicle.sale.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                    Ver detalhes da venda cancelada →
                  </Link>
                </div>
              </Card>
            ) : (
              <Card>
                <CardHeader title="Venda registrada" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm sm:grid-cols-3">
                  <InfoItem label="Cliente" value={vehicle.sale.customer.name} />
                  <InfoItem label="Data da venda" value={formatDate(vehicle.sale.saleDate)} />
                  <InfoItem label="Valor total" value={formatCurrency(vehicle.sale.totalAmount)} />
                  <InfoItem label="Vendedor" value={vehicle.sale.sellerName || "-"} />
                </div>

                <div className="px-5 pb-1">
                  <SaleTransferSetting
                    saleId={vehicle.sale.id}
                    initialDone={
                      vehicle.sale.transferDoneAt
                        ? vehicle.sale.transferDoneAt.toISOString().slice(0, 10)
                        : ""
                    }
                    canManage={canTransferencia || canEditar}
                    crlvOwner={crlvDoComprador ? vehicle.docOwnerName : null}
                    crlvDate={
                      crlvDoComprador && ultimoCrlv
                        ? ultimoCrlv.createdAt.toISOString().slice(0, 10)
                        : null
                    }
                  />
                </div>

                {/* Marca manual "em processo de transferência" também no veículo
                    VENDIDO (a transferência pode estar em andamento antes de sair
                    o CRLV novo). Fica aqui, junto do "Marcar como transferido". */}
                <div className="mx-5 mb-3 rounded-lg border border-slate-200">
                  <p className="border-b border-slate-100 px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Processo de transferência (DETRAN)
                  </p>
                  <TransferInProgressSetting
                    vehicleId={vehicle.id}
                    initial={vehicle.transferInProgress}
                    canManage={canTransferencia || canEditar}
                  />
                </div>

                {canLucro && saleResult ? (
                  <div className="mx-5 mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Resultado do veículo
                    </p>

                    <div className="mt-3 flex items-baseline justify-between gap-3">
                      <span className="text-sm text-slate-600">Lucro da venda</span>
                      <span
                        className={`text-sm font-semibold tabular-nums ${
                          saleResult.saleProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {formatCurrency(saleResult.saleProfit)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      venda {formatCurrency(saleResult.saleAmount)} − custo do carro{" "}
                      {formatCurrency(saleResult.totalCost)}
                      {saleResult.saleExpenses > 0
                        ? ` − despesas da venda ${formatCurrency(saleResult.saleExpenses)} (comissão, indicações, transferência)`
                        : ""}
                    </p>

                    {saleResult.returnAmount !== 0 || saleResult.returnCommission !== 0 ? (
                      <>
                        <div className="mt-3 flex items-baseline justify-between gap-3">
                          <span className="text-sm text-slate-600">Retorno da financeira</span>
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              saleResult.returnNetProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {formatCurrency(saleResult.returnNetProfit)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          retorno {formatCurrency(saleResult.returnAmount)}
                          {saleResult.returnCommission > 0
                            ? ` − comissão sobre o retorno ${formatCurrency(saleResult.returnCommission)}`
                            : ""}
                        </p>
                      </>
                    ) : null}

                    {saleResult.insuranceAmount !== 0 ? (
                      <>
                        <div className="mt-3 flex items-baseline justify-between gap-3">
                          <span className="text-sm text-slate-600">Comissão de seguro</span>
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              saleResult.insuranceNetProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {formatCurrency(saleResult.insuranceNetProfit)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">
                          recebido {formatCurrency(saleResult.insuranceAmount)}
                          {saleResult.insuranceCommission > 0
                            ? ` − comissão do vendedor ${formatCurrency(saleResult.insuranceCommission)}`
                            : ""}
                        </p>
                      </>
                    ) : null}

                    <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-3">
                      <span className="text-sm font-medium text-slate-800">
                        {saleResult.netProfit >= 0 ? "Resultado final (lucro)" : "Resultado final (prejuízo)"}
                      </span>
                      <span
                        className={`text-lg font-bold tabular-nums ${
                          saleResult.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {formatCurrency(saleResult.netProfit)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-right text-xs text-slate-400">
                      {saleResult.marginPct.toFixed(1)}% do valor da venda
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-4 px-5 pb-5">
                  <Link href={`/vendas/${vehicle.sale.id}`} className="text-sm font-medium text-slate-900 hover:underline">
                    Ver detalhes da venda →
                  </Link>
                  {canLucro ? (
                    <Link
                      href="/relatorios/lucro-veiculos"
                      className="text-sm font-medium text-blue-700 hover:underline"
                    >
                      Lucro por veículo (relatório) →
                    </Link>
                  ) : null}
                </div>
              </Card>
            )
          ) : null}

          <Card>
            <CardHeader
              title="Fotos do veículo"
              description="Galeria do veículo — envie várias fotos de uma vez"
            />
            <VehiclePhotos
              vehicleId={vehicle.id}
              // Na MESMA ordem da vitrine (mais antiga primeiro): assim a
              // primeira miniatura aqui é a capa do anúncio. Os documentos
              // seguem na ordem da consulta (mais recentes primeiro).
              photos={vehicle.attachments
                .filter((a) => a.kind === "FOTO_VEICULO")
                .slice()
                .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())}
              published={vehicle.published}
              inStock={vehicle.status === "ESTOQUE"}
              visitas={visitas}
              // Quem posta na vitrine também anexa/troca/exclui as fotos.
              canManage={canEditar || canPublicar}
              canPublish={canPublicar}
            />
          </Card>

          <Card>
            <CardHeader
              title="CRLV"
              description="Anexe o CRLV e o sistema lê o documento: RENAVAM, chassi e os dados em branco são preenchidos sozinhos"
            />
            <VehicleCrlv
              vehicleId={vehicle.id}
              canManage={canCrlv}
              crlvs={vehicle.attachments.filter((a) => a.kind === "CRLV")}
            />
          </Card>

          {/* Escrituração eletrônica (Resolução Contran nº 1.026/2026). Veículo
              de terceiro em financiamento não é estoque da loja — ali o aviso é
              outro, na própria tela da operação. */}
          {!vehicle.intermediation && (canNfe || notasFiscais.length > 0) ? (
            <Card className="scroll-mt-4" id="nfe">
              <CardHeader
                title="Nota fiscal (NF-e)"
                description="Emitida pelo sistema e autorizada na SEFAZ. As notas de entrada e de saída autorizadas preenchem as chaves usadas no Renave"
              />
              <VehicleNfe
                vehicleId={vehicle.id}
                ambiente={nfeConfig.ambiente}
                notas={notasFiscais}
                entrada={nfeEntrada}
                recebida={nfeRecebida}
                saida={nfeSaida}
                canEmitir={canNfe}
                canCancelar={canNfeCancelar}
              />
            </Card>
          ) : null}

          {!vehicle.intermediation ? (
            <Card>
              <CardHeader
                title="Renave — escrituração eletrônica"
                description="Dados que o registro de entrada e saída exige. Em implantação: o sistema avisa, mas não bloqueia nada"
              />
              <div className="px-5 pt-4">
                <RenaveJanelaAviso />
              </div>
              <VehicleRenave
                dados={renaveDados}
                documentos={renaveDocumentos}
                pendencias={renavePendencias}
                prazo={renavePrazo.toISOString()}
                diasAtpv={renaveDiasAtpv}
                renaveOperando={detranOperando(renaveCompany.detranRenaveStatus)}
                uf={renaveCompany.uf}
                canEdit={canRenave}
              />
              {renaveWs && (canRenaveWs || renaveWs.registro) ? (
                <RenaveWsPanel vehicleId={vehicle.id} podeOperar={canRenaveWs} {...renaveWs} />
              ) : null}
              <RenaveCopyData entrada={renaveCopiaEntrada} saida={renaveCopiaSaida} />
            </Card>
          ) : null}

          {/* Veículo vendido mostra a marca "em processo" dentro do card da venda
              (junto do "Marcar como transferido"); aqui é só para os em estoque. */}
          {vehicle.status !== "VENDIDO" ? (
            <Card>
              <CardHeader
                title="Processo de transferência (DETRAN)"
                description="Marque manualmente quando a transferência já foi paga/iniciada fora do sistema (casos antigos)"
              />
              <TransferInProgressSetting
                vehicleId={vehicle.id}
                initial={vehicle.transferInProgress}
                canManage={canTransferencia || canEditar}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Orçamento de transferência (despachante)"
              description="Anexe o orçamento/recibo do despachante: a IA lê e lança o título da transferência no Contas a pagar"
            />
            <VehicleTransferQuote
              vehicleId={vehicle.id}
              canManage={canOrcamento}
              transferToName={vehicle.transferToName}
              quotes={vehicle.attachments.filter(
                (a) => a.kind === "DOCUMENTO" && /^or[çc]amento de transfer/i.test(a.description),
              )}
            />
          </Card>

          <Card>
            <CardHeader
              title="ATPV-e"
              description="Anexe a Autorização para Transferência de Propriedade do Veículo (ATPV-e)"
            />
            <VehicleAtpv
              vehicleId={vehicle.id}
              canManage={canAtpv}
              atpvs={atpvDocs.map((a) => ({
                id: a.id,
                description: a.description,
                filename: a.filename,
                size: a.size,
                createdAt: a.createdAt,
                fase: faseAtpvDe(a.id),
                faseGravada: !!faseDaDescricao(a.description),
                numero: numeroDaDescricao(a.description),
                lida: !!a.atpvLido,
              }))}
            />
          </Card>

          <Card>
            <CardHeader
              title="Boletos e guias (IPVA, multas, quitação)"
              description="Anexe o boleto e o sistema lê valor e vencimento, casando com os descontos da negociação — a diferença segue a regra de desconto/acréscimo"
            />
            <VehicleBoletos
              vehicleId={vehicle.id}
              canManage={canBoletos}
              boletos={vehicle.attachments.filter(
                (a) => a.kind === "DOCUMENTO" && /^boleto/i.test(a.description),
              )}
              // Saldo do título "Débitos do veículo (repasse)" ainda não
              // identificado por guias — habilita o "Encerrar débitos".
              saldoDebitos={
                vehicle.payables.find(
                  (p) =>
                    p.status !== "PAGO" &&
                    p.category === "COMPRA_VEICULO" &&
                    p.description.startsWith("Débitos do veículo (repasse)"),
                )?.amount ?? null
              }
              // Títulos gerados por boletos (débitos e quitação) — para mostrar,
              // ao lado de cada boleto, se ele já foi PAGO (casa por valor).
              debitoTitulos={vehicle.payables
                .filter(
                  (p) =>
                    p.category === "COMPRA_VEICULO" &&
                    (p.description.startsWith("Débitos do veículo") ||
                      p.description.startsWith("Quitação do financiamento")),
                )
                .map((p) => ({
                  amount: p.amount,
                  paid: effectivePayableStatus(p.status, p.dueDate) === "PAGO",
                }))}
            />
          </Card>

          <Card className="scroll-mt-4" id="comunicacao">
            <CardHeader
              title="Documentos do veículo"
              description="Anexe a Comunicação de venda (Detran) e outros documentos deste veículo"
            />
            {canEditar ? <DocumentosCompra vehicleId={vehicle.id} /> : null}
            {comunicacaoCampos && canComunicacao ? (
              <ComunicacaoVendaCopy
                campos={comunicacaoCampos}
                enviada={comunicacaoEnviada}
                temAtpv={temAtpv}
                atpvParaLer={atpvSemLeitura}
                podeLerAtpv={canAtpv}
              />
            ) : null}
            <VehicleAttachments
              vehicleId={vehicle.id}
              canManage={canComunicacao}
              attachments={vehicle.attachments.filter(
                (a) =>
                  a.kind !== "FOTO_VEICULO" &&
                  a.kind !== "CRLV" &&
                  // ATPV-e, boletos e orçamento de transferência têm cards
                  // próprios acima — não duplica aqui.
                  !(a.kind === "DOCUMENTO" && /atpv/i.test(a.description)) &&
                  !(a.kind === "DOCUMENTO" && /^boleto/i.test(a.description)) &&
                  !(a.kind === "DOCUMENTO" && /^or[çc]amento de transfer/i.test(a.description)),
              )}
            />
          </Card>

          {canEditar || canFoto ? (
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

          {vehicle.status !== "VENDIDO" && canSituacao ? (
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
