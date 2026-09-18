import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/permissions";
import { LinkButton, PageHeader } from "@/components/ui";
import {
  RENAVE_NORMA,
  RENAVE_PRODUCAO_ASSISTIDA,
  detranOperando,
  pendenciasCobraveis,
  prazoTexto,
} from "@/lib/renave";
import Assistente, { type AssistenteDados } from "./Assistente";

export const dynamic = "force-dynamic";

/**
 * Assistente de preenchimento do Renave: o que é para preencher DENTRO do
 * sistema, na ordem, com o porquê de cada campo e salvando passo a passo.
 *
 * O passo a passo cuida do que a loja faz fora (contador, integradora, DETRAN);
 * aqui é a digitação — que antes estava espalhada entre Parâmetros e a ficha de
 * cada veículo, sem ordem nem explicação de para que serve cada dado.
 */
export default async function RenaveAssistentePage() {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) redirect("/");

  const company = await getCompany();
  const vehicles = await prisma.vehicle.findMany({
    where: { intermediation: false, status: { not: "VENDIDO" } },
    select: {
      status: true,
      consigned: true,
      intermediation: true,
      chassi: true,
      renavam: true,
      renaveSituacao: true,
      renaveEntradaTitulo: true,
      renaveEntradaProtocolo: true,
      renaveEntradaEm: true,
      entryNfeKey: true,
      renavePreviaTipo: true,
      renaveAssinaturaTipo: true,
      crvNumber: true,
      crvSecurityCode: true,
      consignContractId: true,
      consignContractAt: true,
      renaveSaidaTitulo: true,
      renaveSaidaProtocolo: true,
      exitNfeKey: true,
    },
  });
  const operando = detranOperando(company.detranRenaveStatus);
  const comPendencia = vehicles.filter((v) => pendenciasCobraveis(v, operando).length > 0).length;

  const dados: AssistenteDados = {
    renaveAderido: company.renaveAderido,
    renaveAderidoEm: company.renaveAderidoEm?.toISOString() ?? null,
    renaveAdesaoSolicitadaEm: company.renaveAdesaoSolicitadaEm?.toISOString() ?? null,
    renaveAdesaoProtocolo: company.renaveAdesaoProtocolo,
    renaveAdesaoSei: company.renaveAdesaoSei,
    renaveIntegradora: company.renaveIntegradora,
    renaveIntegradoraStatus: company.renaveIntegradoraStatus,
    renaveCnae: company.renaveCnae,
    eCnpjValidUntil: company.eCnpjValidUntil?.toISOString() ?? null,
    detranRenaveStatus: company.detranRenaveStatus,
    detranRenaveCheckedAt: company.detranRenaveCheckedAt?.toISOString() ?? null,
    detranProtocolo: company.detranProtocolo,
    renaveObrigatorioEm: company.renaveObrigatorioEm?.toISOString() ?? null,
    renaveImplantacao: company.renaveImplantacao,
    renaveObservacoes: company.renaveObservacoes,
    uf: company.uf ?? null,
    veiculosComPendencia: comPendencia,
    veiculosEmEstoque: vehicles.length,
    producaoAssistida: prazoTexto(RENAVE_PRODUCAO_ASSISTIDA),
    hoje: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Renave — assistente de preenchimento"
        description={`O que preencher no sistema, na ordem, e para que serve cada dado (${RENAVE_NORMA})`}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/parametros/renave/passo-a-passo" variant="secondary">
              🧭 Passo a passo
            </LinkButton>
            <LinkButton href="/parametros/renave" variant="secondary">
              ← Renave
            </LinkButton>
          </div>
        }
      />
      <Assistente dados={dados} />
    </div>
  );
}
