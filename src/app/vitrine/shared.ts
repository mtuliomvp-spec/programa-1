import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Consultas e helpers da vitrine pública. Só saem daqui dados de ANÚNCIO
 * (nunca custos, placa completa ou documentos): veículos POSTADOS
 * (published), em ESTOQUE e sem pré-venda aberta.
 */

export type ShowroomVehicle = {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  manufactureYear: number;
  modelYear: number;
  km: number;
  color: string | null;
  fuel: string | null;
  transmission: string | null;
  salePrice: number;
  photoIds: string[];
  // Anúncio: destaque promocional + campos ocultos (vazio = mostra tudo).
  adPromo: string | null;
  adHiddenFields: string[];
  // Data da postagem na vitrine (selo "Chegou agora" nos primeiros dias).
  publishedAt: Date | null;
};

export async function getShowroomVehicles(): Promise<ShowroomVehicle[]> {
  const [vehicles, openPreSales] = await Promise.all([
    prisma.vehicle.findMany({
      where: { published: true, status: "ESTOQUE", intermediation: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        brand: true,
        model: true,
        version: true,
        manufactureYear: true,
        modelYear: true,
        km: true,
        color: true,
        fuel: true,
        transmission: true,
        salePrice: true,
        adPromo: true,
        adHiddenFields: true,
        publishedAt: true,
        attachments: {
          where: { kind: "FOTO_VEICULO" },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        },
      },
    }),
    prisma.preSale.findMany({ where: { status: "ABERTA" }, select: { vehicleId: true } }),
  ]);
  const preSold = new Set(openPreSales.map((p) => p.vehicleId));
  return vehicles
    .filter((v) => !preSold.has(v.id))
    .map(({ attachments, ...v }) => ({ ...v, photoIds: attachments.map((a) => a.id) }));
}

export async function getShowroomVehicle(id: string): Promise<ShowroomVehicle | null> {
  const all = await getShowroomVehicles();
  return all.find((v) => v.id === id) ?? null;
}

/** Link do WhatsApp da loja (wa.me) com mensagem pré-preenchida; null sem telefone. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

// Siglas de marca/modelo que ficam em MAIÚSCULAS na exibição.
const SIGLAS = new Set(["vw", "gm", "bmw", "byd", "jac", "gwm", "ram", "kia", "mini", "jeep", "ma"]);
const MINUSCULAS = new Set(["de", "da", "do", "e"]);

/**
 * Nome de exibição padronizado para a vitrine: "vw polo track ma" →
 * "VW Polo Track MA". Siglas conhecidas e palavras com número ficam em
 * maiúsculas (HB20, T-CROSS não: só o dígito força caixa alta da palavra
 * curta); o resto vira Inicial Maiúscula. Não altera o dado cadastrado.
 */
export function displayName(...parts: (string | null | undefined)[]): string {
  const raw = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return raw
    .split(" ")
    .map((w) => {
      const low = w.toLowerCase();
      if (SIGLAS.has(low)) return w.toUpperCase();
      if (MINUSCULAS.has(low)) return low;
      if (/\d/.test(w) && w.length <= 4) return w.toUpperCase(); // hb20, s10, c4
      return w
        .split("-")
        .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
        .join("-");
    })
    .join(" ");
}

export function vehicleTitle(v: ShowroomVehicle): string {
  return `${displayName(v.brand, v.model, v.version)} ${v.manufactureYear}/${v.modelYear}`;
}

/** Postado há até 7 dias → selo "Chegou agora". */
export function isNewArrival(v: ShowroomVehicle): boolean {
  if (!v.publishedAt) return false;
  return Date.now() - v.publishedAt.getTime() <= 7 * 24 * 60 * 60 * 1000;
}

/** Veículos parecidos: mesma marca ou preço até ±30%, mais baratos primeiro. */
export function similarVehicles(all: ShowroomVehicle[], current: ShowroomVehicle, max = 3): ShowroomVehicle[] {
  return all
    .filter(
      (v) =>
        v.id !== current.id &&
        (v.brand.toLowerCase() === current.brand.toLowerCase() ||
          Math.abs(v.salePrice - current.salePrice) <= current.salePrice * 0.3),
    )
    .sort((a, b) => Math.abs(a.salePrice - current.salePrice) - Math.abs(b.salePrice - current.salePrice))
    .slice(0, max);
}
