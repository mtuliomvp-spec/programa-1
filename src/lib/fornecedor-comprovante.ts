import "server-only";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { docKey, nameKey } from "@/lib/person-keys";
import { beneficiarioConfere, contaDoComprovante } from "@/lib/payment-queue";
import type { ComprovanteExtraido } from "@/lib/receipts-ai";

/**
 * Fornecedor a partir do COMPROVANTE de um pagamento: quem recebeu o dinheiro
 * vira (ou completa) o cadastro, com CPF/CNPJ e dados bancários — banco,
 * agência e conta com dígito, tipo e chave Pix. Assim o próximo pagamento já
 * sai da Ordem de Pagamento com tudo preenchido.
 *
 * Regras (conservadoras — na dúvida não cria nada):
 *  - só pagamento que SAIU da loja por Pix/TED/DOC/transferência (boleto não:
 *    o cedente costuma ser um intermediário, como PJBank);
 *  - não é a própria loja nem uma conta da loja (transferência entre contas)
 *    nem um sócio do capital;
 *  - já cadastrado (mesmo CPF/CNPJ, mesmo nome ou nome ABREVIADO pelo banco,
 *    como "GLENDA MARAO V PEREIRA" × "Glenda Marão Viana Pereira") → só
 *    completa o que estiver em branco, nunca troca o que já existe;
 *  - mais de um cadastro parecido → não mexe em nenhum (e não cria outro).
 */
export type FornecedorDoComprovante = {
  id: string;
  nome: string;
  criado: boolean;
  /** Campos preenchidos agora num cadastro que já existia. */
  completados: string[];
};

const PALAVRAS_FRACAS = new Set(["de", "da", "das", "do", "dos", "e"]);

function palavras(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !PALAVRAS_FRACAS.has(w));
}

/**
 * O nome do comprovante é o do cadastro, abreviado ou cortado pelo banco?
 * Cada palavra do comprovante tem de ser o começo de uma palavra do cadastro,
 * na mesma ordem; a primeira palavra (o prenome) tem de ser igual.
 * "MARCIO DOS REIS VIANA PER" casa com "Marcio dos Reis Viana Pereira".
 */
export function nomeAbreviadoConfere(doComprovante: string, doCadastro: string): boolean {
  const a = palavras(doComprovante);
  const b = palavras(doCadastro);
  if (a.length < 2 || b.length < 2 || a[0] !== b[0]) return false;
  let j = 1;
  for (let i = 1; i < a.length; i++) {
    while (j < b.length && !b[j].startsWith(a[i])) j++;
    if (j >= b.length) return false;
    j++;
  }
  return true;
}

const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function tipoConta(v: string | null | undefined): string | null {
  const t = (v ?? "").toUpperCase();
  if (t.startsWith("CORR")) return "corrente";
  if (t.startsWith("POUP")) return "poupanca";
  return null;
}

export async function fornecedorDoComprovante(
  lido: ComprovanteExtraido | null | undefined,
  opts: { supplierIdDoTitulo?: string | null } = {},
): Promise<FornecedorDoComprovante | null> {
  try {
    return await resolver(lido, opts);
  } catch {
    // Cadastro automático é conveniência: nunca derruba a leitura do comprovante.
    return null;
  }
}

async function resolver(
  lido: ComprovanteExtraido | null | undefined,
  opts: { supplierIdDoTitulo?: string | null },
): Promise<FornecedorDoComprovante | null> {
  if (!lido) return null;
  const nome = (lido.beneficiario ?? "").replace(/\s+/g, " ").trim();
  if (nome.length < 3) return null;
  if (String(lido.sentido ?? "").toUpperCase() === "ENTRADA") return null;
  const forma = String(lido.formaPagamento ?? "").toUpperCase();
  if (forma === "BOLETO") return null;

  const agencia = (lido.agenciaDestinoImpressa || lido.agenciaDestino || "").trim() || null;
  const conta = (lido.contaDestinoImpressa || lido.contaDestino || "").trim() || null;
  const pix = (lido.chavePixDestino ?? "").trim() || null;
  const temBanco = !!(agencia && conta) || !!pix;
  if (!temBanco && !["PIX", "TED", "DOC", "TRANSFERENCIA"].includes(forma)) return null;

  const documento = [11, 14].includes(dig(lido.documentoBeneficiario).length) ? dig(lido.documentoBeneficiario) : null;

  // A própria loja recebendo (transferência entre contas) não é fornecedor.
  const empresa = await getCompany();
  const partesDaLoja = [
    { nome: empresa.razaoSocial, documento: empresa.cnpj },
    { nome: empresa.nomeFantasia, documento: empresa.cnpj },
  ];
  if (beneficiarioConfere({ nome, documento }, { partes: partesDaLoja }).bate === true) return null;
  if (
    agencia &&
    conta &&
    (await contaDoComprovante({ banco: lido.bancoDestino, agencia: lido.agenciaDestino, conta: lido.contaDestino }))
  ) {
    return null;
  }
  const socios = await prisma.capitalBeneficiary.findMany({ select: { name: true } });
  if (socios.some((s) => nameKey(s.name) === nameKey(nome))) return null;

  const dados = {
    document: documento,
    bankName: (lido.bancoDestino ?? "").trim() || null,
    bankAgency: agencia,
    bankAccount: conta,
    bankAccountType: tipoConta(lido.tipoContaDestino),
    pixKey: pix,
  };

  const fornecedores = await prisma.supplier.findMany({
    select: {
      id: true,
      name: true,
      document: true,
      userId: true,
      bankName: true,
      bankAgency: true,
      bankAccount: true,
      bankAccountType: true,
      pixKey: true,
    },
  });
  type F = (typeof fornecedores)[number];

  // O fornecedor do título, quando o comprovante confere com ele.
  let alvo: F | null = null;
  const doTitulo = opts.supplierIdDoTitulo ? fornecedores.find((f) => f.id === opts.supplierIdDoTitulo) : null;
  if (doTitulo) {
    const confere = beneficiarioConfere(
      { nome, documento },
      { partes: [{ nome: doTitulo.name, documento: doTitulo.document }] },
    ).bate;
    if (confere || nomeAbreviadoConfere(nome, doTitulo.name)) alvo = doTitulo;
  }
  if (!alvo) {
    const porDoc = documento ? fornecedores.filter((f) => docKey(f.document) === documento) : [];
    const porNome = fornecedores.filter((f) => nameKey(f.name) === nameKey(nome));
    const candidatos = porDoc.length ? porDoc : porNome.length ? porNome : fornecedores.filter((f) => nomeAbreviadoConfere(nome, f.name));
    if (candidatos.length > 1) return null;
    alvo = candidatos[0] ?? null;
  }

  if (!alvo) {
    const criado = await prisma.supplier.create({
      data: {
        name: nome,
        ...dados,
        notes: "Cadastrado automaticamente pelo comprovante de pagamento.",
      },
      select: { id: true, name: true },
    });
    return { id: criado.id, nome: criado.name, criado: true, completados: [] };
  }

  // Espelho de usuário: os dados vêm do cadastro do usuário — não mexe.
  if (alvo.userId) return { id: alvo.id, nome: alvo.name, criado: false, completados: [] };
  const completar: Record<string, string> = {};
  const rotulos: string[] = [];
  if (dados.document && !dig(alvo.document)) {
    completar.document = dados.document;
    rotulos.push("CPF/CNPJ");
  }
  // Banco/agência/conta vão juntos: só quando o cadastro não tem conta nenhuma.
  if (dados.bankAccount && dados.bankAgency && !(alvo.bankAccount ?? "").trim()) {
    completar.bankAccount = dados.bankAccount;
    completar.bankAgency = dados.bankAgency;
    if (dados.bankName && !(alvo.bankName ?? "").trim()) completar.bankName = dados.bankName;
    if (dados.bankAccountType && !(alvo.bankAccountType ?? "").trim()) completar.bankAccountType = dados.bankAccountType;
    rotulos.push("dados bancários");
  }
  if (dados.pixKey && !(alvo.pixKey ?? "").trim()) {
    completar.pixKey = dados.pixKey;
    rotulos.push("chave Pix");
  }
  if (rotulos.length) await prisma.supplier.update({ where: { id: alvo.id }, data: completar });
  return { id: alvo.id, nome: alvo.name, criado: false, completados: rotulos };
}

/** Frase curta para a tela ("Fornecedor X cadastrado com os dados bancários"). */
export function avisoFornecedor(f: FornecedorDoComprovante | null): string | null {
  if (!f) return null;
  if (f.criado) return `fornecedor ${f.nome} cadastrado com os dados do comprovante`;
  if (f.completados.length) return `cadastro de ${f.nome} completado com ${f.completados.join(", ")} do comprovante`;
  return null;
}
