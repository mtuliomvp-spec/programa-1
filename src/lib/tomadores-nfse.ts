import type { Endereco } from "@/lib/endereco";

/**
 * Bancos/seguradoras para os quais a MVP já emitiu NFS-e de comissão — dados
 * tirados das próprias notas (tomador: razão social, CNPJ, endereço, contato).
 * Servem de cadastro pronto: ao ligar a financeira de Contas e caixas, o
 * sistema reconhece o banco pelo nome e vincula sem consultar a Receita.
 */
export type TomadorConhecido = {
  nome: string;
  cnpj: string;
  /** Como a financeira costuma estar escrita em Contas e caixas. */
  apelidos: RegExp;
  email?: string;
  telefone?: string;
  endereco: Endereco;
  /**
   * CNPJ do tomador da nota de comissão do SEGURO, quando é outra empresa do
   * grupo (Aymoré → Santander Corretora). Sem isto, o seguro sai para o próprio banco.
   */
  seguroCnpj?: string;
  /** Só recebe nota de seguro (corretora): não vira financeira em Contas e caixas. */
  soSeguro?: boolean;
  /** Nome da conta ao cadastrar a financeira em Contas e caixas. */
  conta?: string;
};

const SP = { cidade: "São Paulo", uf: "SP", ibge: "3550308" };

export const TOMADORES_CONHECIDOS: TomadorConhecido[] = [
  {
    nome: "BANCO VOTORANTIM S.A.",
    cnpj: "59.588.111/0001-03",
    conta: "Financeira BV",
    apelidos: /\b(bv|votorantim)\b/i,
    email: "david.pardini@bv.com.br",
    telefone: "(11) 5171-3393",
    endereco: { cep: "04794-000", logradouro: "Avenida das Nações Unidas", numero: "14171", complemento: "Torre A, Andar 18", bairro: "Vila Gertrudes", ...SP },
  },
  {
    nome: "BANCO PAN S.A.",
    cnpj: "59.285.411/0001-13",
    conta: "Financeira Pan",
    apelidos: /\bpan\b/i,
    endereco: { cep: "01310-916", logradouro: "Avenida Paulista", numero: "1374", complemento: "Andar 7-8-15-16-17 e 18", bairro: "Bela Vista", ...SP },
  },
  {
    nome: "BANCO C6 S.A.",
    cnpj: "31.872.495/0001-72",
    conta: "Financeira C6",
    apelidos: /\bc6\b/i,
    endereco: { cep: "01406-000", logradouro: "Avenida Nove de Julho", numero: "3186", complemento: "", bairro: "Jardim Paulista", ...SP },
  },
  {
    nome: "SAFRA SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO S.A.",
    cnpj: "45.437.547/0001-97",
    conta: "Financeira Safra",
    apelidos: /\bsafra\b/i,
    endereco: { cep: "01310-300", logradouro: "Avenida Paulista", numero: "2150", complemento: "", bairro: "Bela Vista", ...SP },
  },
  {
    nome: "BANCO BRADESCO FINANCIAMENTOS S.A.",
    cnpj: "07.207.996/0001-50",
    conta: "Financeira Bradesco",
    apelidos: /\bbradesco\b/i,
    email: "4510.leticia@bradesco.com.br",
    telefone: "(11) 5506-7717",
    endereco: { cep: "06029-900", logradouro: "Cidade de Deus", numero: "S/N", complemento: "Andar 4, Prédio Prata", bairro: "Vila Yara", cidade: "Osasco", uf: "SP", ibge: "3534401" },
  },
  {
    nome: "BANCO VOLKSWAGEN S.A.",
    cnpj: "59.109.165/0001-49",
    conta: "Financeira Volkswagen",
    apelidos: /\b(volkswagen|volkswagem|vw|vwfs)\b/i,
    email: "luis.penteado@vwfs.com",
    telefone: "(11) 5582-5223",
    endereco: { cep: "04344-901", logradouro: "Rua Volkswagen", numero: "291", complemento: "", bairro: "Jabaquara", ...SP },
  },
  {
    // Financeira do grupo Santander: a nota do RETORNO sai para ela; a do
    // seguro, para a Santander Corretora (notas 220 e 221 de 14/11/2025).
    nome: "AYMORE CREDITO FINANCIAMENTO E INVEST.S.A",
    cnpj: "07.707.650/0001-10",
    apelidos: /\b(aymor[eé]|santander)\b/i,
    email: "jocasilva@santander.com.br",
    telefone: "(11) 4004-9090",
    endereco: { cep: "04752-901", logradouro: "Rua Amador Bueno", numero: "474", complemento: "Bloco C, 1º andar", bairro: "Santo Amaro", ...SP },
    seguroCnpj: "04.270.778/0001-71",
    conta: "Financeira Aymoré (Santander)",
  },
  {
    nome: "SANTANDER CORRETORA DE SEGUROS, INVESTIMENTO E SERVICOS S/A.",
    cnpj: "04.270.778/0001-71",
    apelidos: /\bsantander\s+(corretora|seguros?)\b/i,
    soSeguro: true,
    telefone: "(11) 3012-7044",
    endereco: { cep: "04543-011", logradouro: "Avenida Presidente Juscelino Kubitschek", numero: "2041", complemento: "2235, Bloco A", bairro: "Vila Olímpia", ...SP },
  },
];

const dig = (s: string) => s.replace(/\D/g, "");

export function tomadorPorCnpj(cnpj: string): TomadorConhecido | null {
  const d = dig(cnpj);
  return TOMADORES_CONHECIDOS.find((t) => dig(t.cnpj) === d) ?? null;
}

/** O banco da financeira pelo nome dela em Contas e caixas ("Banco PAN", "BV Financeira"…). */
export function tomadorPorNome(nome: string): TomadorConhecido | null {
  // A corretora (nome mais específico) antes do banco do mesmo grupo.
  return (
    TOMADORES_CONHECIDOS.find((t) => t.soSeguro && t.apelidos.test(nome)) ??
    TOMADORES_CONHECIDOS.find((t) => t.apelidos.test(nome)) ??
    null
  );
}

/** Tomador da nota do seguro de um banco conhecido (a corretora do grupo, se houver). */
export function tomadorSeguroDe(t: TomadorConhecido | null): TomadorConhecido | null {
  return t?.seguroCnpj ? tomadorPorCnpj(t.seguroCnpj) : null;
}
