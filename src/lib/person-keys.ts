/**
 * Identidade de pessoa (fornecedor ou cliente) para evitar e desfazer cadastros
 * duplicados. Só as chaves e o agrupamento — puro, sem banco, para poder ser
 * usado também pelos componentes de tela (ex.: SupplierInput).
 *
 * O cadastro ficou cheio de repetições porque cada caminho conferia uma coisa
 * diferente: `resolveSupplierByName` comparava o nome exato (sensível a acento e
 * pontuação), os cadastros rápidos conferiam só o documento e o formulário
 * completo não conferia nada. Aqui existe UMA regra, usada por todos.
 *
 * Duas pessoas são a mesma quando têm o mesmo `nameKey` OU o mesmo `docKey`.
 */

/**
 * Chave do nome: sem acento, sem maiúscula, sem pontuação e sem espaço.
 *
 * É a remoção do espaço que faz "PMZ Distribuidora SA" casar com
 * "Pmz Distribuidora S.a" e "Posto FH" com "Posto  FH". Em teoria isso também
 * casaria "Ana Lima" com "Analima"; na prática não junta nomes diferentes, e o
 * ganho nos casos reais compensa.
 */
export function nameKey(name: string | null | undefined): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Chave do documento: só dígitos. Vazio vira null (não identifica ninguém). */
export function docKey(doc: string | null | undefined): string | null {
  const digits = (doc || "").replace(/\D/g, "");
  return digits.length >= 11 ? digits : null;
}

export type DedupeRow = { id: string; name: string; document: string | null };

/**
 * Agrupa os cadastros equivalentes. A ligação é transitiva: se A e B têm o
 * mesmo documento e B e C têm o mesmo nome, os três caem no mesmo grupo.
 * Devolve só os grupos com 2 ou mais, na ordem em que aparecem na entrada.
 */
export function groupDuplicates<T extends DedupeRow>(rows: T[]): T[][] {
  // União-busca simples: cada chave (nome ou documento) puxa para um mesmo grupo.
  const parent = new Map<number, number>();
  const find = (i: number): number => {
    let root = i;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const byKey = new Map<string, number>();
  rows.forEach((row, i) => {
    parent.set(i, i);
    const keys: string[] = [];
    const nk = nameKey(row.name);
    if (nk) keys.push(`n:${nk}`);
    const dk = docKey(row.document);
    if (dk) keys.push(`d:${dk}`);
    for (const key of keys) {
      const first = byKey.get(key);
      if (first === undefined) byKey.set(key, i);
      else union(first, i);
    }
  });

  const groups = new Map<number, T[]>();
  rows.forEach((row, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(row);
    else groups.set(root, [row]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Quantos duplicados existem hoje (para o aviso no cabeçalho das listagens). */
export function countDuplicated(rows: DedupeRow[]): number {
  return groupDuplicates(rows).reduce((sum, g) => sum + g.length, 0);
}

/**
 * Melhor grafia entre as variantes do mesmo nome. Prefere, nesta ordem: a que
 * tem acento, a que escreve siglas em maiúscula, a que tem mais iniciais
 * maiúsculas e a mais longa. É o que transforma "Rogerio venturini" em
 * "Rogério Venturini" e "Pmz Distribuidora S.a" em "PMZ Distribuidora SA".
 */
export function bestNameVariant(names: string[]): string {
  const score = (n: string) => {
    const words = n.split(/\s+/).filter(Boolean);
    const accents = (n.normalize("NFD").match(/[\u0300-\u036f]/g) || []).length;
    const capitals = words.filter((w) => w[0] === w[0].toUpperCase()).length;
    // Palavra curta toda em maiúscula é sigla (PMZ, SA); longa é grito.
    const acronyms = words.reduce((sum, w) => {
      if (!/^[A-Z\u00c0-\u00dd]+$/.test(w)) return sum;
      return sum + (w.length <= 3 ? 3 : -3);
    }, 0);
    return accents * 100 + acronyms * 10 + capitals * 5 + Math.min(n.length, 9);
  };
  return [...names].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0] ?? "";
}

/**
 * Motivo para NÃO unificar um grupo automaticamente.
 *
 * - `MULTIPLOS_USUARIOS`: dois ou mais cadastros são espelhos de usuários do
 *   sistema. O espelho é recriado a cada acesso a /fornecedores, então excluir
 *   um deles não resolve — tem de ser resolvido em Usuários.
 * - `DOCUMENTOS_DIFERENTES`: mesmo nome, CPF/CNPJ diferentes. Quase sempre são
 *   duas pessoas distintas (dois "José Silva"); unificar perderia dado.
 */
export type BlockReason = "MULTIPLOS_USUARIOS" | "DOCUMENTOS_DIFERENTES" | null;

export type ScoredRow = DedupeRow & {
  isMirror: boolean;
  /** Quantos campos opcionais estão preenchidos (mais completo vence). */
  filled: number;
  createdAt: Date;
  /** Quantos lançamentos apontam para este cadastro. */
  moved: number;
};

export function blockReason(members: ScoredRow[]): BlockReason {
  if (members.filter((m) => m.isMirror).length > 1) return "MULTIPLOS_USUARIOS";
  const docs = new Set(members.map((m) => docKey(m.document)).filter(Boolean));
  if (docs.size > 1) return "DOCUMENTOS_DIFERENTES";
  return null;
}

/**
 * Qual cadastro sobrevive. O espelho de usuário sempre vence: ele não pode ser
 * excluído (volta no próximo acesso) nem ter os dados alterados (o sync
 * sobrescreve a partir de Usuários). Depois vale o mais completo, o que tem
 * mais lançamentos e o mais antigo — nessa ordem, para ser sempre o mesmo
 * resultado entre a prévia da tela e a execução no servidor.
 */
export function pickWinner<T extends ScoredRow>(members: T[]): T {
  return [...members].sort(
    (a, b) =>
      Number(b.isMirror) - Number(a.isMirror) ||
      Number(Boolean(docKey(b.document))) - Number(Boolean(docKey(a.document))) ||
      b.filled - a.filled ||
      b.moved - a.moved ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  )[0];
}

