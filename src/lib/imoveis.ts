/**
 * Imóveis: categorias dos documentos e rótulos (arquivo puro, usado nas telas
 * e nas actions).
 */

export const CATEGORIAS_ANEXO_IMOVEL = [
  { key: "ESCRITURA", label: "Escritura / registro / matrícula", porAno: false },
  { key: "PLANTA", label: "Planta / georreferenciamento", porAno: false },
  { key: "ITR_DECLARACAO", label: "Declaração do ITR", porAno: true },
  { key: "ITR_RECIBO", label: "Recibo de entrega do ITR", porAno: true },
  { key: "DARF", label: "DARF / guia de imposto", porAno: true },
  { key: "COMPROVANTE", label: "Comprovante de pagamento", porAno: true },
  { key: "CONTRATO", label: "Contrato (arrendamento, prestação de serviço…)", porAno: false },
  { key: "OUTRO", label: "Outro documento", porAno: false },
] as const;

export type CategoriaAnexoImovel = (typeof CATEGORIAS_ANEXO_IMOVEL)[number]["key"];

export const CATEGORIA_ANEXO_KEYS = CATEGORIAS_ANEXO_IMOVEL.map((c) => c.key) as [
  CategoriaAnexoImovel,
  ...CategoriaAnexoImovel[],
];

export const rotuloCategoriaAnexo = (k: string) =>
  CATEGORIAS_ANEXO_IMOVEL.find((c) => c.key === k)?.label ?? "Outro documento";

export const TIPOS_IMOVEL = [
  { key: "RURAL", label: "Rural (ITR)" },
  { key: "URBANO", label: "Urbano (IPTU)" },
] as const;

/**
 * Tamanho de cada parte do upload. A hospedagem recusa requisições acima de
 * ~4,5 MB; 3 MB deixa folga para o resto do formulário.
 */
export const PARTE_UPLOAD_IMOVEL = 3 * 1024 * 1024;
/** Teto de um documento (registro de cartório escaneado chega a dezenas de MB). */
export const MAX_ANEXO_IMOVEL = 60 * 1024 * 1024;
