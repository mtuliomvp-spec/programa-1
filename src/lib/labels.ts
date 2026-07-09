import type { CategoriaCustoVeiculo } from "@prisma/client";

export const VEHICLE_COST_CATEGORY_LABEL: Record<CategoriaCustoVeiculo, string> = {
  PREPARACAO: "Preparação",
  DOCUMENTACAO: "Documentação",
  MECANICA: "Mecânica",
  FUNILARIA_PINTURA: "Funilaria e pintura",
  ESTETICA: "Estética",
  FRETE: "Frete",
  OUTROS: "Outros",
};
