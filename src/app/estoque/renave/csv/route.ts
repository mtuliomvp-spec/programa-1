import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { pendenciasRenave, situacaoLabel, tituloLabel, previaLabel, assinaturaLabel } from "@/lib/renave";

/**
 * Livro de entradas e saídas em CSV — o formato que o contador e a fiscalização
 * conseguem abrir (art. 5º, V, da Resolução Contran nº 1.026/2026). Uma linha
 * por veículo, com os dados que o registro no Renave exige.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !can(user, "estoque", "visualizar")) {
    return new Response("Acesso negado", { status: 403 });
  }

  const url = new URL(request.url);
  const hoje = new Date();
  const de = url.searchParams.get("de") || new Date(hoje.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const ate = url.searchParams.get("ate") || hoje.toISOString().slice(0, 10);

  const vehicles = await prisma.vehicle.findMany({
    where: {
      intermediation: false,
      entryDate: { gte: new Date(`${de}T00:00:00`), lte: new Date(`${ate}T23:59:59`) },
    },
    orderBy: { entryDate: "asc" },
    include: {
      supplier: { select: { name: true, document: true } },
      sale: {
        select: { saleDate: true, totalAmount: true, customer: { select: { name: true, document: true } } },
      },
    },
  });

  const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
  const dinheiro = (v: number) => v.toFixed(2).replace(".", ",");
  // Ponto e vírgula + aspas: é assim que o Excel em português abre sem bagunçar.
  const campo = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const cabecalho = [
    "Placa",
    "Chassi",
    "RENAVAM",
    "Marca",
    "Modelo",
    "Ano fab./modelo",
    "Data de entrada",
    "Título da entrada",
    "Valor de entrada",
    "Vendedor/consignante",
    "CPF/CNPJ do vendedor",
    "NF-e entrada (nº/série)",
    "Chave da NF-e de entrada",
    "Identificação prévia",
    "Nº da identificação prévia",
    "Assinatura do vendedor",
    "Data da assinatura",
    "Protocolo de entrada no Renave",
    "Data do registro de entrada",
    "Contrato de consignação",
    "Data do contrato de consignação",
    "CRV",
    "Data de saída",
    "Título da saída",
    "Valor de saída",
    "Comprador",
    "CPF/CNPJ do comprador",
    "NF-e saída (nº/série)",
    "Chave da NF-e de saída",
    "Protocolo de saída no Renave",
    "Data do registro de saída",
    "Situação no Renave",
    "Dados faltando",
  ];

  const linhas = vehicles.map((v) =>
    [
      v.plate,
      v.chassi,
      v.renavam,
      v.brand,
      v.model,
      `${v.manufactureYear}/${v.modelYear}`,
      dia(v.entryDate),
      v.renaveEntradaTitulo ? tituloLabel[v.renaveEntradaTitulo] : "",
      dinheiro(v.purchasePrice),
      v.supplier?.name,
      v.supplier?.document,
      v.entryNfeNumber ? `${v.entryNfeNumber}/${v.entryNfeSerie ?? ""}` : "",
      v.entryNfeKey,
      v.renavePreviaTipo ? previaLabel[v.renavePreviaTipo] : "",
      v.renavePreviaNumero,
      v.renaveAssinaturaTipo ? assinaturaLabel[v.renaveAssinaturaTipo] : "",
      dia(v.renaveAssinaturaEm),
      v.renaveEntradaProtocolo,
      dia(v.renaveEntradaEm),
      v.consignContractId,
      dia(v.consignContractAt),
      v.crvNumber,
      v.sale ? dia(v.sale.saleDate) : "",
      v.renaveSaidaTitulo ? tituloLabel[v.renaveSaidaTitulo] : "",
      v.sale ? dinheiro(v.sale.totalAmount) : "",
      v.sale?.customer.name,
      v.sale?.customer.document,
      v.exitNfeNumber ? `${v.exitNfeNumber}/${v.exitNfeSerie ?? ""}` : "",
      v.exitNfeKey,
      v.renaveSaidaProtocolo,
      dia(v.renaveSaidaEm),
      situacaoLabel[v.renaveSituacao],
      pendenciasRenave(v)
        .map((p) => `${p.texto} (${p.base})`)
        .join(" | "),
    ]
      .map(campo)
      .join(";"),
  );

  // BOM na frente: sem ele o Excel abre os acentos errados.
  const csv = "﻿" + [cabecalho.map(campo).join(";"), ...linhas].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="renave-${de}-a-${ate}.csv"`,
      "cache-control": "no-store",
    },
  });
}
