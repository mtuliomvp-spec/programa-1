import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import { RENAVE_NORMA, RENAVE_PRAZO_PADRAO, pendenciasRenave, prazoTexto } from "@/lib/renave";
import RenaveConfigForm, { type RenaveConfig } from "./RenaveConfigForm";

export const dynamic = "force-dynamic";

export default async function ParametrosRenavePage() {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) redirect("/");

  const company = await getCompany();
  const prazo = company.renaveObrigatorioEm ?? RENAVE_PRAZO_PADRAO;
  const agora = new Date();
  const diasParaPrazo = Math.ceil((prazo.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));

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
  const comPendencia = vehicles.filter((v) => pendenciasRenave(v).length > 0).length;

  const config: RenaveConfig = {
    renaveAderido: company.renaveAderido,
    renaveAderidoEm: company.renaveAderidoEm?.toISOString() ?? null,
    renaveIntegradora: company.renaveIntegradora,
    renaveCnae: company.renaveCnae,
    eCnpjValidUntil: company.eCnpjValidUntil?.toISOString() ?? null,
    renaveImplantacao: company.renaveImplantacao,
    renaveObrigatorioEm: company.renaveObrigatorioEm?.toISOString() ?? null,
  };

  const certVencido = company.eCnpjValidUntil
    ? company.eCnpjValidUntil.getTime() < agora.getTime()
    : false;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Renave"
        description={`Escrituração eletrônica de entrada e saída de veículos (${RENAVE_NORMA})`}
        action={
          <div className="flex gap-2">
            <LinkButton href="/estoque/renave" variant="secondary">
              📒 Livro de entradas e saídas
            </LinkButton>
            <LinkButton href="/parametros" variant="secondary">
              ← Parâmetros
            </LinkButton>
          </div>
        }
      />

      <Card className={diasParaPrazo <= 30 ? "border-amber-300" : ""}>
        <CardHeader
          title="Onde a loja está"
          action={
            company.renaveAderido ? (
              <Badge tone="success">Aderido</Badge>
            ) : (
              <Badge tone="warning">Sem adesão</Badge>
            )
          }
        />
        <div className="space-y-2 p-5 text-sm text-slate-600">
          <p>
            Obrigatoriedade a partir de <strong>{prazoTexto(prazo)}</strong>
            {diasParaPrazo >= 0 ? ` — faltam ${diasParaPrazo} dia(s).` : ` — prazo vencido há ${Math.abs(diasParaPrazo)} dia(s).`}
          </p>
          <p>
            Integradora contratada:{" "}
            <strong className="text-slate-900">{company.renaveIntegradora || "nenhuma informada"}</strong>
          </p>
          <p>
            Certificado e-CNPJ:{" "}
            {company.eCnpjValidUntil ? (
              <strong className={certVencido ? "text-rose-700" : "text-slate-900"}>
                válido até {formatDate(company.eCnpjValidUntil)}
                {certVencido ? " (vencido)" : ""}
              </strong>
            ) : (
              <strong className="text-slate-900">validade não informada</strong>
            )}
          </p>
          <p>
            Veículos em estoque com dados faltando para escriturar:{" "}
            <strong className={comPendencia > 0 ? "text-amber-700" : "text-emerald-700"}>{comPendencia}</strong>
          </p>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Configuração" />
        <div className="p-5">
          <RenaveConfigForm config={config} />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="O que a loja precisa fazer fora do sistema" />
        <ul className="space-y-2 p-5 text-sm text-slate-600">
          <li>
            <strong className="text-slate-900">1. Aderir ao Renave</strong> no sistema Credencia, com
            certificado e-CNPJ válido e CNAE compatível (arts. 7º e 8º). Pode ser direto ou pela integradora.
          </li>
          <li>
            <strong className="text-slate-900">2. Contratar uma integradora autorizada</strong> — é ela quem
            transmite os registros (art. 5º, III). O sistema não faz esse papel e não pode fazê-lo: provedores
            de sistema de gestão de lojas estão impedidos de atuar como integradoras (Anexo, item 1.3.2).
          </li>
          <li>
            <strong className="text-slate-900">3. Emitir NF-e</strong> nas entradas e saídas, com os dados
            batendo com o registro no Renave (art. 5º, VI). A chave da nota é guardada aqui na ficha do carro.
          </li>
          <li>
            <strong className="text-slate-900">4. Consignação por contrato eletrônico</strong> registrado no
            Renave, assinado digitalmente pelas duas partes (art. 20). O contrato impresso do sistema passa a
            ser registro interno.
          </li>
          <li>
            <strong className="text-slate-900">5. Manter o livro conferível</strong> — a recusa de exibição, o
            atraso ou a falta de escrituração é infração gravíssima (art. 25).
          </li>
        </ul>
      </Card>
    </div>
  );
}
