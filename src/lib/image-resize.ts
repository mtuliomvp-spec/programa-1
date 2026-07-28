/**
 * Redimensiona uma imagem no NAVEGADOR antes do upload, para não estourar o
 * limite do Server Action (25 MB) nem a memória do celular — o que aparecia
 * como "This page couldn't load" ao enviar várias fotos grandes de uma vez.
 *
 * Só mexe em imagens: PDFs e outros arquivos passam sem alteração. Em qualquer
 * erro, devolve o arquivo original (fail-open — nunca bloqueia o envio).
 */

/** Decodifica o arquivo respeitando a orientação EXIF (com fallback <img>). */
async function loadBitmap(
  file: File,
): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h) };
    } catch {
      /* cai no fallback com <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Reduz a imagem para no máximo `maxSide` px no maior lado e devolve um JPEG.
 * Não amplia imagens menores. Devolve o arquivo original se não for imagem ou
 * se algo falhar.
 */
export async function resizeImageToJpeg(
  file: File,
  maxSide = 1600,
  quality = 0.85,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const src = await loadBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    src.draw(ctx, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;
    // Se por acaso o "redimensionado" ficou maior que o original, mantém o menor.
    if (blob.size >= file.size && file.type === "image/jpeg") return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
