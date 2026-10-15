/**
 * Formatos do formulário de comunicação de venda da R30 (SICOVE), como ele
 * aceita: CPF/CNPJ com pontuação, telefone "(98)31817517", valor "64.000,00",
 * UF "MA - MARANHÃO" e município em maiúsculas sem acento ("SAO LUIS").
 * Puro: usado na ficha do veículo para montar o quadro de cópia.
 */

const NOME_UF: Record<string, string> = {
  AC: "ACRE", AL: "ALAGOAS", AP: "AMAPÁ", AM: "AMAZONAS", BA: "BAHIA", CE: "CEARÁ",
  DF: "DISTRITO FEDERAL", ES: "ESPÍRITO SANTO", GO: "GOIÁS", MA: "MARANHÃO", MT: "MATO GROSSO",
  MS: "MATO GROSSO DO SUL", MG: "MINAS GERAIS", PA: "PARÁ", PB: "PARAÍBA", PR: "PARANÁ",
  PE: "PERNAMBUCO", PI: "PIAUÍ", RJ: "RIO DE JANEIRO", RN: "RIO GRANDE DO NORTE",
  RS: "RIO GRANDE DO SUL", RO: "RONDÔNIA", RR: "RORAIMA", SC: "SANTA CATARINA", SP: "SÃO PAULO",
  SE: "SERGIPE", TO: "TOCANTINS",
};

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** "41.664.258/0001-70" / "025.238.573-08"; incompleto → null. */
export function documentoR30(doc: string | null | undefined): string | null {
  const d = dig(doc);
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return null;
}

/** "Física" ou "Jurídica" pelo tamanho do documento. */
export function tipoPessoaR30(doc: string | null | undefined): string | null {
  const d = dig(doc);
  return d.length === 14 ? "Jurídica" : d.length === 11 ? "Física" : null;
}

/** "(98)31817517" — DDD entre parênteses, sem espaço; sem DDD → null. */
export function telefoneR30(tel: string | null | undefined): string | null {
  let d = dig(tel);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d.length === 10 || d.length === 11 ? `(${d.slice(0, 2)})${d.slice(2)}` : null;
}

/** "64.000,00". */
export function valorR30(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "MA - MARANHÃO". */
export function ufR30(uf: string | null | undefined): string | null {
  const u = (uf ?? "").trim().toUpperCase();
  return NOME_UF[u] ? `${u} - ${NOME_UF[u]}` : null;
}

/** "SAO LUIS" — maiúsculas, sem acento. */
export function municipioR30(cidade: string | null | undefined): string | null {
  const c = (cidade ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  return c || null;
}

/** "65.075-180". */
export function cepR30(cep: string | null | undefined): string | null {
  const d = dig(cep);
  return d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : null;
}

/** Maiúsculas mantendo acento ("JARDIM RENASCENÇA"), como o próprio site preenche pelo CEP. */
export function maiusculasR30(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim().toUpperCase();
  return t || null;
}
