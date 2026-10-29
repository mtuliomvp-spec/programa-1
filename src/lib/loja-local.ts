/**
 * Endereço e links de mapa da LOJA (Parâmetros › Empresa), num lugar só — a
 * vitrine, o rodapé, a página de login e os dados que o Google lê usam isto.
 *
 * Dois cuidados:
 *  - a cidade às vezes foi cadastrada já com o estado ("São Luís - MA"): o UF
 *    não pode sair repetido ("São Luís - MA - MA");
 *  - pesquisar SÓ o endereço no mapa leva ao vizinho que aparece primeiro
 *    naquele ponto (era a Advel Veículos). A busca leva o NOME da loja junto,
 *    e o link do Perfil da Empresa no Google Maps, quando cadastrado, é usado
 *    direto — é o que abre exatamente a MVP.
 */

type Loja = {
  nomeFantasia?: string | null;
  address?: string | null;
  city?: string | null;
  uf?: string | null;
  googleMapsUrl?: string | null;
};

/** "São Luís - MA" (com uf MA) → "São Luís". */
export function cidadeDaLoja(c: Loja | null | undefined): string | null {
  const cidade = (c?.city || "").trim();
  if (!cidade) return null;
  const uf = (c?.uf || "").trim();
  if (!uf) return cidade;
  return cidade.replace(new RegExp(`\\s*[-–/,]\\s*${uf}$`, "i"), "").trim() || cidade;
}

/** "São Luís - MA" — a cidade com o estado uma vez só. */
export function cidadeUfDaLoja(c: Loja | null | undefined, sep = " - "): string | null {
  const cidade = cidadeDaLoja(c);
  if (!cidade) return null;
  return c?.uf ? `${cidade}${sep}${c.uf.trim().toUpperCase()}` : cidade;
}

/** Endereço completo para mostrar: "Rua…, São Luís - MA". */
export function enderecoDaLoja(c: Loja | null | undefined): string {
  return [c?.address?.trim() || null, cidadeUfDaLoja(c)].filter(Boolean).join(", ");
}

/** Links de navegação (Google Maps, Waze, Apple Maps) para a loja. */
export function linksDeMapaDaLoja(c: Loja | null | undefined): { google: string; waze: string; apple: string } | null {
  const endereco = enderecoDaLoja(c);
  if (!endereco) return null;
  const nome = (c?.nomeFantasia || "").trim();
  const busca = encodeURIComponent(nome ? `${nome}, ${endereco}` : endereco);
  const link = (c?.googleMapsUrl || "").trim();
  return {
    google: /^https:\/\//i.test(link) ? link : `https://www.google.com/maps/search/?api=1&query=${busca}`,
    waze: `https://waze.com/ul?q=${busca}&navigate=yes`,
    apple: `https://maps.apple.com/?q=${busca}`,
  };
}
