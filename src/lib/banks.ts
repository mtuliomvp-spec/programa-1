/**
 * Bancos e instituições do Sistema Financeiro Nacional mais usados, incluindo
 * as financeiras de veículos (para quitação de financiamento). Serve como
 * sugestão nos campos de banco — o usuário pode escolher ou digitar outro.
 */
export const BANKS: string[] = [
  // Grandes bancos
  "Banco do Brasil",
  "Caixa Econômica Federal",
  "Bradesco",
  "Itaú Unibanco",
  "Santander",
  "Banco Safra",
  "BTG Pactual",
  "Citibank",
  "Banco Votorantim (BV)",
  "Banrisul",
  "BRB - Banco de Brasília",
  "Banco do Nordeste",
  "Banco da Amazônia",
  "Banco Mercantil do Brasil",
  "Banestes",
  // Cooperativas
  "Sicoob",
  "Sicredi",
  "Unicred",
  "Cresol",
  "Ailos",
  // Digitais / fintechs
  "Nubank",
  "Banco Inter",
  "C6 Bank",
  "Banco Original",
  "Neon",
  "Agibank",
  "Banco Bari",
  "Will Bank",
  "PagBank (PagSeguro)",
  "Mercado Pago",
  "Banco Digio",
  "Banco Next",
  "Banco Modal",
  "Banco Rendimento",
  // Crédito / consignado / veículos
  "Banco Pan",
  "Banco BMG",
  "Banco Daycoval",
  "Banco Sofisa",
  "Banco Topázio",
  "Banco Semear",
  "Omni Banco",
  "Creditas",
  "Portoseg (Porto Seguro)",
  // Financeiras de veículos
  "Aymoré (Santander Financiamentos)",
  "BV Financeira",
  "Bradesco Financiamentos",
  "Itaú Financiamentos",
  "Banco Pan Financiamentos",
  "Omni Financeira",
  "RCI Brasil (Renault/Nissan)",
  "Banco Volkswagen",
  "Banco Toyota do Brasil",
  "Banco GMAC (Chevrolet)",
  "Banco Honda",
  "Banco Fidis (Fiat/Stellantis)",
  "Banco PSA (Peugeot/Citroën)",
  "Banco Mercedes-Benz",
  "Banco CNH Industrial",
  "Banco Yamaha Motor",
  "Consórcio Nacional Honda",
  // Consórcios/administradoras comuns
  "Rodobens Consórcio",
  "Embracon Consórcio",
  "Porto Seguro Consórcio",
  "Bradesco Consórcio",
  "Itaú Consórcio",
  "Santander Consórcio",
  "Caixa Consórcio",
  "Magalu Consórcio",
];

/** Códigos COMPE dos bancos mais comuns → nome da lista acima. */
const CODIGOS: Record<string, string> = {
  "001": "Banco do Brasil",
  "104": "Caixa Econômica Federal",
  "237": "Bradesco",
  "341": "Itaú Unibanco",
  "033": "Santander",
  "422": "Banco Safra",
  "208": "BTG Pactual",
  "745": "Citibank",
  "655": "Banco Votorantim (BV)",
  "041": "Banrisul",
  "070": "BRB - Banco de Brasília",
  "004": "Banco do Nordeste",
  "003": "Banco da Amazônia",
  "389": "Banco Mercantil do Brasil",
  "021": "Banestes",
  "756": "Sicoob",
  "748": "Sicredi",
  "136": "Unicred",
  "133": "Cresol",
  "085": "Ailos",
  "260": "Nubank",
  "077": "Banco Inter",
  "336": "C6 Bank",
  "212": "Banco Original",
  "121": "Agibank",
  "290": "PagBank (PagSeguro)",
  "323": "Mercado Pago",
  "335": "Banco Digio",
  "623": "Banco Pan",
  "318": "Banco BMG",
  "707": "Banco Daycoval",
};

/**
 * Banco como ficou gravado num cadastro: quem digitou só o código ("001",
 * "1", "341") vê o nome junto — "Banco do Brasil (001)". Texto já com nome
 * fica como está.
 */
export function nomeDoBanco(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!/^\d{1,3}$/.test(v)) return v;
  const cod = v.padStart(3, "0");
  return CODIGOS[cod] ? `${CODIGOS[cod]} (${cod})` : v;
}
