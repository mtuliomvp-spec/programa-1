import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { getCompany } from "@/lib/company";
import { lerNfeConfig } from "@/lib/nfe-config";
import { tomadorPorNome } from "@/lib/tomadores-nfse";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import NfsePainel, { type FinanceiraOpcao, type NotaServicoResumo } from "./NfsePainel";

export const dynamic = "force-dynamic";

/**
 * Notas de serviço (NFS-e, padrão nacional): a comissão sobre o retorno do
 * financiamento e sobre o seguro que a loja cobra dos bancos. O banco informa
 * o valor; aqui se emite a nota contra ele e se guarda DANFSe e XML.
 */
export default async function NfsePage() {
  await requireModule("financeiro");
  const [canEmitir, canCancelar, company, notas, contas] = await Promise.all([
    userCan("financeiro", "nfse"),
    userCan("financeiro", "nfsecancelar"),
    getCompany(),
    prisma.notaServico.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.financialAccount.findMany({
      where: { type: "FINANCEIRA", active: true },
      select: { id: true, name: true, nfseTomador: { select: { name: true, document: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const cfg = lerNfeConfig(company.nfeConfig);

  // Tomador = as financeiras de Contas e caixas; o CNPJ/razão social vêm do
  // cadastro fiscal ligado a cada uma (pedido na primeira emissão).
  // Sem vínculo ainda, mas reconhecida pelo nome entre os bancos das notas já
  // emitidas: já aparece com o CNPJ — o vínculo é feito sozinho ao emitir.
  const financeiras: FinanceiraOpcao[] = contas.map((c) => {
    const conhecido = c.nfseTomador ? null : tomadorPorNome(c.name);
    return {
      id: c.id,
      name: c.name,
      tomadorNome: c.nfseTomador?.name ?? conhecido?.nome ?? null,
      tomadorDocumento: c.nfseTomador?.document ?? conhecido?.cnpj ?? null,
    };
  });

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
          description="Tomador = a financeira (Contas e caixas). Na primeira nota de cada uma, o sistema pede o CNPJ"
        />
        <NfsePainel
          notas={resumo}
          financeiras={financeiras}
          canEmitir={canEmitir}
          canCancelar={canCancelar}
          homologacao={cfg.ambiente !== "PRODUCAO"}
        />
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        Financeira que não aparece na lista?{" "}
        <Link href="/financeiro/contas" className="font-medium text-blue-700 hover:underline">
          Cadastre em Contas e caixas
        </Link>{" "}
        com o tipo “Financeira”.
      </p>
    </div>
  );
}
