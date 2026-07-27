"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * Limites de segurança para o canvas gerado pelo html2canvas. Navegadores têm
 * um teto para a área/dimensão de um <canvas> (frequentemente ~16–32k px de lado
 * e alguns milhões de px² de área); ao ultrapassar, a captura sai em branco e o
 * PDF "some" ou cai no fallback de impressão. Mantemos folga confortável.
 */
const MAX_CANVAS_DIM = 8000;
const MAX_CANVAS_AREA = 20_000_000;

/** Percentual de uma página que aceitamos "subir" para achar um corte limpo. */
const SAFE_CUT_LOOKUP = 0.18;

/** Testa se a linha `y` do canvas é praticamente branca (gap entre linhas). */
function isBlankRow(data: Uint8ClampedArray, w: number, y: number, xStep: number): boolean {
  for (let x = 0; x < w; x += xStep) {
    const i = (y * w + x) * 4;
    // "Branco" com tolerância: pixels quase brancos e opacos.
    if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) return false;
  }
  return true;
}

/**
 * Dado um ponto de corte "duro" (`hardCut`), procura para cima a linha em branco
 * mais próxima para não fatiar uma linha da tabela no meio. Se não achar dentro
 * do limite, corta no ponto duro mesmo (melhor cortar do que travar).
 */
function findSafeCut(
  data: Uint8ClampedArray,
  w: number,
  hardCut: number,
  minCut: number,
  xStep: number,
): number {
  for (let y = hardCut; y > minCut; y--) {
    if (isBlankRow(data, w, y, xStep)) return y;
  }
  return hardCut;
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
 *
 * Cuidados para não sair cortado:
 *  - força o layout "desktop" e expande os contêineres com `overflow` (as
 *    tabelas ficam dentro de um `overflow-x-auto`), capturando a largura toda;
 *  - fatia as páginas em linhas em branco (entre linhas da tabela), nunca no
 *    meio de uma linha;
 *  - limita a escala ao teto de canvas do navegador para a captura não falhar
 *    (o que antes derrubava tudo no fallback de impressão da tela inteira).
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

      // Largura de captura: a maior entre a largura visível e a tabela mais
      // larga (que pode transbordar um contêiner com rolagem horizontal).
      const tables = Array.from(root.querySelectorAll("table"));
      const widestTable = tables.reduce((m, t) => Math.max(m, t.scrollWidth), 0);
      const captureWidth = Math.max(root.clientWidth, widestTable + 48);
      // Força o layout de desktop (media queries reavaliadas nessa largura),
      // para o PDF sair consistente mesmo a partir de janelas estreitas.
      const windowWidth = Math.max(1024, captureWidth);

      // Escala alvo 2×, reduzida para nunca estourar o teto de canvas do
      // navegador (senão a captura sai em branco e cai no fallback).
      const estHeight = root.scrollHeight;
      const scale = Math.max(
        1,
        Math.min(
          2,
          MAX_CANVAS_DIM / windowWidth,
          MAX_CANVAS_DIM / Math.max(1, estHeight),
          Math.sqrt(MAX_CANVAS_AREA / Math.max(1, windowWidth * estHeight)),
        ),
      );

      const canvas = await html2canvas(root, {
        scale,
        width: captureWidth,
        windowWidth,
        backgroundColor: "#ffffff",
        useCORS: true,
        ignoreElements: (el) =>
          el.classList?.contains("print:hidden") || el.hasAttribute?.("data-no-pdf"),
        onclone: (clonedDoc) => {
          const clonedRoot = clonedDoc.querySelector(rootSelector) as HTMLElement | null;
          if (!clonedRoot) return;
          // Expande qualquer contêiner com rolagem (overflow-x-auto das tabelas)
          // para capturar o conteúdo inteiro, sem recorte horizontal.
          clonedRoot.querySelectorAll<HTMLElement>("*").forEach((el) => {
            const st = clonedDoc.defaultView?.getComputedStyle(el);
            if (!st) return;
            if (/(auto|scroll)/.test(st.overflow + st.overflowX + st.overflowY)) {
              el.style.overflow = "visible";
              el.style.overflowX = "visible";
              el.style.overflowY = "visible";
            }
          });
        },
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

      // Paisagem quando o conteúdo é claramente mais largo do que alto (tabelas
      // largas com poucas linhas ficam legíveis; listas longas seguem retrato).
      const landscape = canvas.width / canvas.height > 1.3;
      const doc = new jsPDF({
        orientation: landscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4",
      });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 24;
      const headerH = 26; // faixa do cabeçalho em cada página
      const contentW = pageW - margin * 2;
      const contentTop = margin + headerH;
      const contentH = pageH - contentTop - margin;

      // Lê os pixels uma vez só: usado tanto para aparar o rodapé em branco
      // quanto para achar cortes de página em linhas em branco.
      const ctxFull = canvas.getContext("2d");
      let pixels: Uint8ClampedArray | null = null;
      try {
        pixels = ctxFull?.getImageData(0, 0, canvas.width, canvas.height).data ?? null;
      } catch {
        pixels = null;
      }
      const xStep = Math.max(1, Math.floor(canvas.width / 60));

      // Altura útil do canvas: corta o espaço em branco no rodapé (o <main>
      // costuma ter altura mínima da tela, gerando páginas quase vazias).
      let usableH = canvas.height;
      if (pixels) {
        for (let y = canvas.height - 1; y >= 0; y -= 2) {
          if (!isBlankRow(pixels, canvas.width, y, xStep)) {
            usableH = Math.min(canvas.height, y + 8);
            break;
          }
        }
      }

      // Quantos pixels do canvas cabem numa página (mantendo a proporção).
      const pxPerPage = Math.max(1, Math.floor((canvas.width / contentW) * contentH));

      let sliceY = 0;
      let page = 0;
      while (sliceY < usableH) {
        if (page > 0) doc.addPage();

        // Cabeçalho da página (o "pág. X/N" à direita é escrito ao final,
        // quando já sabemos o total de páginas).
        doc.setFontSize(10);
        doc.setTextColor(30, 30, 30);
        doc.text(`MVP Veículos · ${reportTitle}`, margin, margin + 8);

        // Ponto de corte: tenta subir até uma linha em branco para não cortar
        // uma linha da tabela no meio.
        const hardCut = Math.min(sliceY + pxPerPage, usableH);
        let cut = hardCut;
        if (pixels && hardCut < usableH) {
          const minCut = sliceY + Math.floor(pxPerPage * (1 - SAFE_CUT_LOOKUP));
          cut = findSafeCut(pixels, canvas.width, hardCut, minCut, xStep);
        }
        const sliceH = cut - sliceY;
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

        sliceY = cut;
        page++;
      }

      // Numeração final "pág. X/N" agora que sabemos o total de páginas.
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Emitido em ${emittedAt} · pág. ${p}/${totalPages}`,
          pageW - margin,
          margin + 8,
          { align: "right" },
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
