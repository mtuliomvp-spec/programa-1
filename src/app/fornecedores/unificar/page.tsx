import { Badge, Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { requireAction } from "@/lib/guards";
import { syncAllUserSuppliers } from "@/lib/user-supplier-link";
import { findSupplierDuplicates } from "./detect";
import MergeButton from "./MergeButton";

export const dynamic = "force-dynamic";

const BLOCK_TEXT: Record<string, { title: string; body: string }> = {
  MULTIPLOS_USUARIOS: {
    title: "Dois usuários do sistema com o mesmo nome ou documento",
    body:
      "O fornecedor destes é criado automaticamente a partir do cadastro do usuário, então unificar aqui não adianta: o sistema recria o repetido no próximo acesso. Abra Usuários, veja se é a mesma pessoa cadastrada duas vezes e resolva por lá. Depois volte aqui — o grupo some sozinho.",
  },
  DOCUMENTOS_DIFERENTES: {
    title: "Mesmo nome, CPF/CNPJ diferentes",
    body:
      "Provavelmente são duas pessoas ou empresas distintas (dois “José Silva”, por exemplo). O sistema não une por conta própria. Se for a mesma, corrija o documento errado em Editar e volte aqui.",
  },
};

export default async function UnificarFornecedoresPage() {
  await requireAction("cadastros", "unificar");
  // Garante os fornecedores-espelho antes de decidir quem vence.
  await syncAllUserSuppliers();
  const groups = await findSupplierDuplicates();
  const mergeable = groups.filter((g) => !g.blocked);
  const blocked = groups.filter((g) => g.blocked);
  const moved = mergeable.reduce((sum, g) => sum + g.moved, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Unificar fornecedores repetidos"
        description="Confira o que será unificado antes de clicar — nada é alterado sem o seu clique"
        action={
          <LinkButton href="/fornecedores" variant="secondary">
            ← Voltar aos fornecedores
          </LinkButton>
        }
      />

      <Card className="mb-4">
        <div className="space-y-2 p-5 text-sm text-slate-600">
          <p>
            O mesmo fornecedor foi cadastrado mais de uma vez com pequenas diferenças de escrita —
            acento, maiúscula, ponto, espaço — ou com o mesmo CPF/CNPJ em nomes diferentes. Aqui
            eles viram <strong>um cadastro só</strong>.
          </p>
          <p>
            <strong>Nenhum lançamento é apagado.</strong> Veículos, peças, contas a pagar,
            recorrências e solicitações de compra que estavam nos cadastros repetidos passam para o
            cadastro que fica. Só depois disso os repetidos, já vazios, são excluídos.
          </p>
          <p className="text-slate-500">
            Propostas antigas continuam com o nome do jeito que foi digitado — não tem problema:
            quando a proposta virar venda, o sistema já aponta para o fornecedor unificado. Ordens
            de pagamento já impressas também continuam com o nome antigo no papel.
          </p>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title={
            mergeable.length === 0
              ? blocked.length === 0
                ? "Nenhum fornecedor repetido 🎉"
                : "Nada para unificar automaticamente"
              : `${mergeable.length} grupo(s) para unificar — ${moved} lançamento(s) mudam de dono`
          }
          description={
            mergeable.length === 0
              ? blocked.length === 0
                ? "O cadastro de fornecedores está limpo."
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
                      <span className="inline-flex items-center gap-2">
                        {g.survivingName}
                        {g.winner!.isMirror ? <Badge tone="info">usuário</Badge> : null}
                      </span>
                      {g.winner!.isMirror ? (
                        <p className="mt-1 text-xs font-normal text-slate-500">
                          O nome fica sendo o do usuário do sistema. Para mudar, renomeie em
                          Usuários.
                        </p>
                      ) : null}
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
                <p className="mt-1 font-medium text-amber-700">
                  {BLOCK_TEXT[g.blocked!].title}
                </p>
                <p className="mt-1 text-slate-600">{BLOCK_TEXT[g.blocked!].body}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/** "3 títulos · 1 veículo" para a dica ao passar o mouse. */
function countsLabel(losers: { counts: Record<string, number> }[]): string {
  const labels: Record<string, string> = {
    vehicles: "veículo(s)",
    parts: "peça(s)",
    payables: "título(s) a pagar",
    recurring: "recorrência(s)",
    purchaseRequests: "solicitação(ões) de compra",
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
