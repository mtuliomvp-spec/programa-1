import { resizeImageToJpeg } from "@/lib/image-resize";
import { PARTE_UPLOAD_IMOVEL } from "@/lib/imoveis";
import { continuarAnexoImovelAction, excluirAnexoImovelAction, iniciarAnexoImovelAction } from "./actions";

/**
 * Envia um documento de imóvel em partes de 3 MB (a hospedagem recusa
 * requisições acima de ~4,5 MB). Sem `imovelId`, o documento sobe como
 * RASCUNHO — é o registro lido no "Novo imóvel", ligado ao imóvel ao salvar.
 * Falhou no meio: o pedaço que já subiu é apagado. Devolve o id do documento.
 */
export async function enviarAnexoImovel(
  original: File,
  meta: { imovelId: string | null; categoria: string; exercicio?: string; description?: string },
  progresso?: (pct: number) => void,
): Promise<string> {
  const file = original.type.startsWith("image/") ? await resizeImageToJpeg(original) : original;
  let id: string | null = null;
  for (let offset = 0; offset < file.size; offset += PARTE_UPLOAD_IMOVEL) {
    const parte = file.slice(offset, offset + PARTE_UPLOAD_IMOVEL);
    const fd = new FormData();
    fd.set("parte", parte);
    let r;
    if (!id) {
      if (meta.imovelId) fd.set("imovelId", meta.imovelId);
      fd.set("categoria", meta.categoria);
      if (meta.exercicio) fd.set("exercicio", meta.exercicio);
      fd.set("description", meta.description ?? "");
      fd.set("filename", file.name || original.name);
      fd.set("mimeType", file.type || original.type);
      fd.set("size", String(file.size));
      r = await iniciarAnexoImovelAction(fd);
      id = r.id ?? null;
    } else {
      fd.set("id", id);
      fd.set("offset", String(offset));
      r = await continuarAnexoImovelAction(fd);
    }
    if (!r.ok || !id) {
      if (id) await excluirAnexoImovelAction(id);
      throw new Error(`${original.name}: ${r.error || "falha no envio"}`);
    }
    progresso?.(Math.min(100, Math.round(((offset + parte.size) / file.size) * 100)));
  }
  return id!;
}
