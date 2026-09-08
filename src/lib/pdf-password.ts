import "server-only";

/**
 * PDF protegido por SENHA de abertura.
 *
 * Boleto de concessionária (Equatorial, por exemplo) costuma vir cifrado: só
 * abre depois de digitar o CPF/CNPJ do titular. A IA não recebe senha — o
 * pedido volta com "The PDF specified is password protected" —, então a senha
 * é usada AQUI: o arquivo é aberto, decifrado e só então segue para a leitura
 * e para o anexo. O que fica guardado é a versão DECIFRADA, para o boleto
 * abrir depois sem ninguém precisar lembrar a senha.
 *
 * Usa o mupdf (WebAssembly) porque o pdf-lib não decifra — ele só consegue
 * ignorar a criptografia, o que produz um arquivo quebrado.
 */

/** O arquivo é um PDF? (só o cabeçalho — não vale confiar no mime do upload) */
export function ehPdf(buffer: Buffer, mimeType?: string): boolean {
  if (mimeType === "application/pdf") return true;
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/** Este PDF pede senha para abrir? Erro de leitura não vira "pede senha". */
export async function pdfPedeSenha(buffer: Buffer): Promise<boolean> {
  try {
    const mupdf = await import("mupdf");
    const doc = mupdf.PDFDocument.openDocument(buffer, "application/pdf");
    return doc.needsPassword();
  } catch {
    return false;
  }
}

export class SenhaIncorretaError extends Error {
  constructor() {
    super("Senha incorreta para este PDF. Confira e tente de novo.");
    this.name = "SenhaIncorretaError";
  }
}

/**
 * Abre o PDF com a senha e devolve a versão DECIFRADA. Senha errada lança
 * `SenhaIncorretaError` — é o único caso em que o usuário precisa fazer algo.
 */
export async function decifrarPdf(buffer: Buffer, senha: string): Promise<Buffer> {
  const mupdf = await import("mupdf");
  const doc = mupdf.PDFDocument.openDocument(buffer, "application/pdf");
  if (!doc.needsPassword()) return buffer;
  // authenticatePassword devolve 0 quando a senha não serve.
  if (!doc.authenticatePassword(senha)) throw new SenhaIncorretaError();
  // openDocument devolve o tipo genérico Document; só o PDFDocument grava.
  if (!(doc instanceof mupdf.PDFDocument)) {
    throw new Error("Não foi possível abrir este PDF com a senha informada.");
  }
  return Buffer.from(doc.saveToBuffer("encrypt=none").asUint8Array());
}

/**
 * O erro da IA é o de PDF com senha? Segunda linha de defesa: a checagem local
 * já pega o caso normal, mas um PDF que só o servidor da IA considere cifrado
 * ainda cai aqui em vez de virar um erro técnico na tela.
 */
export function erroDeSenhaDaIA(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /password[- ]?protected|senha/i.test(msg) && /pdf/i.test(msg);
}
