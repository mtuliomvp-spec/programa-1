// Títulos da PMZ Distribuidora SA a lançar em Contas a pagar (implantação).
// doc = nº do documento (NF); date = vencimento (yyyy-mm-dd); plate = placa do
// veículo (vazio = sem veículo); amount em reais.
export const PMZ_SUPPLIER_NAME = "PMZ Distribuidora SA";

export type PmzRow = { doc: string; date: string; plate: string; description: string; amount: number };

export const PMZ_ROWS: PmzRow[] = [
  { doc: "93536", date: "2026-07-30", plate: "PTE1B39", description: "Aditivo", amount: 32.95 },
  { doc: "93532", date: "2026-07-30", plate: "PTE1B39", description: "Óleo, filtro e correia dentada", amount: 354.5 },
  { doc: "93952", date: "2026-08-05", plate: "ROG7J52", description: "Par lanterna traseira", amount: 496.0 },
  { doc: "94107", date: "2026-08-07", plate: "ROG7J52", description: "Kit correia dentada, óleo e filtro", amount: 870.0 },
  { doc: "94162", date: "2026-08-08", plate: "", description: "Pivô e terminal de direção", amount: 138.65 },
  { doc: "94249", date: "2026-08-09", plate: "PSR5F55", description: "Suspensão, óleo e filtro", amount: 850.4 },
  { doc: "94343", date: "2026-08-12", plate: "RON7H54", description: "Óleo e filtro", amount: 198.1 },
  { doc: "94819", date: "2026-08-20", plate: "PSK4673", description: "Aditivo, óleo e filtro", amount: 157.95 },
  { doc: "94790-01/0", date: "2026-08-20", plate: "PSK4673", description: "Suspensão (parc. 01/02)", amount: 334.69 },
  { doc: "94950", date: "2026-08-22", plate: "PSK4673", description: "02 pneus", amount: 1072.7 },
  { doc: "94994", date: "2026-08-23", plate: "TCP0F63", description: "Óleo e filtro", amount: 260.9 },
  { doc: "95153", date: "2026-08-26", plate: "OXT7G56", description: "Suporte coxim câmbio", amount: 316.85 },
  { doc: "95124", date: "2026-08-26", plate: "OXT7G56", description: "Óleo, filtro e loctite", amount: 329.35 },
  { doc: "94790-02/0", date: "2026-09-19", plate: "PSK4673", description: "Suspensão (parc. 02/02)", amount: 334.69 },
];

export const normalizePlate = (p: string) => p.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
