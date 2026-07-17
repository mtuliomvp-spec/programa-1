"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export type OrdemPdfData = {
  fileName: string;
  companyName: string;
  companySub: string | null;
  title: string;
  generatedAt: string;
  valorLabel: string;
  valor: string;
  sections: { title: string; rows: [string, string][] }[];
  qrDataUrl: string;
  verifyUrl: string;
  footer: string;
};

/**
 * Gera e baixa o PDF da Ordem de Pagamento no próprio navegador (jsPDF), com o
 * QR Code de verificação embutido. Texto vetorial (não é foto da tela), então o
 * arquivo fica leve e nítido. Funciona no iPhone e no computador.
 */
export default function OrdemPdfButton({ data }: { data: OrdemPdfData }) {
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 42;
      const labelX = margin;
      const valueX = margin + 150;
      const valueW = pageW - valueX - margin;
      let y = 54;

      const ensure = (needed: number) => {
        if (y + needed > pageH - 70) {
          doc.addPage();
          y = 54;
        }
      };

      // Cabeçalho da empresa
      doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(15, 23, 42);
      doc.text(data.companyName, margin, y);
      y += 16;
      if (data.companySub) {
        doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100, 116, 139);
        doc.text(data.companySub, margin, y);
        y += 14;
      }
      doc.setDrawColor(15, 23, 42).setLineWidth(1.2);
      doc.line(margin, y, pageW - margin, y);
      y += 22;

      // Título do documento
      doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(15, 23, 42);
      doc.text(data.title, margin, y);
      y += 15;
      doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100, 116, 139);
      doc.text(data.generatedAt, margin, y);
      y += 22;

      // Seções (label/valor)
      for (const section of data.sections) {
        ensure(30);
        doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(71, 85, 105);
        doc.text(section.title.toUpperCase(), margin, y);
        y += 6;
        doc.setDrawColor(226, 232, 240).setLineWidth(0.6);
        doc.line(margin, y, pageW - margin, y);
        y += 14;

        for (const [label, value] of section.rows) {
          const lines = doc.splitTextToSize(value || "—", valueW) as string[];
          const rowH = Math.max(14, lines.length * 12);
          ensure(rowH);
          doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(100, 116, 139);
          doc.text(label, labelX, y);
          doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(15, 23, 42);
          doc.text(lines, valueX, y);
          y += rowH + 4;
        }
        y += 8;
      }

      // Valor a pagar (destaque)
      ensure(40);
      doc.setDrawColor(226, 232, 240).setLineWidth(0.6);
      doc.line(margin, y, pageW - margin, y);
      y += 20;
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(71, 85, 105);
      doc.text(data.valorLabel.toUpperCase(), margin, y);
      doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(15, 23, 42);
      doc.text(data.valor, pageW - margin, y, { align: "right" });
      y += 30;

      // QR Code + verificação
      ensure(120);
      const qrSize = 96;
      doc.addImage(data.qrDataUrl, "PNG", margin, y, qrSize, qrSize);
      doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(15, 23, 42);
      doc.text("Verificar autenticidade", margin + qrSize + 16, y + 20);
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(100, 116, 139);
      const urlLines = doc.splitTextToSize(data.verifyUrl, pageW - (margin + qrSize + 16) - margin) as string[];
      doc.text(urlLines, margin + qrSize + 16, y + 36);
      doc.text(
        "Aponte a câmera do celular para o QR Code para confirmar que este\ndocumento foi emitido pelo sistema.",
        margin + qrSize + 16,
        y + 36 + urlLines.length * 10 + 6,
      );

      // Rodapé
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(148, 163, 184);
      doc.text(data.footer, pageW / 2, pageH - 30, { align: "center" });

      doc.save(data.fileName);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" onClick={generate} disabled={busy}>
      {busy ? "Gerando..." : "📄 Exportar PDF"}
    </Button>
  );
}
