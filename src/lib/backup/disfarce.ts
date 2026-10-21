import { createHash, randomBytes } from "node:crypto";

/**
 * Disfarce dos dados para o backup de DEMONSTRAÇÃO.
 *
 * A demonstração é mostrada a terceiros: nome, CPF/CNPJ, telefone, e-mail,
 * endereço, placa, chassi, Renavam, conta bancária e documentos anexados da
 * loja não podem ir para lá. Os valores, datas e a estrutura (quantos carros,
 * quanto custou cada um, como foi pago) ficam — é isso que a demonstração
 * mostra.
 *
 * Tudo é DETERMINÍSTICO dentro do mesmo backup (mesmo `sal`): o cliente
 * "Daniel Henrique Berniz" vira o mesmo nome falso na ficha, na venda e no
 * texto do título. O sal é sorteado a cada backup, então não dá para montar
 * uma tabela de volta.
 *
 * Arquivo puro (sem banco): quem chama monta o dicionário dos nomes reais.
 */

export type Regra =
  | "pessoa"
  | "fornecedor"
  | "doc"
  | "email"
  | "emailImportado"
  | "telefone"
  | "endereco"
  | "enderecoJson"
  | "digitos"
  | "pix"
  | "placa"
  | "chassi"
  | "limpar"
  | "token"
  | "senha";

const PESSOA_E_BANCO = {
  doc: "doc",
  phone: "telefone",
  email: "email",
  address: "endereco",
  endereco: "enderecoJson",
  inscricaoEstadual: "digitos",
  bankAgency: "digitos",
  bankAccount: "digitos",
  pixKey: "pix",
} as const;

const VENDA: Record<string, Regra> = {
  ownerName: "pessoa",
  ownerDocument: "doc",
  ownerPhone: "telefone",
  ownerAddress: "endereco",
  buyerBankAgency: "digitos",
  buyerBankAccount: "digitos",
  buyerPixKey: "pix",
  payoffBarcode: "digitos",
  debtsBarcode: "digitos",
  devolucaoTerceiroNome: "pessoa",
  devolucaoTerceiroDocumento: "doc",
  sellerName: "pessoa",
  tiPlate: "placa",
  tiChassi: "chassi",
  tiSupplierName: "fornecedor",
  publicToken: "token",
};

/**
 * O que fazer com cada campo de texto. Campo fora desta lista recebe só a
 * troca dos nomes/documentos conhecidos dentro do texto (descrições).
 */
export const REGRAS: Record<string, Record<string, Regra>> = {
  FinancialAccount: { agency: "digitos", accountNumber: "digitos", pixKey: "pix" },
  PurchaseRequest: { requestedBy: "pessoa", decidedBy: "pessoa", decisionNotes: "limpar" },
  PendingTransfer: { createdBy: "pessoa" },
  User: {
    name: "pessoa",
    email: "emailImportado",
    passwordHash: "senha",
    document: "doc",
    phone: "telefone",
    bankAgency: "digitos",
    bankAccount: "digitos",
    pixKey: "pix",
    resetTokenHash: "limpar",
  },
  Supplier: { ...PESSOA_E_BANCO, name: "fornecedor", document: "doc" },
  Customer: { ...PESSOA_E_BANCO, name: "pessoa", document: "doc" },
  Vehicle: {
    plate: "placa",
    chassi: "chassi",
    renavam: "digitos",
    docOwnerName: "pessoa",
    transferToName: "pessoa",
    crvNumber: "digitos",
    crvSecurityCode: "digitos",
    entryNfeKey: "digitos",
    exitNfeKey: "digitos",
    photoUrl: "limpar",
    renaveNotes: "limpar",
  },
  VehicleAttachment: { address: "endereco" },
  NotaFiscal: { chave: "digitos", caminhoXml: "limpar", caminhoDanfe: "limpar", emitidaPor: "pessoa" },
  NotaServico: {
    tomadorNome: "pessoa",
    tomadorDocumento: "doc",
    codigoVerificacao: "limpar",
    url: "limpar",
    urlDanfse: "limpar",
    caminhoXml: "limpar",
    emitidaPor: "pessoa",
  },
  VehicleAppraisal: {
    plate: "placa",
    chassi: "chassi",
    renavam: "digitos",
    ownerName: "pessoa",
    ownerPhone: "telefone",
    checkedBy: "pessoa",
    createdByName: "pessoa",
    deliveryNotes: "limpar",
  },
  ShowroomVisit: { visitor: "pessoa" },
  PreSale: VENDA,
  Sale: VENDA,
  Payable: { publicToken: "token", barcode: "digitos", bankRef: "limpar" },
  PaymentCombo: { barcode: "digitos" },
  Receivable: { bankRef: "limpar" },
  CashboxSession: { openedBy: "pessoa", closedBy: "pessoa" },
  DashboardSnapshot: { archivedBy: "pessoa" },
  CapitalBeneficiary: { name: "pessoa" },
  StockInterestRun: { createdBy: "pessoa" },
  MonthlyClosing: { closedBy: "pessoa" },
  Employee: { name: "pessoa", cpf: "doc", pixKey: "pix" },
  FuelEntry: { plate: "placa", driver: "pessoa" },
  RenaveRegistro: { codigoCrvAtual: "digitos", atpveNumero: "digitos" },
  RenaveOperacao: { userName: "pessoa" },
  DevolucaoCompra: { supplierNome: "fornecedor", veiculoPlaca: "placa", nfeChave: "digitos", userName: "pessoa" },
};

/** Campos que são códigos do sistema: nem a troca dentro do texto mexe. */
const SEM_TEXTO = new Set([
  "key",
  "code",
  "ref",
  "status",
  "tipo",
  "kind",
  "ambiente",
  "structuralKey",
  "swapGroup",
  "sinalGroup",
  "capitalCoverGroup",
  "pendingPaymentBatch",
  "referencePeriod",
  "recurringPeriod",
  "competencia",
  "fuelType",
  "mimeType",
  "receiptMime",
  "filename",
  "receiptName",
  "estado",
  "operacao",
  "crvTipo",
]);

const NOMES = [
  "Ana", "Bruno", "Carla", "Diego", "Eduarda", "Felipe", "Gabriela", "Henrique", "Isabela", "João",
  "Karina", "Lucas", "Mariana", "Nicolas", "Olívia", "Paulo", "Rafaela", "Samuel", "Tatiane", "Vinícius",
  "Larissa", "Mateus", "Beatriz", "Gustavo", "Juliana", "Rodrigo", "Fernanda", "Thiago", "Patrícia", "André",
  "Camila", "Ricardo", "Letícia", "Fábio", "Renata", "Marcelo", "Aline", "Leonardo", "Débora", "Caio",
];
const SOBRENOMES = [
  "Almeida", "Barbosa", "Cardoso", "Duarte", "Esteves", "Ferraz", "Gomes", "Holanda", "Lacerda", "Macedo",
  "Nogueira", "Moura", "Pacheco", "Queiroz", "Rezende", "Siqueira", "Teixeira", "Valente", "Xavier", "Brandão",
  "Coelho", "Dantas", "Fontes", "Guimarães", "Leal", "Matos", "Neves", "Prado", "Rocha", "Sampaio",
  "Tavares", "Vieira", "Aguiar", "Bastos", "Campos", "Freitas", "Lima", "Medeiros", "Pinheiro", "Serra",
];
const RAMOS = ["Comércio", "Serviços", "Distribuidora", "Auto Peças", "Transportes", "Representações"];
const RUAS = ["Rua das Acácias", "Avenida Central", "Rua do Comércio", "Travessa São José", "Rua Projetada", "Avenida das Palmeiras", "Rua Sete", "Rua da Paz"];
const BAIRROS = ["Centro", "Jardim América", "Vila Nova", "Bela Vista", "Parque Industrial", "Boa Esperança"];

/** Empresa (e não pessoa)? Decide se o nome falso é de pessoa ou de firma. */
const EH_EMPRESA =
  /\b(ltda|me|epp|eireli|s\.?\s?a\.?|s\/a|com[eé]rcio|servi[cç]os|ve[ií]culos|auto|motors|distribuidora|ind[uú]stria|transportes|locadora|seguros|imobili[aá]ria|associa[cç][aã]o|cooperativa|grupo|holding|multimarcas)\b/i;

/**
 * Fornecedor que é instituição pública ou empresa conhecida (Detran, banco,
 * seguradora, concessionária de energia…): não é dado pessoal e, disfarçado,
 * deixaria a demonstração sem sentido. Fica como está.
 */
const INSTITUICAO =
  /\b(detran|banco|receita|prefeitura|secretaria|sefaz|caixa econ[oô]mica|ita[uú]|bradesco|santander|sicoob|sicredi|nubank|safra|porto seguro|tokio|mapfre|allianz|hdi|serpro|governo|tribunal|cart[oó]rio|correios|petrobras|shell|ipiranga|vivo|claro|equatorial|google|facebook|olx|webmotors|mercado livre|icarros|senatran|denatran|minist[eé]rio|estado d[oe]|munic[ií]pio)\b/i;

export const ehInstituicao = (s: string) => INSTITUICAO.test(s);

export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Mantém o jeito de escrever do original: TUDO MAIÚSCULO, minúsculo ou normal. */
function noEstilo(original: string, novo: string): string {
  if (/\p{Lu}/u.test(original) && original === original.toUpperCase()) return novo.toUpperCase();
  if (original === original.toLowerCase()) return novo.toLowerCase();
  return novo;
}

export type Dicionario = {
  /** Nomes reais de pessoas e empresas (clientes, fornecedores, usuários…). */
  nomes: string[];
  /** CPF/CNPJ e Renavam reais, só dígitos — para achar dentro dos textos. */
  numeros: string[];
  /** Nomes da própria loja → nome fictício fixo. */
  loja: string[];
};

const LOJA_FICTICIA = "Loja Modelo Veículos";
/** Domínio dos usuários importados na demonstração (desativados). */
export const DOMINIO_IMPORTADO = "importado.demo";
const PDF_DEMO = pdfDemonstracao();
// PNG cinza de 1×1: a foto original não vai para a demonstração.
const PNG_DEMO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mO8+x8AAr8B3p9mD3MAAAAASUVORK5CYII=",
  "base64",
);

export class Disfarce {
  private readonly sal: string;
  private readonly nomesRe: RegExp | null;
  private readonly falsoPorNome = new Map<string, string>();
  private readonly numeros: Set<string>;

  constructor(sal: string, dic: Dicionario) {
    this.sal = sal;
    for (const n of dic.loja) this.falsoPorNome.set(normalizar(n), EH_EMPRESA.test(n) ? `${LOJA_FICTICIA} Ltda` : LOJA_FICTICIA);
    const variantes = new Set<string>();
    for (const real of [...dic.nomes, ...dic.loja]) {
      const n = real.replace(/\s+/g, " ").trim();
      const palavras = n.split(" ");
      // Nome de uma palavra só ("Maria") apareceria em qualquer texto: só
      // nomes completos entram na troca dentro de descrições.
      if (palavras.length < 2 || n.length < 6) continue;
      variantes.add(n);
      if (palavras.length >= 3 && !this.falsoPorNome.has(normalizar(n)) && !EH_EMPRESA.test(n)) {
        // "Daniel Henrique Berniz" também aparece como "Daniel Berniz".
        const curto = `${palavras[0]} ${palavras[palavras.length - 1]}`;
        variantes.add(curto);
        const falso = this.pessoa(n).split(" ");
        this.falsoPorNome.set(normalizar(curto), `${falso[0]} ${falso[falso.length - 1]}`);
      }
    }
    const lista = [...variantes].sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
    this.nomesRe = lista.length ? new RegExp(`(?<![\\p{L}\\d])(?:${lista.join("|")})(?![\\p{L}\\d])`, "giu") : null;
    this.numeros = new Set(dic.numeros.filter((d) => d.length >= 9));
  }

  /** Sorteio determinístico: mesmo sal + mesmo valor = mesma resposta. */
  private sorteio(tipo: string, valor: string) {
    let n = 0;
    let buf = Buffer.alloc(0);
    let pos = 0;
    return (max: number) => {
      if (pos + 4 > buf.length) {
        buf = createHash("sha256").update(`${this.sal}|${tipo}|${valor}|${n++}`).digest();
        pos = 0;
      }
      const v = buf.readUInt32BE(pos);
      pos += 4;
      return v % max;
    };
  }

  /** Nome falso de pessoa com o mesmo número de palavras (2 a 4). */
  pessoa(real: string): string {
    const chave = normalizar(real);
    const fixo = this.falsoPorNome.get(chave);
    if (fixo) return noEstilo(real, fixo);
    if (EH_EMPRESA.test(real)) return this.empresa(real);
    const r = this.sorteio("pessoa", chave);
    const qtd = Math.min(4, Math.max(2, chave.split(" ").length));
    const partes = [NOMES[r(NOMES.length)]];
    while (partes.length < qtd) partes.push(SOBRENOMES[r(SOBRENOMES.length)]);
    return noEstilo(real, partes.join(" "));
  }

  empresa(real: string): string {
    const chave = normalizar(real);
    const fixo = this.falsoPorNome.get(chave);
    if (fixo) return noEstilo(real, fixo);
    const r = this.sorteio("empresa", chave);
    return noEstilo(real, `${SOBRENOMES[r(SOBRENOMES.length)]} ${RAMOS[r(RAMOS.length)]} Ltda`);
  }

  fornecedor(real: string): string {
    return ehInstituicao(real) ? real : this.pessoa(real);
  }

  /** Troca cada dígito, mantendo pontos, traços e barras no lugar. */
  digitos(real: string, tipo = "digitos"): string {
    const r = this.sorteio(tipo, real.replace(/\D/g, ""));
    return real.replace(/\d/g, () => String(r(10)));
  }

  /** CPF/CNPJ falso e VÁLIDO (o sistema confere os dígitos), no formato do original. */
  doc(real: string): string {
    const d = real.replace(/\D/g, "");
    if (d.length !== 11 && d.length !== 14) return this.digitos(real, "doc");
    const r = this.sorteio("doc", d);
    const base = Array.from({ length: d.length === 11 ? 9 : 8 }, () => r(10));
    if (d.length === 14) base.push(0, 0, 0, 1);
    const dv = (nums: number[], pesos: number[]) => {
      const s = nums.reduce((a, n, i) => a + n * pesos[i], 0) % 11;
      return s < 2 ? 0 : 11 - s;
    };
    if (d.length === 11) {
      base.push(dv(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]));
      base.push(dv(base, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]));
    } else {
      base.push(dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
      base.push(dv(base, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
    }
    let i = 0;
    return real.replace(/\d/g, () => String(base[i++]));
  }

  /** Placa falsa no mesmo padrão (Mercosul continua Mercosul). */
  placa(real: string): string {
    const r = this.sorteio("placa", real.toUpperCase().replace(/[^A-Z0-9]/g, ""));
    return real.replace(/[A-Za-z]/g, () => String.fromCharCode(65 + r(26))).replace(/\d/g, () => String(r(10)));
  }

  /** Chassi: mantém o fabricante (3 primeiros) e troca o resto. */
  chassi(real: string): string {
    const r = this.sorteio("chassi", real.toUpperCase());
    const letras = "ABCDEFGHJKLMNPRSTUVWXYZ";
    return real.slice(0, 3) + real.slice(3).replace(/[A-Za-z]/g, () => letras[r(letras.length)]).replace(/\d/g, () => String(r(10)));
  }

  /** Telefone: mantém o DDD (e o 9 do celular), troca o número. */
  telefone(real: string): string {
    const d = real.replace(/\D/g, "");
    const manter = d.length >= 11 ? 3 : d.length >= 10 ? 2 : 0;
    const r = this.sorteio("telefone", d);
    let i = 0;
    return real.replace(/\d/g, (c) => (i++ < manter ? c : String(r(10))));
  }

  email(real: string): string {
    const r = this.sorteio("email", real.toLowerCase());
    const nome = normalizar(NOMES[r(NOMES.length)]);
    const sobrenome = normalizar(SOBRENOMES[r(SOBRENOMES.length)]);
    return `${nome}.${sobrenome}${r(90) + 10}@exemplo.com.br`;
  }

  emailImportado(real: string): string {
    return `usuario.${createHash("sha256").update(`${this.sal}|${real.toLowerCase()}`).digest("hex").slice(0, 8)}@${DOMINIO_IMPORTADO}`;
  }

  pix(real: string): string {
    if (real.includes("@")) return this.email(real);
    if (/^[\d\s().+-]+$/.test(real)) {
      const d = real.replace(/\D/g, "");
      return d.length === 11 || d.length === 14 ? this.doc(real) : this.telefone(real);
    }
    // Chave aleatória (UUID): troca os caracteres hexadecimais.
    const r = this.sorteio("pix", real);
    return real.replace(/[0-9a-f]/gi, () => "0123456789abcdef"[r(16)]);
  }

  endereco(real: string): string {
    const r = this.sorteio("endereco", normalizar(real));
    return noEstilo(real, `${RUAS[r(RUAS.length)]}, ${r(1900) + 10} - ${BAIRROS[r(BAIRROS.length)]}`);
  }

  enderecoJson(v: unknown): unknown {
    if (!v || typeof v !== "object" || Array.isArray(v)) return this.json(v);
    const o = { ...(v as Record<string, unknown>) };
    const semente = JSON.stringify(o);
    const r = this.sorteio("enderecoJson", semente);
    for (const k of Object.keys(o)) {
      const val = o[k];
      if (typeof val !== "string" || !val) continue;
      const kk = normalizar(k).replace(/[^a-z]/g, "");
      if (/logradouro|rua|endereco/.test(kk)) o[k] = noEstilo(val, RUAS[r(RUAS.length)]);
      else if (kk === "numero") o[k] = String(r(1900) + 10);
      else if (kk === "bairro") o[k] = noEstilo(val, BAIRROS[r(BAIRROS.length)]);
      else if (kk === "complemento") o[k] = "";
      else if (kk === "cep") o[k] = this.digitos(val, "cep");
      // cidade, UF e código do município ficam: a NF-e e os cálculos usam.
    }
    return o;
  }

  /**
   * Troca, dentro de um texto livre (descrição de título, mensagem), os nomes,
   * documentos, e-mails, telefones, placas e chassis que aparecerem.
   */
  texto(s: string): string {
    if (!s) return s;
    // Arquivo em base64 esquecido num campo de texto: não vai.
    if (s.length > 1000 && /^[A-Za-z0-9+/=\s]+$/.test(s)) return "";
    let t = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (m) => this.email(m));
    if (this.nomesRe) t = t.replace(this.nomesRe, (m) => this.pessoa(m));
    t = t.replace(/\d[\d./-]{9,20}\d/g, (m) => {
      const d = m.replace(/\D/g, "");
      const formatado = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(m) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(m);
      if (formatado || this.numeros.has(d)) return d.length === 11 || d.length === 14 ? this.doc(m) : this.digitos(m);
      return m;
    });
    t = t.replace(/\(\d{2}\)\s?\d{4,5}-?\d{4}/g, (m) => this.telefone(m));
    t = t.replace(/\b\d{2}\s9\d{4}-\d{4}\b/g, (m) => this.telefone(m));
    t = t.replace(/\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/g, (m) => this.placa(m));
    t = t.replace(/\b(?=[A-HJ-NPR-Z0-9]*[A-Z])(?=[A-HJ-NPR-Z0-9]*\d)[A-HJ-NPR-Z0-9]{17}\b/g, (m) => this.chassi(m));
    return t;
  }

  /** JSON livre (payload da NF-e, retorno do Renave, indicações…). */
  json(v: unknown, chave = ""): unknown {
    if (v == null) return v;
    if (Array.isArray(v)) return v.map((x) => this.json(x, chave));
    if (typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = this.json(val, k);
      return o;
    }
    if (typeof v !== "string" || !v) return v;
    const k = normalizar(chave).replace(/[^a-z]/g, "");
    if (/cpf|cnpj/.test(k) || k === "documento") return this.doc(v);
    if (k.includes("email")) return this.email(v);
    if (/telefone|fone|phone|celular/.test(k)) return this.telefone(v);
    if (k === "placa") return this.placa(v);
    if (k === "chassi") return this.chassi(v);
    if (/renavam|chave|codigoseguranca|crv/.test(k)) return this.digitos(v);
    if (/logradouro|^endereco$|^rua$/.test(k)) return this.endereco(v);
    if (k === "bairro") return BAIRROS[this.sorteio("bairro", v)(BAIRROS.length)];
    if (k === "cep") return this.digitos(v, "cep");
    if (k === "complemento") return "";
    if (
      /^(nome|name|razaosocial|nomecompleto|nomefantasia|comprador|vendedor|proprietario|tomador|cliente|beneficiario|favorecido|indicador)$/.test(k) ||
      /^nome(destinatario|comprador|vendedor|proprietario|cliente|tomador|emitente)$/.test(k)
    ) {
      // "IPVA 2026" num item de débito não é nome de ninguém.
      if (!/\d/.test(v)) return this.pessoa(v);
    }
    return this.texto(v);
  }

  /** Arquivo anexado: nunca vai — fica um PDF (ou imagem) de demonstração no lugar. */
  arquivo(mimeOriginal: string | null | undefined): { data: Buffer; mime: string; nome: string } {
    return mimeOriginal?.startsWith("image/")
      ? { data: PNG_DEMO, mime: "image/png", nome: "imagem-demonstracao.png" }
      : { data: PDF_DEMO, mime: "application/pdf", nome: "documento-demonstracao.pdf" };
  }

  aplicar(regra: Regra, valor: string, obrigatorio: boolean): string | null {
    switch (regra) {
      case "pessoa":
        return valor.includes("@") ? this.email(valor) : this.pessoa(valor);
      case "fornecedor":
        return this.fornecedor(valor);
      case "doc":
        return this.doc(valor);
      case "email":
        return this.email(valor);
      case "emailImportado":
        return this.emailImportado(valor);
      case "telefone":
        return this.telefone(valor);
      case "endereco":
        return this.endereco(valor);
      case "digitos":
        return this.digitos(valor);
      case "pix":
        return this.pix(valor);
      case "placa":
        return this.placa(valor);
      case "chassi":
        return this.chassi(valor);
      case "token":
        return randomBytes(16).toString("hex");
      case "senha":
        return "!importado";
      case "limpar":
      case "enderecoJson":
        return obrigatorio ? "" : null;
    }
  }

  /** Disfarça uma linha inteira de uma tabela. */
  linha(
    modelo: string,
    linha: Record<string, unknown>,
    campos: { nome: string; tipo: string; obrigatorio: boolean; lista: boolean }[],
  ): Record<string, unknown> {
    const regras = REGRAS[modelo] ?? {};
    const o: Record<string, unknown> = { ...linha };
    for (const c of campos) {
      const v = o[c.nome];
      if (v == null || c.lista) continue;
      const regra = regras[c.nome] ?? (c.nome === "notes" || c.nome === "note" ? "limpar" : undefined);
      if (c.tipo === "Json") {
        o[c.nome] = regra === "enderecoJson" ? this.enderecoJson(v) : this.json(v);
      } else if (c.tipo === "String" && typeof v === "string") {
        if (regra) o[c.nome] = this.aplicar(regra, v, c.obrigatorio);
        else if (!SEM_TEXTO.has(c.nome) && !c.nome.endsWith("Id")) o[c.nome] = this.texto(v);
      }
    }
    if (modelo === "User") {
      // Usuário da loja na demonstração: só existe porque vendas e títulos
      // apontam para ele. Não entra, não é super admin, não tem perfil.
      if (o.role === "SUPER_ADMIN") o.role = "ADMIN";
      o.active = false;
      o.pending = false;
      o.profileId = null;
      o.lastSeenAt = null;
      o.resetRequestedAt = null;
      o.resetTokenExpiresAt = null;
    }
    return o;
  }
}

/** PDF mínimo de uma página dizendo que o original não foi incluído. */
function pdfDemonstracao(): Buffer {
  const texto = "Documento de demonstracao - o arquivo original nao foi incluido.";
  const conteudo = `BT /F1 14 Tf 60 760 Td (${texto}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
