import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { getCompany } from "@/lib/company";
import { lerNfeConfig } from "@/lib/nfe-config";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import NfsePainel, { type NotaServicoResumo, type TomadorOpcao } from "./NfsePainel";

export const dynamic = "force-dynamic";

/**
 * Notas de serviço (NFS-e, padrão nacional): a comissão sobre o retorno do
 * financiamento e sobre o seguro que a loja cobra dos bancos. O banco informa
 * o valor; aqui se emite a nota contra ele e se guarda DANFSe e XML.
 */
export default async function NfsePage() {
  await requireModule("financeiro");
  const [canEmitir, canCancelar, company, notas, clientes] = await Promise.all([
    userCan("financeiro", "nfse"),
    userCan("financeiro", "nfsecancelar"),
    getCompany(),
    prisma.notaServico.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.customer.findMany({
      where: { document: { not: null } },
      select: { id: true, name: true, document: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const cfg = lerNfeConfig(company.nfeConfig);

  // Tomador da comissão é banco/seguradora: só cadastros com CNPJ.
  const tomadores: TomadorOpcao[] = clientes
    .filter((c) => (c.document ?? "").replace(/\D/g, "").length === 14)
    .map((c) => ({ id: c.id, name: c.name, document: c.document ?? "" }));

  const resumo: NotaServicoResumo[] = notas.map((n) => ({
    id: n.id,
    ambiente: n.ambiente,
    status: n.status,
    tomadorNome: n.tomadorNome,
    tomadorDocumento: n.tomadorDocumento,
    descricao: n.descricao,
    valor: n.valor,
    competencia: n.competencia.toISOString().slice(0, 10),
    numero: n.numero,
    codigoVerificacao: n.codigoVerificacao,
    url: n.url,
    temDanfse: !!n.urlDanfse,
    temXml: !!n.caminhoXml,
    mensagem: n.mensagem,
    createdAt: n.createdAt.toISOString(),
    emitidaPor: n.emitidaPor,
    justificativaCancelamento: n.justificativaCancelamento,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Notas de serviço (NFS-e)"
        description="Comissão sobre o retorno do financiamento e sobre o seguro — o banco informa o valor e a nota sai contra ele"
        action={
          <LinkButton href="/parametros/nfe" variant="secondary">
            ⚙️ Configuração
          </LinkButton>
        }
      />
      {cfg.ambiente !== "PRODUCAO" ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Ambiente de <strong>homologação (teste)</strong>: as notas não têm valor fiscal. O ambiente é o mesmo
          da NF-e, em Parâmetros → Nota fiscal (NF-e).
        </p>
      ) : null}
      <Card>
        <CardHeader
          title="Emitir e acompanhar"
          description="Tomador = o banco/seguradora (cadastrado como cliente, pelo CNPJ)"
        />
        <NfsePainel
          notas={resumo}
          tomadores={tomadores}
          canEmitir={canEmitir}
          canCancelar={canCancelar}
          homologacao={cfg.ambiente !== "PRODUCAO"}
        />
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Banco que não aparece na lista?{" "}
        <Link href="/clientes/novo" className="font-medium text-blue-700 hover:underline">
          Cadastre como cliente
        </Link>{" "}
        com o CNPJ — o botão “Buscar dados pelo CNPJ” traz razão social e endereço.
      </p>
    </div>
  );
}
