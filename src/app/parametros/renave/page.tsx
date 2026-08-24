import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import {
  RENAVE_NORMA,
  RENAVE_PRAZO_PADRAO,
  avisoDetranParado,
  detranStatusLabel,
  detranStatusOf,
  detranOperando,
  detranStatusTone,
  pendenciasCobraveis,
  prazoTexto,
} from "@/lib/renave";
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
  const comPendencia = vehicles.filter(
    (v) => pendenciasCobraveis(v, detranOperando(company.detranRenaveStatus)).length > 0,
  ).length;

  const config: RenaveConfig = {
    renaveAderido: company.renaveAderido,
    renaveAderidoEm: company.renaveAderidoEm?.toISOString() ?? null,
    renaveIntegradora: company.renaveIntegradora,
    renaveIntegradoraStatus: company.renaveIntegradoraStatus,
    renaveCnae: company.renaveCnae,
    renaveObservacoes: company.renaveObservacoes,
    detranRenaveStatus: company.detranRenaveStatus,
    detranRenaveCheckedAt: company.detranRenaveCheckedAt?.toISOString() ?? null,
    detranProtocolo: company.detranProtocolo,
    eCnpjValidUntil: company.eCnpjValidUntil?.toISOString() ?? null,
    renaveImplantacao: company.renaveImplantacao,
    renaveObrigatorioEm: company.renaveObrigatorioEm?.toISOString() ?? null,
  };

  const detran = detranStatusOf(company.detranRenaveStatus);

  const certVencido = company.eCnpjValidUntil
    ? company.eCnpjValidUntil.getTime() < agora.getTime()
    : false;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Renave"
        description={`Escrituração eletrônica de entrada e saída de veículos (${RENAVE_NORMA})`}
        action={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/parametros/renave/passo-a-passo">🧭 Passo a passo</LinkButton>
            <LinkButton href="/estoque/renave" variant="secondary">
              📒 Livro de entradas e saídas
            </LinkButton>
            <LinkButton href="/parametros" variant="secondary">
              ← Parâmetros
            </LinkButton>
          </div>
        }
      />

      {detran && detran !== "ADERIDO" ? (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-900">
            🛑 O Renave de usados ainda não opera {company.uf ? `no ${company.uf}` : "no seu estado"}
          </p>
          <p className="mt-0.5 text-xs text-rose-800">{avisoDetranParado(company.uf, detran)}</p>
          {company.detranProtocolo ? (
            <p className="mt-1 text-xs text-rose-800">
              Consulta protocolada no DETRAN: <strong>{company.detranProtocolo}</strong>.
            </p>
          ) : (
            <p className="mt-1 text-xs text-rose-800">
              Ainda sem protocolo de consulta ao DETRAN registrado aqui.
            </p>
          )}
        </div>
      ) : null}

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
            Integradora:{" "}
            <strong className="text-slate-900">{company.renaveIntegradora || "nenhuma informada"}</strong>
            {company.renaveIntegradora ? (
              <span className="ml-1.5 align-middle">
                {company.renaveIntegradoraStatus === "CONTRATADA" ? (
                  <Badge tone="success">Contratada</Badge>
                ) : (
                  <Badge tone="warning">Em avaliação</Badge>
                )}
              </span>
            ) : null}
          </p>
          <p>
            DETRAN {company.uf ? `do ${company.uf}` : "do estado"}:{" "}
            {detran ? (
              <>
                <Badge tone={detranStatusTone[detran]}>{detranStatusLabel[detran]}</Badge>
                {company.detranRenaveCheckedAt ? (
                  <span className="ml-1.5 text-xs text-slate-400">
                    conferido em {formatDate(company.detranRenaveCheckedAt)}
                  </span>
                ) : null}
              </>
            ) : (
              <strong className="text-slate-900">situação não conferida</strong>
            )}
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

      {company.renaveObservacoes ? (
        <Card className="mt-4">
          <CardHeader
            title="Anotações da implantação"
            description="O que a loja já apurou — fica também no passo a passo"
          />
          <p className="whitespace-pre-line p-5 text-sm text-slate-700">{company.renaveObservacoes}</p>
        </Card>
      ) : null}

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
          <li className="pt-1">
            <Link
              href="/parametros/renave/passo-a-passo"
              className="font-medium text-blue-700 hover:underline"
            >
              Ver o passo a passo completo (com prazos, o que perguntar à integradora e a rotina nova) →
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
