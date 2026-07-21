import type { GlobalParecer, VehicleParecer, ParecerMeta, Risco } from "@/lib/parecer-ia";

/**
 * Renderização client-side (jsPDF) do Parecer IA. Recebe o parecer estruturado
 * devolvido pela IA e monta um PDF formatado, baixado no navegador.
 */

type Doc = import("jspdf").jsPDF;

const CONCLUSAO_LABEL: Record<string, { texto: string; cor: [number, number, number] }> = {
  saudavel: { texto: "SAUDÁVEL", cor: [22, 163, 74] },
  atencao: { texto: "ATENÇÃO", cor: [217, 119, 6] },
  critico: { texto: "CRÍTICO", cor: [220, 38, 38] },
  manter: { texto: "MANTER ESTRATÉGIA", cor: [22, 163, 74] },
  revisar_preco: { texto: "REVISAR PREÇO", cor: [217, 119, 6] },
  priorizar_venda: { texto: "PRIORIZAR VENDA", cor: [220, 38, 38] },
};

const SEV_COR: Record<Risco["severidade"], [number, number, number]> = {
  baixa: [22, 163, 74],
  media: [217, 119, 6],
  alta: [220, 38, 38],
};

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

async function newDoc(): Promise<Doc> {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
}

/** Helper de layout: escreve seções e listas com quebra de página. */
function makeWriter(doc: Doc) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentW = pageW - margin * 2;
  let y = 54;

  const ensure = (needed: number) => {
    if (y + needed > pageH - 60) {
      doc.addPage();
      y = 54;
    }
  };

  return {
    heading(company: string, title: string, meta: ParecerMeta) {
      doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(15, 23, 42);
      doc.text(company, margin, y);
      y += 18;
      doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(79, 70, 229);
      doc.text(title, margin, y);
      y += 14;
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(100, 116, 139);
      doc.text(`Gerado em ${fmtDate(meta.geradoEm)} · IA: ${meta.modelo}`, margin, y);
      y += 12;
      doc.setDrawColor(15, 23, 42).setLineWidth(1.2);
      doc.line(margin, y, pageW - margin, y);
      y += 20;
    },
    section(titulo: string, texto: string) {
      if (!texto) return;
      ensure(30);
      doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(30, 41, 59);
      doc.text(titulo.toUpperCase(), margin, y);
      y += 6;
      doc.setDrawColor(226, 232, 240).setLineWidth(0.6);
      doc.line(margin, y, pageW - margin, y);
      y += 14;
      doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(texto, contentW) as string[];
      for (const ln of lines) {
        ensure(13);
        doc.text(ln, margin, y);
        y += 13;
      }
      y += 8;
    },
    riscos(lista: Risco[]) {
      if (!lista.length) return;
      ensure(30);
      doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(30, 41, 59);
      doc.text("RISCOS", margin, y);
      y += 6;
      doc.setDrawColor(226, 232, 240).setLineWidth(0.6);
      doc.line(margin, y, pageW - margin, y);
      y += 14;
      for (const r of lista) {
        const [cr, cg, cb] = SEV_COR[r.severidade];
        const lines = doc.splitTextToSize(r.descricao, contentW - 60) as string[];
        ensure(Math.max(14, lines.length * 12));
        doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(cr, cg, cb);
        doc.text(r.severidade.toUpperCase(), margin, y);
        doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(51, 65, 85);
        let yy = y;
        for (const ln of lines) {
          doc.text(ln, margin + 56, yy);
          yy += 12;
        }
        y = yy + 4;
      }
      y += 6;
    },
    lista(titulo: string, itens: string[]) {
      if (!itens.length) return;
      ensure(30);
      doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(30, 41, 59);
      doc.text(titulo.toUpperCase(), margin, y);
      y += 6;
      doc.setDrawColor(226, 232, 240).setLineWidth(0.6);
      doc.line(margin, y, pageW - margin, y);
      y += 14;
      doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(51, 65, 85);
      for (const it of itens) {
        const lines = doc.splitTextToSize(it, contentW - 14) as string[];
        ensure(Math.max(13, lines.length * 12));
        doc.text("•", margin, y);
        let yy = y;
        for (const ln of lines) {
          doc.text(ln, margin + 12, yy);
          yy += 12;
        }
        y = yy + 3;
      }
      y += 8;
    },
    conclusao(chave: string) {
      const c =
        CONCLUSAO_LABEL[chave] || { texto: chave.toUpperCase(), cor: [30, 41, 59] as [number, number, number] };
      ensure(40);
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentW, 30, "F");
      doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(71, 85, 105);
      doc.text("CONCLUSÃO", margin + 10, y + 19);
      doc.setTextColor(c.cor[0], c.cor[1], c.cor[2]);
      doc.text(c.texto, pageW - margin - 10, y + 19, { align: "right" });
      y += 40;
    },
    footer(meta: ParecerMeta) {
      const total = doc.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(148, 163, 184);
        doc.text(`Parecer IA · ${meta.empresa} · hash ${meta.hash}`, margin, pageH - 28);
        doc.text(`Pág. ${i}/${total}`, pageW - margin, pageH - 28, { align: "right" });
      }
    },
  };
}

export async function renderGlobalParecerPdf(parecer: GlobalParecer, meta: ParecerMeta): Promise<void> {
  const doc = await newDoc();
  const w = makeWriter(doc);
  w.heading(meta.empresa, "Parecer IA — Gestão geral da loja", meta);
  w.section("Resumo executivo", parecer.resumo_executivo);
  w.section("Análise financeira", parecer.analise_financeira);
  w.section("Análise de estoque", parecer.analise_estoque);
  w.section("Análise de vendas", parecer.analise_vendas);
  w.section("Análise de caixa", parecer.analise_caixa);
  w.riscos(parecer.riscos);
  w.lista("Recomendações", parecer.recomendacoes);
  w.conclusao(parecer.conclusao);
  w.footer(meta);
  doc.save(`parecer-geral-${meta.geradoEm.slice(0, 10)}.pdf`);
}

export async function renderVehicleParecerPdf(
  parecer: VehicleParecer,
  meta: ParecerMeta,
  vehicleLabel: string,
  plate: string,
): Promise<void> {
  const doc = await newDoc();
  const w = makeWriter(doc);
  w.heading(meta.empresa, `Parecer IA — ${vehicleLabel} (${plate})`, meta);
  w.section("Resumo executivo", parecer.resumo_executivo);
  w.section("Análise de precificação", parecer.analise_precificacao);
  w.section("Análise de estoque / giro", parecer.analise_estoque);
  w.riscos(parecer.riscos);
  w.lista("Recomendações", parecer.recomendacoes);
  w.conclusao(parecer.conclusao);
  w.footer(meta);
  doc.save(`parecer-veiculo-${plate}.pdf`);
}
