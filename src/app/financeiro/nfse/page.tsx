import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModule, userCan } from "@/lib/guards";
import { getCompany } from "@/lib/company";
import { lerNfeConfig } from "@/lib/nfe-config";
import { TOMADORES_CONHECIDOS, tomadorPorCnpj, tomadorPorNome, tomadorSeguroDe } from "@/lib/tomadores-nfse";
import { docKey } from "@/lib/person-keys";
import { Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import NfsePainel, { type BancoSemConta, type FinanceiraOpcao, type NotaServicoResumo, type RetornoOpcao } from "./NfsePainel";

export const dynamic = "force-dynamic";

/**
 * Notas de serviço (NFS-e, padrão nacional): a comissão sobre o retorno do
 * financiamento e sobre o seguro que a loja cobra dos bancos. O banco informa
 * o valor; aqui se emite a nota contra ele e se guarda DANFSe e XML.
 */
export default async function NfsePage() {
  await requireModule("financeiro");
  const [canEmitir, canCancelar, canContas, company, notas, contas, vendas] = await Promise.all([
    userCan("financeiro", "nfse"),
    userCan("financeiro", "nfsecancelar"),
    userCan("financeiro", "contas"),
    getCompany(),
    prisma.notaServico.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.financialAccount.findMany({
      where: { type: "FINANCEIRA", active: true },
      select: {
        id: true,
        name: true,
        nfseTomadorId: true,
        nfseTomador: { select: { name: true, document: true } },
        nfseTomadorSeguro: { select: { name: true, document: true } },
      },
      orderBy: { name: "asc" },
    }),
    // Retornos das vendas financiadas — o que a nota de comissão cobre.
    prisma.sale.findMany({
      where: {
        status: "CONCLUIDA",
        paymentMethod: "FINANCIADO",
        financerAccountId: { not: null },
        OR: [{ returnNet: { gt: 0 } }, { insuranceSold: true }],
      },
      orderBy: { saleDate: "desc" },
      take: 600,
      select: {
        id: true,
        saleDate: true,
        financerAccountId: true,
        returnNet: true,
        returnPaidAmount: true,
        returnSettledAt: true,
        returnNfseId: true,
        returnNfse: { select: { status: true } },
        insuranceSold: true,
        insuranceCommissionAmount: true,
        insuranceSettledAt: true,
        insuranceNfseId: true,
        insuranceNfse: { select: { status: true } },
        customer: { select: { name: true } },
        vehicle: { select: { model: true, plate: true } },
      },
    }),
  ]);
  const cfg = lerNfeConfig(company.nfeConfig);

  // Tomador = as financeiras de Contas e caixas; o CNPJ/razão social vêm do
  // cadastro fiscal ligado a cada uma (pedido na primeira emissão).
  // Sem vínculo ainda, mas reconhecida pelo nome entre os bancos das notas já
  // emitidas: já aparece com o CNPJ — o vínculo é feito sozinho ao emitir.
  const financeiras: FinanceiraOpcao[] = contas.map((c) => {
    const conhecido = c.nfseTomador ? tomadorPorCnpj(c.nfseTomador.document ?? "") : tomadorPorNome(c.name);
    // Nota do seguro: a corretora do grupo, se houver; senão o próprio banco.
    const corretora = c.nfseTomadorSeguro ? null : tomadorSeguroDe(conhecido);
    return {
      id: c.id,
      name: c.name,
      tomadorNome: c.nfseTomador?.name ?? conhecido?.nome ?? null,
      tomadorDocumento: c.nfseTomador?.document ?? conhecido?.cnpj ?? null,
      seguroNome: c.nfseTomadorSeguro?.name ?? corretora?.nome ?? null,
      seguroDocumento: c.nfseTomadorSeguro?.document ?? corretora?.cnpj ?? null,
    };
  });

  // Bancos das notas já emitidas que ainda não são financeira em Contas e caixas.
  const bancosSemConta: BancoSemConta[] = TOMADORES_CONHECIDOS.filter(
    (t) =>
      !t.soSeguro &&
      !contas.some((c) =>
        c.nfseTomador ? docKey(c.nfseTomador.document) === docKey(t.cnpj) : t.apelidos.test(c.name),
      ),
  ).map((t) => ({ cnpj: t.cnpj, nome: t.nome, conta: t.conta ?? `Financeira ${t.nome}` }));

  // Nota rejeitada/cancelada não conta (o vínculo é desfeito, mas por garantia).
  const valida = (id: string | null, n: { status: string } | null) =>
    id && n && !["ERRO", "CANCELADA"].includes(n.status) ? id : null;
  const retornos: RetornoOpcao[] = vendas.flatMap((v) => {
    const comum = {
      id: v.id,
      financeiraId: v.financerAccountId ?? "",
      data: v.saleDate.toISOString().slice(0, 10),
      cliente: v.customer.name,
      veiculo: `${v.vehicle.model} ${v.vehicle.plate}`.trim(),
    };
    const out: RetornoOpcao[] = [];
    if (v.returnNet > 0) {
      out.push({
        ...comum,
        tipo: "RETORNO",
        valor: v.returnSettledAt && v.returnPaidAmount != null ? v.returnPaidAmount : v.returnNet,
        recebidoEm: v.returnSettledAt ? v.returnSettledAt.toISOString().slice(0, 10) : null,
        notaId: valida(v.returnNfseId, v.returnNfse),
      });
    }
    // Comissão do seguro só tem valor quando cai (não há fórmula na venda).
    if (v.insuranceSold) {
      out.push({
        ...comum,
        tipo: "SEGURO",
        valor: v.insuranceSettledAt ? v.insuranceCommissionAmount : 0,
        recebidoEm: v.insuranceSettledAt ? v.insuranceSettledAt.toISOString().slice(0, 10) : null,
        notaId: valida(v.insuranceNfseId, v.insuranceNfse),
      });
    }
    return out;
  });

  // Nota antiga sem a financeira gravada: a conta ligada ao mesmo tomador.
  const financeiraDoTomador = (tomadorId: string | null) => {
    const cs = contas.filter((c) => tomadorId && c.nfseTomadorId === tomadorId);
    return cs.length === 1 ? cs[0].id : null;
  };

  const resumo: NotaServicoResumo[] = notas.map((n) => ({
    id: n.id,
    tipo: n.tipo === "SEGURO" ? "SEGURO" : "RETORNO",
    financeiraId: n.financeiraId ?? financeiraDoTomador(n.tomadorId),
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
          retornos={retornos}
          bancosSemConta={canContas ? bancosSemConta : []}
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
