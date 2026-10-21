import "server-only";
import { prisma } from "@/lib/prisma";
import { Disfarce, REGRAS, ehInstituicao, type Dicionario } from "./disfarce";
import { modeloBackup } from "./esquema";

/**
 * Os nomes e documentos REAIS que o disfarce procura dentro dos textos livres
 * (descrição de título, mensagem da SEFAZ…). Sai do próprio banco, a cada
 * backup — é a produção que gera o arquivo disfarçado, e o real nunca sai dela.
 */
async function montarDicionario(): Promise<Dicionario> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;
  const nomes = new Set<string>();
  const numeros = new Set<string>();

  for (const [modelo, regras] of Object.entries(REGRAS)) {
    const info = modeloBackup(modelo);
    if (!info) continue;
    for (const [campo, regra] of Object.entries(regras)) {
      const alvo = regra === "pessoa" || regra === "fornecedor" ? "nome" : regra === "doc" ? "doc" : null;
      const renavam = campo === "renavam";
      if (!alvo && !renavam) continue;
      const c = info.campos.find((x) => x.nome === campo);
      if (!c || c.tipo !== "String") continue;
      const linhas: Record<string, string | null>[] = await db[info.delegate].findMany({
        distinct: [campo],
        select: { [campo]: true },
        ...(c.obrigatorio ? {} : { where: { [campo]: { not: null } } }),
      });
      for (const l of linhas) {
        const v = (l[campo] || "").trim();
        if (!v) continue;
        if (alvo === "nome") {
          if (v.includes("@")) continue;
          // Fornecedor-instituição (Detran, banco) não é disfarçado.
          if (regra === "fornecedor" && ehInstituicao(v)) continue;
          nomes.add(v);
        } else {
          numeros.add(v.replace(/\D/g, ""));
        }
      }
    }
  }

  const empresa = await prisma.companySettings.findFirst({
    select: { razaoSocial: true, nomeFantasia: true, cnpj: true },
  });
  const loja = [empresa?.razaoSocial, empresa?.nomeFantasia].filter((s): s is string => Boolean(s?.trim()));
  if (empresa?.cnpj) numeros.add(empresa.cnpj.replace(/\D/g, ""));

  return { nomes: [...nomes], numeros: [...numeros], loja };
}

// O backup vem em dezenas de lotes: o dicionário é montado uma vez por backup
// (sal) e reaproveitado enquanto a instância do servidor estiver de pé.
const cache = new Map<string, { disfarce: Disfarce; em: number }>();

export async function disfarceDoBackup(sal: string): Promise<Disfarce> {
  const agora = Date.now();
  for (const [k, v] of cache) if (agora - v.em > 30 * 60 * 1000) cache.delete(k);
  const pronto = cache.get(sal);
  if (pronto) return pronto.disfarce;
  const disfarce = new Disfarce(sal, await montarDicionario());
  cache.set(sal, { disfarce, em: agora });
  return disfarce;
}
