"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * Limites de segurança para o canvas gerado pelo html2canvas. Navegadores têm
 * um teto para a área/dimensão de um <canvas>; ao ultrapassar, a captura sai em
 * branco e o PDF "some". Mantemos folga confortável.
 */
const MAX_CANVAS_DIM = 8000;
const MAX_CANVAS_AREA = 20_000_000;

/** Percentual de uma página que aceitamos "subir" para achar um corte limpo. */
const SAFE_CUT_LOOKUP = 0.18;

/** Testa se a linha `y` do canvas é praticamente branca (gap entre linhas). */
function isBlankRow(data: Uint8ClampedArray, w: number, y: number, xStep: number): boolean {
  for (let x = 0; x < w; x += xStep) {
    const i = (y * w + x) * 4;
    if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) return false;
  }
  return true;
}

/** Do corte "duro", sobe até a linha em branco mais próxima (não corta no meio). */
function findSafeCut(data: Uint8ClampedArray, w: number, hardCut: number, minCut: number, xStep: number): number {
  for (let y = hardCut; y > minCut; y--) {
    if (isBlankRow(data, w, y, xStep)) return y;
  }
  return hardCut;
}

/**
 * Botão "PDF". Dois modos:
 * - `table`: monta um PDF TABULAR (texto de verdade) a partir das <table> que já
 *   existem no DOM da página — colunas limpas, sem botões/cards, e quebra de
 *   página só ENTRE linhas (nunca corta uma linha). Usado nas listas/relatórios.
 * - `document` (padrão): captura o conteúdo como imagem (html2canvas-pro, que
 *   entende as cores lab()/oklab() do Tailwind v4), em largura de desktop e
 *   fatiando nas faixas em branco para não cortar. Usado nos documentos
 *   (contratos, ordem de compra/pagamento).
 * Se `table` não achar nenhuma <table>, cai no modo `document`.
 */
export default function PrintButton({
  title,
  rootSelector = "main",
  mode = "document",
  label = "📄 PDF",
  subtitle,
}: {
  title?: string;
  rootSelector?: string;
  mode?: "table" | "document";
  /** Texto do botão (para conviver com mais de um PDF na mesma tela). */
  label?: string;
  /**
   * Subtítulo do PDF. Por padrão usa a descrição do cabeçalho da página; passe
   * "" para não sair nenhum (ex.: quando a descrição traz números que aquele
   * PDF não pode mostrar).
   */
  subtitle?: string;
}) {
  const [pending, setPending] = useState(false);

  function reportTitleOf(): string {
    return (
      title ||
      document.querySelector("main h1")?.textContent?.trim() ||
      document.title ||
      "Relatório"
    );
  }

  function fileNameOf(reportTitle: string): string {
    const slug =
      reportTitle
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "relatorio";
    return `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
  }

  // Estampa o cabeçalho (loja/título à esquerda, emissão/página à direita) em
  // todas as páginas, com a contagem final correta.
  function stampHeaders(doc: import("jspdf").jsPDF, reportTitle: string, margin: number) {
    const emittedAt = new Date().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const pageW = doc.internal.pageSize.getWidth();
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text(`MVP Veículos · ${reportTitle}`, margin, margin + 8);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Emitido em ${emittedAt} · pág. ${i}/${total}`, pageW - margin, margin + 8, {
        align: "right",
      });
    }
  }

  // jsPDF (fonte padrão) só desenha Latin-1; emojis/símbolos viram lixo ("Ø=Ý").
  // Remove emojis, setas e dingbats, mantendo acentos e pontuação comum.
  const stripSymbols = (s: string) =>
    s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "");
  const collapse = (s: string | null | undefined) =>
    stripSymbols(s || "").replace(/\s+/g, " ").trim();
  // Texto da célula juntando os filhos com espaço — assim "R$ 0,00" e o span em
  // bloco "de R$ 60.000" não colam (innerText não serve: a tabela desktop fica
  // display:none no celular e não calcula layout).
  const textOf = (el: Element | null | undefined): string => {
    if (!el) return "";
    if (el.childElementCount === 0) return collapse(el.textContent);
    const parts: string[] = [];
    el.childNodes.forEach((n) => {
      const t = (n.textContent || "").replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
    });
    return collapse(parts.join(" "));
  };

  /**
   * Marcado para ficar de fora do PDF. Para no `root`: quando o botão aponta
   * explicitamente para um contêiner, o que vale é o que está DENTRO dele —
   * é assim que um bloco `data-no-pdf` (invisível ao PDF geral) pode ser a
   * origem de um PDF próprio.
   */
  function insidePrintHidden(el: Element, root: Element): boolean {
    let node: Element | null = el;
    while (node && node !== root) {
      if (node.classList?.contains("print:hidden") || node.hasAttribute?.("data-no-pdf")) return true;
      node = node.parentElement;
    }
    return false;
  }

  // ---- Modo TABELA: lê as <table> do DOM e desenha uma tabela limpa. ----
  async function generateTable(): Promise<boolean> {
    const root = (document.querySelector(rootSelector) as HTMLElement | null) ?? document.body;
    const tables = Array.from(root.querySelectorAll("table")).filter((t) => !insidePrintHidden(t, root));
    if (tables.length === 0) return false;

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 28;
    const headerH = 26;
    const contentW = pageW - margin * 2;
    const contentTop = margin + headerH;
    const pageBottom = pageH - margin;
    let y = contentTop;

    const reportTitle = reportTitleOf();

    // Subtítulo: o informado ou, por padrão, a descrição da PageHeader.
    const h1 = document.querySelector("main h1");
    const desc = subtitle !== undefined ? subtitle : textOf(h1?.parentElement?.querySelector("p"));
    if (desc) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      const lines = doc.splitTextToSize(desc, contentW);
      doc.text(lines, margin, y);
      y += lines.length * 11 + 6;
    }

    for (const table of tables) {
      const ths = Array.from(table.querySelectorAll("thead th"));
      // Índices de coluna a manter (descarta cabeçalho vazio — ex.: "Ver detalhes").
      const keep: number[] = [];
      const heads: { label: string; right: boolean }[] = [];
      ths.forEach((th, i) => {
        const label = textOf(th);
        if (label) {
          keep.push(i);
          heads.push({ label, right: th.className.includes("text-right") });
        }
      });
      if (keep.length === 0) continue;

      const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
      const rows: string[][] = bodyRows.map((tr) => {
        const tds = Array.from(tr.querySelectorAll("td"));
        return keep.map((i) => textOf(tds[i]));
      });
      if (rows.length === 0) continue;

      // Larguras: proporcionais ao maior conteúdo por coluna (com teto).
      doc.setFontSize(8);
      const maxCol = contentW * 0.32;
      const weights = heads.map((h, c) => {
        let w = doc.getTextWidth(h.label);
        for (const r of rows) w = Math.max(w, doc.getTextWidth(r[c] || ""));
        return Math.min(w + 12, maxCol);
      });
      const sum = weights.reduce((a, b) => a + b, 0) || 1;
      const widths = weights.map((w) => (w / sum) * contentW);

      const drawHeaderRow = () => {
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y, contentW, 18, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        let x = margin;
        heads.forEach((h, c) => {
          const tx = h.right ? x + widths[c] - 4 : x + 4;
          doc.text(h.label, tx, y + 12, { align: h.right ? "right" : "left", maxWidth: widths[c] - 8 });
          x += widths[c];
        });
        y += 18;
      };

      drawHeaderRow();
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);

      for (const r of rows) {
        // Altura da linha = maior nº de linhas quebradas entre as células.
        const wrapped = r.map((cell, c) => doc.splitTextToSize(cell || "", widths[c] - 8));
        const lineCount = Math.max(1, ...wrapped.map((w) => w.length));
        const rowH = lineCount * 9 + 6;
        if (y + rowH > pageBottom) {
          doc.addPage();
          y = contentTop;
          drawHeaderRow();
          doc.setFont("helvetica", "normal");
          doc.setTextColor(30, 41, 59);
        }
        let x = margin;
        wrapped.forEach((cellLines, c) => {
          const tx = heads[c].right ? x + widths[c] - 4 : x + 4;
          doc.text(cellLines, tx, y + 10, { align: heads[c].right ? "right" : "left" });
          x += widths[c];
        });
        y += rowH;
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y, margin + contentW, y);
      }
      y += 16;
      if (y > pageBottom - 40 && table !== tables[tables.length - 1]) {
        doc.addPage();
        y = contentTop;
      }
    }

    stampHeaders(doc, reportTitle, margin);
    doc.save(fileNameOf(reportTitle));
    return true;
  }

  // ---- Modo DOCUMENTO: imagem (largura de desktop) + corte inteligente. ----
  async function generateDocument() {
    const root = (document.querySelector(rootSelector) as HTMLElement | null) ?? document.body;
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas-pro"),
      import("jspdf"),
    ]);

    // Largura de captura: a maior entre a largura visível e a tabela mais larga
    // (que pode transbordar um contêiner com rolagem horizontal). Força layout
    // desktop (media queries reavaliadas), consistente a partir de telas estreitas.
    const tables = Array.from(root.querySelectorAll("table"));
    const widestTable = tables.reduce((m, t) => Math.max(m, t.scrollWidth), 0);
    const desiredWidth = Math.max(root.clientWidth, widestTable + 48);
    const windowWidth = Math.max(1024, desiredWidth);
    const estHeight = root.scrollHeight;
    // Escala alvo 2×, reduzida para nunca estourar o teto de canvas do navegador.
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
      width: windowWidth,
      windowWidth,
      backgroundColor: "#ffffff",
      useCORS: true,
      ignoreElements: (el) => el.classList?.contains("print:hidden") || el.hasAttribute?.("data-no-pdf"),
      onclone: (clonedDoc) => {
        const clonedRoot = clonedDoc.querySelector(rootSelector) as HTMLElement | null;
        if (!clonedRoot) return;
        // Expande contêineres com rolagem (overflow-x-auto das tabelas) para
        // capturar o conteúdo inteiro, sem recorte horizontal.
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

    const reportTitle = reportTitleOf();
    // Paisagem quando o conteúdo é claramente mais largo do que alto.
    const landscape = canvas.width / canvas.height > 1.3;
    const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 24;
    const headerH = 26;
    const contentW = pageW - margin * 2;
    const contentTop = margin + headerH;
    const contentH = pageH - contentTop - margin;

    const ctxFull = canvas.getContext("2d");
    let pixels: Uint8ClampedArray | null = null;
    try {
      pixels = ctxFull?.getImageData(0, 0, canvas.width, canvas.height).data ?? null;
    } catch {
      pixels = null;
    }
    const xStep = Math.max(1, Math.floor(canvas.width / 60));

    // Altura útil (corta o rodapé em branco).
    let usableH = canvas.height;
    if (pixels) {
      for (let y = canvas.height - 1; y >= 0; y -= 2) {
        if (!isBlankRow(pixels, canvas.width, y, xStep)) {
          usableH = Math.min(canvas.height, y + 8);
          break;
        }
      }
    }

    const pxPerPage = Math.max(1, Math.floor((canvas.width / contentW) * contentH));

    let sliceY = 0;
    let page = 0;
    while (sliceY < usableH) {
      if (page > 0) doc.addPage();
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
      doc.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, contentTop, contentW, imgH);

      sliceY = cut;
      page++;
    }

    stampHeaders(doc, reportTitle, margin);
    doc.save(fileNameOf(reportTitle));
  }

  async function generate() {
    setPending(true);
    try {
      if (mode === "table") {
        const ok = await generateTable();
        if (!ok) await generateDocument();
      } else {
        await generateDocument();
      }
    } catch {
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
      {pending ? "Gerando PDF…" : label}
    </Button>
  );
}
