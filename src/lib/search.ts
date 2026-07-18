/**
 * Busca textual das listagens: o usuário digita termos livres (?q=) e a página
 * filtra as linhas já carregadas comparando com os campos EXIBIDOS. Cada termo
 * digitado precisa aparecer em algum campo (E entre termos, OU entre campos);
 * acentos e maiúsculas são ignorados ("jose" acha "José").
 */

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function matchesSearch(
  q: string | undefined,
  ...fields: (string | number | null | undefined)[]
): boolean {
  const query = (q || "").trim();
  if (!query) return true;
  const haystack = normalizeSearch(
    fields
      .filter((f) => f !== null && f !== undefined && f !== "")
      .map(String)
      .join(" "),
  );
  return normalizeSearch(query)
    .split(/\s+/)
    .every((term) => haystack.includes(term));
}
