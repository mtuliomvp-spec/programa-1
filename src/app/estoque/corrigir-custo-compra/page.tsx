import Link from "next/link";
import { Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { requireActionAny } from "@/lib/guards";
import { formatCurrency } from "@/lib/format";
import { findDuplicatedPurchaseCosts } from "./detect";
import FixButton from "./FixButton";

export const dynamic = "force-dynamic";

export default async function CorrigirCustoCompraPage() {
  await requireActionAny([
    ["estoque", "editar"],
    ["financeiro", "criar"],
  ]);
  const found = await findDuplicatedPurchaseCosts();
  const total = found.reduce((s, f) => s + f.amount, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Custo duplicado da compra do veículo"
        description="Confira o que será corrigido antes de mandar corrigir — nada é alterado sem o seu clique"
        action={
          <LinkButton href="/estoque" variant="secondary">
            ← Voltar ao estoque
          </LinkButton>
        }
      />

      <Card className="mb-4">
        <div className="space-y-2 p-5 text-sm text-slate-600">
          <p>
            O <strong>preço de compra</strong> do carro já está no cadastro do veículo. Quando o
            título dessa compra também aparece na lista de <strong>&quot;Custos do veículo&quot;</strong>, o
            mesmo dinheiro é contado <strong>duas vezes</strong> — o custo total do carro estoura e a
            margem fica errada (ex.: um carro de R$ 70.000 aparecendo com R$ 141.496,20 de custo).
          </p>
          <p>
            Isso acontecia ao abrir o título da compra em Contas a pagar → Editar e salvar. O
            sistema já foi corrigido para não deixar mais isso acontecer. Aqui em baixo está o que
            ficou errado antes da correção.
          </p>
          <p className="text-slate-500">
            A correção <strong>não apaga o título a pagar</strong> — a dívida continua onde está. Ela
            só remove a linha duplicada dos custos do carro e devolve a categoria
            &quot;Compra de veículo&quot; ao título.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={
            found.length === 0
              ? "Nenhum custo duplicado encontrado 🎉"
              : `${found.length} custo(s) duplicado(s) — total ${formatCurrency(total)}`
          }
          description={
            found.length === 0
              ? "Nenhum veículo do sistema tem a compra lançada duas vezes."
              : "Estes são os veículos que serão mexidos"
          }
        />
        {found.length > 0 ? (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>Veículo</Th>
                  <Th>Linha duplicada nos custos</Th>
                  <Th className="text-right">Valor duplicado</Th>
                  <Th className="text-right">Preço de compra</Th>
                  <Th>Título a pagar</Th>
                </Tr>
              </Thead>
              <tbody>
                {found.map((f) => (
                  <Tr key={f.costId}>
                    <Td className="font-medium text-slate-900">
                      <Link href={`/estoque/${f.vehicleId}`} className="hover:underline">
                        {f.vehicleLabel}
                      </Link>
                      <span className="block text-xs font-normal text-slate-500">
                        {f.vehicleStatus === "VENDIDO" ? "vendido" : "em estoque"}
                      </span>
                    </Td>
                    <Td className="max-w-[280px] text-slate-600">
                      <span className="block break-words">{f.costDescription}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums text-rose-600">
                      {formatCurrency(f.amount)}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums text-slate-600">
                      {formatCurrency(f.purchasePrice)}
                    </Td>
                    <Td className="text-slate-600">
                      {f.payableId ? (
                        <>
                          {f.payableStatus === "PAGO" ? "Pago" : "Pendente"}
                          {f.needsCategoryFix ? (
                            <span className="block text-xs text-amber-600">
                              volta para &quot;Compra de veículo&quot;
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">sem título (custo órfão)</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-slate-200 p-5">
              <FixButton count={found.length} />
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
