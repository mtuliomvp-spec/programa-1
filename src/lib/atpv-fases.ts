/**
 * A ATPV-e passa por fases e cada uma vira um arquivo — mas é UM documento:
 *  1. EMITIDA: como o Detran emite (sem local, data nem assinatura);
 *  2. PREENCHIDA: com local e data da venda;
 *  3. ASSINADA: assinada digitalmente;
 *  4. TERMO: o termo/relatório de conformidade que valida a assinatura.
 * Guardar todas serve para alguma situação futura; na ficha elas aparecem
 * juntas, como etapas da mesma ATPV-e.
 *
 * A fase fica no fim da descrição do anexo ("ATPV-e nº 2628… — Assinada"),
 * sem coluna nova. Puro: usado na tela, na leitura e no anexo.
 */

export type FaseAtpv = "EMITIDA" | "PREENCHIDA" | "ASSINADA" | "TERMO";

export const FASES_ATPV: readonly FaseAtpv[] = ["EMITIDA", "PREENCHIDA", "ASSINADA", "TERMO"];

export const ROTULO_FASE_ATPV: Record<FaseAtpv, string> = {
  EMITIDA: "Emitida",
  PREENCHIDA: "Local e data preenchidos",
  ASSINADA: "Assinada",
  TERMO: "Termo de conformidade",
};

export const DICA_FASE_ATPV: Record<FaseAtpv, string> = {
  EMITIDA: "como o Detran emite, sem local, data e assinatura",
  PREENCHIDA: "com o local e a data da venda",
  ASSINADA: "assinada digitalmente",
  TERMO: "valida que a assinatura é autêntica",
};

/** Fase gravada na descrição do anexo (null = ainda não identificada). */
export function faseDaDescricao(descricao: string): FaseAtpv | null {
  const m = descricao.match(/—\s*([^—]+)$/);
  if (!m) return null;
  const rotulo = m[1].trim().toLowerCase();
  return FASES_ATPV.find((f) => ROTULO_FASE_ATPV[f].toLowerCase() === rotulo) ?? null;
}

/** Nº da ATPV-e na descrição ("ATPV-e nº 262891710267570 — …"). */
export function numeroDaDescricao(descricao: string): string | null {
  return descricao.match(/n[ºo°]\s*(\d{6,})/i)?.[1] ?? null;
}

/** "ATPV-e nº 2628… — Assinada". */
export function descricaoAtpv(numero: string | null, fase: FaseAtpv | null): string {
  return `ATPV-e${numero ? ` nº ${numero}` : ""}${fase ? ` — ${ROTULO_FASE_ATPV[fase]}` : ""}`.slice(0, 500);
}

/**
 * Fase pelo que o arquivo É: o termo de conformidade se identifica pelo nome
 * ("Relatorio - …") ou pelo texto do validador; a assinada tem assinatura
 * digital no PDF (/ByteRange) ou "assinado" no nome; com a data da venda lida,
 * está preenchida; senão é a emitida pelo Detran.
 */
export function detectarFaseAtpv(i: {
  filename: string;
  /** Texto do PDF (pode vir vazio). */
  texto: string;
  /** O PDF tem assinatura digital embutida. */
  assinadoDigital: boolean;
  /** Data declarada da venda lida do documento (aaaa-mm-dd). */
  dataVenda?: string | null;
}): FaseAtpv {
  const nome = i.filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const texto = i.texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/^relatorio|conformidade|validacao|verificador/.test(nome)) return "TERMO";
  if (/relatorio de conformidade|verificador de conformidade|relatorio de verificacao|validar\.iti/.test(texto)) {
    return "TERMO";
  }
  if (i.assinadoDigital || /assinad/.test(nome)) return "ASSINADA";
  if (i.dataVenda && /^\d{4}-\d{2}-\d{2}$/.test(i.dataVenda)) return "PREENCHIDA";
  return "EMITIDA";
}

/** O PDF tem assinatura digital embutida (dicionário /Sig com /ByteRange)? */
export function pdfAssinado(bytes: Uint8Array | Buffer): boolean {
  const s = Buffer.from(bytes).toString("latin1");
  return /\/ByteRange\s*\[/.test(s) && /\/Type\s*\/Sig\b|adbe\.pkcs7|ETSI\.CAdES/.test(s);
}
