import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getPerfSnapshot } from "@/lib/perf";
import { getDbInfo } from "@/lib/db-info";
import { Card, CardHeader, PageHeader, Table, Thead, Th, Td, Tr, Button } from "@/components/ui";
import PingButton from "./PingButton";
import { resetPerfAction } from "./actions";

export const dynamic = "force-dynamic";

const ms = (n: number) => `${n.toFixed(0)} ms`;

export default async function DesempenhoPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/");

  const perf = getPerfSnapshot();
  const db = getDbInfo();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Desempenho"
        description="Medição de onde o sistema gasta tempo (somente administradores)"
      />

      <Card className="mb-4">
        <CardHeader
          title="Quanto custa uma ida ao banco"
          description="O número que decide tudo: o sistema faz dezenas de consultas por tela e por lançamento, e cada uma paga esse tempo de viagem."
        />
        <div className="px-5 pb-5">
          <PingButton />
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Onde está o servidor e onde está o banco"
          description="Se estiverem em regiões diferentes, cada consulta atravessa o mundo."
        />
        <div className="grid gap-3 px-5 pb-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-slate-500">Servidor da aplicação</p>
            <p className="font-medium text-slate-900">
              {db.serverRegionLabel ?? db.serverRegion ?? "—"}
              {db.serverRegionLabel && db.serverRegion ? (
                <span className="ml-1 text-slate-500">({db.serverRegion})</span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Banco de dados</p>
            <p className="font-medium text-slate-900">
              {db.region ?? "—"}
              {db.provider ? <span className="ml-1 text-slate-500">({db.provider})</span> : null}
            </p>
            <p className="text-xs text-slate-400">{db.host ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Mesma região?</p>
            <p
              className={`font-medium ${db.sameRegion === false ? "text-rose-700" : db.sameRegion ? "text-emerald-700" : "text-slate-500"}`}
            >
              {db.sameRegion === null
                ? "não dá para saber aqui"
                : db.sameRegion
                  ? "sim — servidor e banco lado a lado"
                  : "NÃO — é isto que precisa ser corrigido primeiro"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Conexão compartilhada (pooler)</p>
            <p className={`font-medium ${db.pooled === false ? "text-amber-700" : "text-slate-900"}`}>
              {db.pooled === null ? "—" : db.pooled ? "sim" : "não — recomendado ativar"}
            </p>
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Onde o tempo está indo"
          description="Blocos medidos desde que este servidor subiu. Ordenado pelo tempo total."
          action={
            <form action={resetPerfAction}>
              <Button variant="secondary" type="submit">
                Zerar medição
              </Button>
            </form>
          }
        />
        {perf.blocks.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">
            Nada medido ainda. Use o sistema normalmente e volte aqui.
          </p>
        ) : (
          <Table>
            <Thead>
              <Th>Bloco</Th>
              <Th className="text-right">Vezes</Th>
              <Th className="text-right">Média</Th>
              <Th className="text-right">Pior</Th>
              <Th className="text-right">Tempo total</Th>
            </Thead>
            <tbody>
              {perf.blocks.map((b) => (
                <Tr key={b.key}>
                  <Td>{b.key}</Td>
                  <Td className="text-right">{b.count}</Td>
                  <Td className="text-right">{ms(b.avgMs)}</Td>
                  <Td className="text-right">{ms(b.maxMs)}</Td>
                  <Td className="text-right font-medium">{ms(b.totalMs)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Consultas ao banco"
          description={`${perf.totalQueries} consultas somando ${ms(perf.totalQueryMs)} · servidor de pé há ${Math.round(perf.uptimeSeconds / 60)} min`}
        />
        {perf.queries.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">Nada medido ainda.</p>
        ) : (
          <Table>
            <Thead>
              <Th>Consulta</Th>
              <Th className="text-right">Vezes</Th>
              <Th className="text-right">Média</Th>
              <Th className="text-right">Pior</Th>
              <Th className="text-right">Tempo total</Th>
            </Thead>
            <tbody>
              {perf.queries.slice(0, 25).map((q) => (
                <Tr key={q.key}>
                  <Td>{q.key}</Td>
                  <Td className="text-right">{q.count}</Td>
                  <Td className="text-right">{ms(q.avgMs)}</Td>
                  <Td className="text-right">{ms(q.maxMs)}</Td>
                  <Td className="text-right font-medium">{ms(q.totalMs)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <p className="px-1 pb-6 text-xs text-slate-500">
        Os números são desta instância do servidor e zeram quando ela é reciclada — servem para
        comparar o peso de um bloco com o de outro, não como total histórico. A medição da ida ao
        banco (o botão acima) vale sempre.
      </p>
    </div>
  );
}
