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
};

const SP = { cidade: "São Paulo", uf: "SP", ibge: "3550308" };

export const TOMADORES_CONHECIDOS: TomadorConhecido[] = [
  {
    nome: "BANCO VOTORANTIM S.A.",
    cnpj: "59.588.111/0001-03",
    apelidos: /\b(bv|votorantim)\b/i,
    email: "david.pardini@bv.com.br",
    telefone: "(11) 5171-3393",
    endereco: { cep: "04794-000", logradouro: "Avenida das Nações Unidas", numero: "14171", complemento: "Torre A, Andar 18", bairro: "Vila Gertrudes", ...SP },
  },
  {
    nome: "BANCO PAN S.A.",
    cnpj: "59.285.411/0001-13",
    apelidos: /\bpan\b/i,
    endereco: { cep: "01310-916", logradouro: "Avenida Paulista", numero: "1374", complemento: "Andar 7-8-15-16-17 e 18", bairro: "Bela Vista", ...SP },
  },
  {
    nome: "BANCO C6 S.A.",
    cnpj: "31.872.495/0001-72",
    apelidos: /\bc6\b/i,
    endereco: { cep: "01406-000", logradouro: "Avenida Nove de Julho", numero: "3186", complemento: "", bairro: "Jardim Paulista", ...SP },
  },
  {
    nome: "SAFRA SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO S.A.",
    cnpj: "45.437.547/0001-97",
    apelidos: /\bsafra\b/i,
    endereco: { cep: "01310-300", logradouro: "Avenida Paulista", numero: "2150", complemento: "", bairro: "Bela Vista", ...SP },
  },
  {
    nome: "BANCO BRADESCO FINANCIAMENTOS S.A.",
    cnpj: "07.207.996/0001-50",
    apelidos: /\bbradesco\b/i,
    email: "4510.leticia@bradesco.com.br",
    telefone: "(11) 5506-7717",
    endereco: { cep: "06029-900", logradouro: "Cidade de Deus", numero: "S/N", complemento: "Andar 4, Prédio Prata", bairro: "Vila Yara", cidade: "Osasco", uf: "SP", ibge: "3534401" },
  },
  {
    nome: "BANCO VOLKSWAGEN S.A.",
    cnpj: "59.109.165/0001-49",
    apelidos: /\b(volkswagen|volkswagem|vw|vwfs)\b/i,
    email: "luis.penteado@vwfs.com",
    telefone: "(11) 5582-5223",
    endereco: { cep: "04344-901", logradouro: "Rua Volkswagen", numero: "291", complemento: "", bairro: "Jabaquara", ...SP },
  },
  {
    nome: "SANTANDER CORRETORA DE SEGUROS, INVESTIMENTO E SERVICOS S/A.",
    cnpj: "04.270.778/0001-71",
    apelidos: /\bsantander\b/i,
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
  return TOMADORES_CONHECIDOS.find((t) => t.apelidos.test(nome)) ?? null;
}
