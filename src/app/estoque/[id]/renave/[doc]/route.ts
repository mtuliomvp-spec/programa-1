import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCompany } from "@/lib/company";
import { renaveWs, pdfDaResposta, type EstoqueRenave } from "@/lib/renave-ws";
import { lerAmbienteRenave, normalizarPlaca, normalizarRenavam } from "@/lib/renave-ws-dados";

export const maxDuration = 120;

/**
 * Documentos que o Renave-WS gera, buscados na hora no ambiente em uso:
 * atpv (ATPV-e), termo-entrada, termo-saida e codigo-crv (número de segurança
 * do CRV atual). Em homologação valem para o veículo de teste.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const user = await getSessionUser();
  if (!user || !(can(user, "estoque", "renavews") || can(user, "estoque", "renave"))) {
    return new Response("Acesso negado", { status: 403 });
  }
  const { id, doc } = await params;
  const company = await getCompany();
  const ambiente = lerAmbienteRenave(company.renaveWsAmbiente);
  if (!ambiente) return new Response("Integração com o Renave desligada.", { status: 404 });

  const [vehicle, reg] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id }, select: { plate: true, renavam: true } }),
    prisma.renaveRegistro.findUnique({ where: { vehicleId_ambiente: { vehicleId: id, ambiente } } }),
  ]);
  if (!vehicle) return new Response("Veículo não encontrado", { status: 404 });
  const mock = reg?.mock as { placa?: string; renavam?: string } | null;
  const placa = ambiente === "HOMOLOGACAO" ? (mock?.placa ?? "") : normalizarPlaca(vehicle.plate);
  const renavam = ambiente === "HOMOLOGACAO" ? (mock?.renavam ?? "") : normalizarRenavam(vehicle.renavam);
  const idEstoque = reg?.idEstoque ?? (reg?.estoque as EstoqueRenave | null)?.id ?? null;

  const r =
    doc === "atpv"
      ? await renaveWs.pdfAtpv(ambiente, placa, renavam)
      : doc === "codigo-crv"
        ? await renaveWs.pdfCodigoSegurancaCrv(ambiente, placa, renavam)
        : doc === "termo-entrada" && idEstoque
          ? await renaveWs.termoEntrada(ambiente, idEstoque)
          : doc === "termo-saida" && idEstoque
            ? await renaveWs.termoSaida(ambiente, idEstoque)
            : null;
  if (!r) return new Response("Documento indisponível", { status: 404 });
  if (!r.ok) return new Response(r.erro ?? "O Renave não devolveu o documento.", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const pdf = pdfDaResposta(r.body);
  if (!pdf) return new Response("O Renave não devolveu o PDF.", { status: 502 });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc}-${placa}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
