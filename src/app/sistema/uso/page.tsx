import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPlatformUsage, formatBytes } from "@/lib/subscription";
import { Card, CardHeader, PageHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("pt-BR");

export default async function UsoPlataformaPage() {
  const user = await getSessionUser();
  // Tela de leitura: o administrador do cliente também acompanha o volume da
  // própria instância (transparência do que a assinatura cobre).
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) redirect("/");
  const superAdmin = user.role === "SUPER_ADMIN";

  const u = await getPlatformUsage();

  return (
    <div>
      <PageHeader
        title="Uso da plataforma"
        description="Volume de dados da sua instância. Números atualizados em tempo real."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Usuários cadastrados" value={nf.format(u.usuarios)} hint="ativos e aguardando liberação" />
        <StatCard label="Centros de custo ativos" value={nf.format(u.centrosCusto)} hint="exclui os estruturais" />
        <StatCard label="Veículos" value={nf.format(u.veiculos)} hint="frota registrada no estoque" />
        <StatCard label="Fornecedores" value={nf.format(u.fornecedores)} hint="cadastros comerciais" />
        <StatCard label="Clientes" value={nf.format(u.clientes)} hint="cadastros comerciais" />
        <StatCard label="Vendas registradas" value={nf.format(u.vendas)} hint="histórico completo" />
        <StatCard label="Contas a pagar" value={nf.format(u.contasPagar)} hint="títulos desde o início do uso" />
        <StatCard label="Contas a receber" value={nf.format(u.contasReceber)} hint="títulos desde o início do uso" />
        <StatCard
          label="Anexos de solicitação"
          value={nf.format(u.anexosSolicitacao)}
          hint="notas, comprovantes e fotos das compras"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Armazenamento" />
          <div className="p-5">
            <p className="text-3xl font-bold text-slate-900">{formatBytes(u.bytesAnexos)}</p>
            <p className="mt-2 text-sm text-slate-600">
              Somatório de todos os arquivos guardados na plataforma: documentos dos veículos, boletos e
              comprovantes dos títulos, anexos de solicitações, fotos das avaliações e documentos da empresa.
            </p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Regras e garantias do plano" />
          <div className="space-y-3 p-5 text-sm text-slate-600">
            <p>
              <strong className="text-slate-900">Sem limites duros no plano padrão.</strong> Se o volume ficar
              muito alto (referência: acima de 50 mil títulos por mês ou 100 GB de anexos), o suporte entra em
              contato para avaliar otimizações — nada é bloqueado sozinho.
            </p>
            <p>
              <strong className="text-slate-900">Backups automáticos.</strong> A base é copiada automaticamente
              pela infraestrutura gerenciada, com retenção conforme o plano contratado.
            </p>
            <p>
              <strong className="text-slate-900">Exportação completa dos dados</strong> disponível a qualquer
              momento — os dados são da empresa.{" "}
              {superAdmin ? (
                <>
                  Em{" "}
                  <Link href="/sistema" className="font-medium text-blue-700 hover:underline">
                    Sistema
                  </Link>{" "}
                  você gera o backup quando quiser.
                </>
              ) : (
                "Peça a exportação ao fornecedor do sistema quando precisar."
              )}
            </p>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
              Sua instância é <strong>dedicada</strong>: os números acima refletem apenas os dados da sua
              empresa — nada é compartilhado com outras lojas.
            </p>
          </div>
        </Card>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Para que serve: acompanhar o crescimento da base e antecipar conversas de plano, e ter transparência do
        que a assinatura cobre. O contrato e as mensalidades ficam em{" "}
        <Link href="/sistema/assinatura" className="font-medium text-blue-700 hover:underline">
          Assinatura
        </Link>
        .
      </p>
    </div>
  );
}
