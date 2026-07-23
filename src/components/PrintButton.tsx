"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * Altura do canvas até a última linha com conteúdo (não branca), para descartar
 * o espaço em branco do rodapé e evitar páginas quase vazias no PDF.
 */
function trimTrailingWhitespace(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.height;
  const w = canvas.width;
  const h = canvas.height;
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return h;
  }
  const xStep = Math.max(1, Math.floor(w / 60));
  const isBlankRow = (y: number) => {
    for (let x = 0; x < w; x += xStep) {
      const i = (y * w + x) * 4;
      // Considera "branco" (com pequena tolerância) pixels quase brancos e opacos.
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) return false;
    }
    return true;
  };
  for (let y = h - 1; y >= 0; y -= 2) {
    if (!isBlankRow(y)) return Math.min(h, y + 8);
  }
  return h;
}

/**
 * Botão "PDF": gera e baixa um PDF com exatamente o que está renderizado e
 * filtrado na tela. Captura o conteúdo da página (`main`) com html2canvas-pro
 * (fork que entende as cores lab()/oklab() do Tailwind v4), monta um A4 em
 * páginas com jsPDF e baixa o arquivo. Se a captura falhar, cai na impressão
 * do navegador (window.print).
 *
 * A barra de filtros e os botões já têm `print:hidden` — são ignorados na
 * captura, então o PDF sai só com título, totais e a lista filtrada.
 */
export default function PrintButton({
  title,
  rootSelector = "main",
}: {
  title?: string;
  rootSelector?: string;
}) {
  const [pending, setPending] = useState(false);

  async function generate() {
    const root =
      (document.querySelector(rootSelector) as HTMLElement | null) ?? document.body;
    setPending(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(root, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        ignoreElements: (el) =>
          el.classList?.contains("print:hidden") || el.hasAttribute?.("data-no-pdf"),
      });

      const reportTitle =
        title ||
        document.querySelector("main h1")?.textContent?.trim() ||
        document.title ||
        "Relatório";
      const now = new Date();
      const emittedAt = now.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 24;
      const headerH = 26; // faixa do cabeçalho em cada página
      const contentW = pageW - margin * 2;
      const contentTop = margin + headerH;
      const contentH = pageH - contentTop - margin;

      // Altura útil do canvas: corta o espaço em branco no rodapé (o <main>
      // costuma ter altura mínima da tela, gerando páginas quase vazias).
      const usableH = trimTrailingWhitespace(canvas);

      // Quantos pixels do canvas cabem numa página (mantendo a proporção).
      const pxPerPage = Math.floor((canvas.width / contentW) * contentH);
      const totalPages = Math.max(1, Math.ceil(usableH / pxPerPage));

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) doc.addPage();

        // Cabeçalho da página.
        doc.setFontSize(10);
        doc.setTextColor(30, 30, 30);
        doc.text(`MVP Veículos · ${reportTitle}`, margin, margin + 8);
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Emitido em ${emittedAt} · pág. ${page + 1}/${totalPages}`,
          pageW - margin,
          margin + 8,
          { align: "right" },
        );

        // Fatia do canvas correspondente a esta página.
        const sliceY = page * pxPerPage;
        const sliceH = Math.min(pxPerPage, usableH - sliceY);
        if (sliceH <= 0) break;
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceH;
        const ctx = slice.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, sliceY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        }
        const imgH = (sliceH / canvas.width) * contentW;
        doc.addImage(
          slice.toDataURL("image/jpeg", 0.92),
          "JPEG",
          margin,
          contentTop,
          contentW,
          imgH,
        );
      }

      const slug =
        reportTitle
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "") || "relatorio";
      const dateStr = now.toISOString().slice(0, 10);
      doc.save(`${slug}-${dateStr}.pdf`);
    } catch {
      // Fallback: impressão nativa (o usuário pode "Salvar como PDF").
      window.print();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={generate}
      disabled={pending}
      className="print:hidden"
    >
      {pending ? "Gerando PDF…" : "📄 PDF"}
    </Button>
  );
}
