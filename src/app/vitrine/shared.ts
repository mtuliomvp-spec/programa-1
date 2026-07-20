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
};

export async function getShowroomVehicles(): Promise<ShowroomVehicle[]> {
  const [vehicles, openPreSales] = await Promise.all([
    prisma.vehicle.findMany({
      where: { published: true, status: "ESTOQUE" },
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

export function vehicleTitle(v: ShowroomVehicle): string {
  return `${v.brand} ${v.model}${v.version ? ` ${v.version}` : ""} ${v.manufactureYear}/${v.modelYear}`;
}
