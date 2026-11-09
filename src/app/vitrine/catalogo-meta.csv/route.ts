import { getBaseUrl } from "@/lib/base-url";
import { getCompany } from "@/lib/company";
import { cidadeDaLoja } from "@/lib/loja-local";
import { nomeDaLoja } from "@/lib/nome-loja";
import { getShowroomVehicles, vehicleTitle } from "../shared";

export const dynamic = "force-dynamic";

/**
 * CATÁLOGO da Meta (Facebook e Instagram): os carros da vitrine num feed CSV
 * no formato de catálogo de produtos do Gerenciador de Comércio. A loja
 * cadastra este link como fonte de dados com atualização diária; os anúncios
 * de catálogo (Advantage+) mostram cada carro com foto, preço e o link do
 * anúncio no site.
 *
 * Entram só os carros que estão NO AR na vitrine (postados, em estoque, sem
 * pré-venda), com foto e com o preço visível — a Meta exige preço e imagem.
 * Repasse fica de fora (é negócio entre lojas). O `id` é o mesmo que o Pixel
 * manda no ViewContent, para a Meta ligar a visita ao item do catálogo.
 */
export async function GET() {
  const [veiculos, company, base] = await Promise.all([
    getShowroomVehicles(),
    getCompany().catch(() => null),
    getBaseUrl(),
  ]);
  const loja = nomeDaLoja(company);
  const cidade = cidadeDaLoja(company);

  const colunas = [
    "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "link",
    "image_link",
    "additional_image_link",
    "brand",
    "custom_label_0",
    "custom_label_1",
    "custom_label_2",
  ];
  const linhas = veiculos
    .filter((v) => !v.repasse && v.photoIds.length > 0 && !v.adHiddenFields.includes("preco") && v.salePrice > 0)
    .map((v) => {
      const titulo = vehicleTitle(v);
      const detalhes = [
        `${v.km.toLocaleString("pt-BR")} km`,
        v.color,
        v.fuel,
        v.transmission ? `câmbio ${v.transmission.toLowerCase()}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const descricao =
        `${titulo} seminovo à venda na ${loja}${cidade ? ` em ${cidade}` : ""}. ${detalhes}.` +
        (v.adPromo ? ` ${v.adPromo}.` : "") +
        " Fale com a equipe pelo WhatsApp.";
      return [
        v.id,
        titulo.slice(0, 150),
        descricao.slice(0, 5000),
        "in stock",
        "used",
        `${v.salePrice.toFixed(2)} BRL`,
        `${base}/vitrine/${v.id}?utm_source=meta&utm_medium=catalogo`,
        `${base}/vitrine/foto/${v.photoIds[0]}`,
        v.photoIds
          .slice(1, 11)
          .map((f) => `${base}/vitrine/foto/${f}`)
          .join(","),
        v.brand,
        // Rótulos para separar conjuntos de produtos na Meta (por ano, faixa
        // de km e faixa de preço).
        String(v.modelYear),
        v.km <= 30000 ? "ate 30 mil km" : v.km <= 80000 ? "30 a 80 mil km" : "acima de 80 mil km",
        v.salePrice <= 50000 ? "ate 50 mil" : v.salePrice <= 100000 ? "50 a 100 mil" : "acima de 100 mil",
      ];
    });

  const csv = [colunas, ...linhas].map((l) => l.map(celula).join(",")).join("\n") + "\n";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "public, max-age=900",
    },
  });
}

/** Célula CSV: sempre entre aspas, aspas internas dobradas, sem quebra de linha. */
function celula(v: string): string {
  return `"${String(v ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""')}"`;
}
