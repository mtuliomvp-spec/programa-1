/**
 * As linhas vermelhas do painel patrimonial e o filtro que abre exatamente os
 * títulos que somam cada uma delas.
 *
 * Cada balde repete, palavra por palavra, a regra que `src/lib/patrimonial.ts`
 * usa para compor o valor — é isso que garante que o total do filtro bata com o
 * número do card. Mexeu lá, mexa aqui (e vice-versa).
 */

export const PAINEL_BUCKETS = [
  "pecas",
  "vendidos",
  "devolucao-cliente",
  "devolucao-proprietario",
  "comissoes",
] as const;

export type PainelBucket = (typeof PAINEL_BUCKETS)[number];

export function painelBucketOf(valor: string | null | undefined): PainelBucket | null {
  const v = (valor || "").trim();
  // `vendidos=1` foi o primeiro filtro desses e continua valendo como apelido.
  if (v === "1") return "vendidos";
  return (PAINEL_BUCKETS as readonly string[]).includes(v) ? (v as PainelBucket) : null;
}

/** Como o filtro se explica na tela: o que está sendo mostrado e de onde veio. */
export const painelBucketTexto: Record<PainelBucket, { linha: string; mostra: string }> = {
  pecas: {
    linha: "Comprado a pagar",
    mostra: "as peças compradas e ainda não pagas",
  },
  vendidos: {
    linha: "A pagar de veículos vendidos",
    mostra: "os títulos em aberto de veículos já vendidos",
  },
  "devolucao-cliente": {
    linha: "Devolução ao cliente (a pagar)",
    mostra: "as devoluções ao cliente ainda não pagas",
  },
  "devolucao-proprietario": {
    linha: "Devolução ao proprietário (a pagar)",
    mostra: "as devoluções ao proprietário do consignado ainda não pagas",
  },
  comissoes: {
    linha: "Comissões e custos das vendas (a pagar)",
    mostra: "as comissões e os custos gerados por vendas já feitas, ainda em aberto",
  },
};

/** O mínimo que um título precisa expor para ser classificado. */
export type PayableParaBucket = {
  effective: string;
  category: string;
  vehicleId: string | null;
  partId?: string | null;
  saleId: string | null;
  vehicle?: { status: string } | null;
  vehicleCost?: { postSale: boolean } | null;
};

export function matchesPainelBucket(bucket: PainelBucket, p: PayableParaBucket): boolean {
  // Nenhuma linha vermelha do painel conta título já pago.
  if (p.effective === "PAGO") return false;
  switch (bucket) {
    // Peça comprada a prazo que está no almoxarifado: sem veículo (aí seria
    // custo do carro) e vinda do módulo Peças (partId) — título avulso com a
    // categoria "Compra de peças" não entra, como no patrimonial.
    case "pecas":
      return p.category === "COMPRA_PECA" && !p.vehicleId && Boolean(p.partId);
    // Dívida de compra do carro já vendido + custo pré-venda ainda pendente.
    case "vendidos":
      return (
        p.vehicle?.status === "VENDIDO" &&
        (p.category === "COMPRA_VEICULO" || p.vehicleCost?.postSale === false)
      );
    case "devolucao-cliente":
      return p.category === "DEVOLUCAO_CLIENTE";
    case "devolucao-proprietario":
      return p.category === "DEVOLUCAO_PROPRIETARIO";
    // O que manda é o vínculo com a venda, não a categoria — devoluções e a
    // compra do veículo têm baldes próprios e ficam de fora.
    case "comissoes":
      return (
        Boolean(p.saleId) &&
        p.category !== "DEVOLUCAO_CLIENTE" &&
        p.category !== "DEVOLUCAO_PROPRIETARIO" &&
        p.category !== "COMPRA_VEICULO"
      );
  }
}
