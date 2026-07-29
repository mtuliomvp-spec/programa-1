import { formatCurrency } from "@/lib/format";

/**
 * Cronograma de um contrato de locação (lado LOCATÁRIO = contas a pagar).
 * Função PURA (sem acesso a banco) — usada tanto no preview (cliente) quanto na
 * geração dos títulos (servidor), garantindo que o que se vê é o que se lança.
 */

export type RentContractParams = {
  valorAluguel: number;
  descontoMensal: number;
  mesesDesconto: number;
  totalMeses: number;
  mesesCarencia: number;
  primeiroVencimento: string; // yyyy-mm-dd
  diaVencimento: number;
  caucaoValor: number;
  caucaoData: string; // yyyy-mm-dd
};

export type RentLine = {
  index: number;
  competencia: string; // MM/AAAA (mês do vencimento)
  dueDate: string; // yyyy-mm-dd
  tipo: "DESCONTO" | "INTEGRAL" | "CARENCIA";
  valorCheio: number;
  desconto: number;
  valorPagar: number;
  naoPago: number;
  observacao: string;
};

export type RentSchedule = {
  caucao: { date: string; amount: number } | null;
  parcelas: RentLine[];
  totais: { aPagarParcelas: number; naoPago: number; caucao: number; totalGeral: number };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function addMonthsYM(y: number, m: number, add: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + add;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

export function buildRentSchedule(p: RentContractParams): RentSchedule {
  const [y0, m0] = (p.primeiroVencimento || "").split("-").map(Number);
  const dia = Math.min(Math.max(1, p.diaVencimento || 10), 28);
  const parcelas: RentLine[] = [];

  const total = Math.max(0, Math.floor(p.totalMeses || 0));
  const comDesconto = Math.max(0, Math.floor(p.mesesDesconto || 0));
  const carencia = Math.max(0, Math.floor(p.mesesCarencia || 0));

  for (let i = 0; i < total; i++) {
    const { y, m } = addMonthsYM(y0 || new Date().getFullYear(), m0 || 1, i);
    const competencia = `${String(m).padStart(2, "0")}/${y}`;
    const dueDate = `${y}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

    let tipo: RentLine["tipo"] = "INTEGRAL";
    let desconto = 0;
    let valorPagar = round2(p.valorAluguel);
    let observacao = "Aluguel integral.";

    if (i < comDesconto) {
      tipo = "DESCONTO";
      desconto = round2(p.descontoMensal);
      valorPagar = round2(p.valorAluguel - p.descontoMensal);
      observacao = `Aluguel integral ${formatCurrency(p.valorAluguel)} − desconto ${formatCurrency(
        p.descontoMensal,
      )} (Cl. 3ª §3º). Pago ${formatCurrency(valorPagar)}.`;
    } else if (i >= total - carencia) {
      tipo = "CARENCIA";
      valorPagar = 0;
      observacao = `Isento — carência (Cl. 3ª §8º). Valor cheio ${formatCurrency(
        p.valorAluguel,
      )} não devido.`;
    }

    parcelas.push({
      index: i,
      competencia,
      dueDate,
      tipo,
      valorCheio: round2(p.valorAluguel),
      desconto,
      valorPagar,
      naoPago: round2(p.valorAluguel - valorPagar),
      observacao,
    });
  }

  const aPagarParcelas = round2(parcelas.reduce((s, l) => s + l.valorPagar, 0));
  const naoPago = round2(parcelas.reduce((s, l) => s + l.naoPago, 0));
  const caucaoValor = round2(p.caucaoValor || 0);

  return {
    caucao: caucaoValor > 0 ? { date: p.caucaoData, amount: caucaoValor } : null,
    parcelas,
    totais: {
      aPagarParcelas,
      naoPago,
      caucao: caucaoValor,
      totalGeral: round2(aPagarParcelas + caucaoValor),
    },
  };
}
