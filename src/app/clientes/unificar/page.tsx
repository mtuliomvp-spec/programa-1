import { Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import { findCustomerDuplicates } from "./detect";
import MergeButton from "./MergeButton";

export const dynamic = "force-dynamic";

export default async function UnificarClientesPage() {
  await requireAction("cadastros", "unificar");
  const groups = await findCustomerDuplicates();
  const mergeable = groups.filter((g) => !g.blocked);
  const blocked = groups.filter((g) => g.blocked);
  const moved = mergeable.reduce((sum, g) => sum + g.moved, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Unificar clientes repetidos"
        description="Confira o que será unificado antes de clicar — nada é alterado sem o seu clique"
        action={
          <LinkButton href="/clientes" variant="secondary">
            ← Voltar aos clientes
          </LinkButton>
        }
      />

      <Card className="mb-4">
        <div className="space-y-2 p-5 text-sm text-slate-600">
          <p>
            O mesmo cliente foi cadastrado mais de uma vez com pequenas diferenças de escrita —
            acento, maiúscula, ponto, espaço — ou com o mesmo CPF/CNPJ em nomes diferentes. Aqui
            eles viram <strong>um cadastro só</strong>.
          </p>
          <p>
            <strong>Nada é apagado.</strong> Vendas, propostas (pré-vendas), vendas de peças, contas
            a receber e recorrências que estavam nos cadastros repetidos passam para o cadastro que
            fica. Só depois disso os repetidos, já vazios, são excluídos.
          </p>
          <p className="text-slate-500">
            Contratos e documentos já impressos continuam com o nome do jeito que estava no papel.
          </p>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title={
            mergeable.length === 0
              ? blocked.length === 0
                ? "Nenhum cliente repetido 🎉"
                : "Nada para unificar automaticamente"
              : `${mergeable.length} grupo(s) para unificar — ${moved} lançamento(s) mudam de dono`
          }
          description={
            mergeable.length === 0
              ? blocked.length === 0
                ? "O cadastro de clientes está limpo."
                : `Os ${blocked.length} grupo(s) abaixo precisam da sua conferência.`
              : "Confira grupo a grupo: o nome que fica está certo? Os cadastros que somem são mesmo a mesma pessoa?"
          }
        />
        {mergeable.length > 0 ? (
          <>
            <Table>
              <Thead>
                <Tr>
                  <Th>Nome que fica</Th>
                  <Th>Cadastros que somem</Th>
                  <Th>Lançamentos que mudam de dono</Th>
                </Tr>
              </Thead>
              <tbody>
                {mergeable.map((g) => (
                  <Tr key={g.winner!.id}>
                    <Td className="font-medium text-slate-900">
                      {g.survivingName}
                      {g.discarded.length ? (
                        <p className="mt-1 text-xs font-normal text-amber-700">
                          ⚠ Confira antes: {g.discarded.join(" · ")}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-slate-500">
                      {g.losers.map((l) => (
                        <p key={l.id}>{l.name}</p>
                      ))}
                    </Td>
                    <Td>
                      {g.moved === 0 ? (
                        <span className="text-slate-400">nenhum</span>
                      ) : (
                        <span title={countsLabel(g.losers)}>{g.moved}</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="border-t border-slate-200 p-5">
              <MergeButton groups={mergeable.length} moved={moved} />
            </div>
          </>
        ) : null}
      </Card>

      {blocked.length > 0 ? (
        <Card>
          <CardHeader
            title={`${blocked.length} grupo(s) precisam da sua conferência`}
            description="O sistema não une estes por conta própria."
          />
          <div className="divide-y divide-slate-100">
            {blocked.map((g) => (
              <div key={g.members[0].id} className="p-5 text-sm">
                <p className="font-medium text-slate-900">
                  {g.members.map((m) => m.name).join(" · ")}
                </p>
                <p className="mt-1 font-medium text-amber-700">Mesmo nome, CPF/CNPJ diferentes</p>
                <p className="mt-1 text-slate-600">
                  Provavelmente são duas pessoas distintas (dois “José Silva”, por exemplo). O
                  sistema não une por conta própria. Se for a mesma, corrija o documento errado em
                  Editar e volte aqui.
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/** "2 vendas · 1 proposta" para a dica ao passar o mouse. */
function countsLabel(losers: { counts: Record<string, number> }[]): string {
  const labels: Record<string, string> = {
    sales: "venda(s)",
    partSales: "venda(s) de peça",
    receivables: "conta(s) a receber",
    recurring: "recorrência(s)",
    preSales: "proposta(s)",
  };
  const total: Record<string, number> = {};
  for (const l of losers) {
    for (const [k, v] of Object.entries(l.counts)) total[k] = (total[k] ?? 0) + v;
  }
  return Object.entries(total)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${labels[k]}`)
    .join(" · ");
}
