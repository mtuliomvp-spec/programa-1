import { prisma } from "@/lib/prisma";
import { requireAction } from "@/lib/guards";
import { formatCurrency, formatDate, parseDateInput } from "@/lib/format";
import { Card, CardHeader, LinkButton, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { PMZ_ROWS, PMZ_SUPPLIER_NAME, normalizePlate } from "./data";
import ImportButton from "./ImportButton";

export const dynamic = "force-dynamic";

export default async function ImportarPmzPage() {
  await requireAction("financeiro", "criar");

  const vehicles = await prisma.vehicle.findMany({ select: { plate: true } });
  const plates = new Set(vehicles.map((v) => normalizePlate(v.plate)));
  const total = PMZ_ROWS.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Importar títulos — PMZ Distribuidora"
        description={`${PMZ_ROWS.length} títulos · total ${formatCurrency(total)} · fornecedor ${PMZ_SUPPLIER_NAME}`}
        action={
          <LinkButton href="/financeiro/a-pagar" variant="secondary">
            ← Voltar
          </LinkButton>
        }
      />

      <Card className="mb-4">
        <CardHeader
          title="Títulos a importar"
          description="Cada título entra em Contas a pagar como Compra de peças, vinculado ao veículo pela placa. Ação idempotente (não duplica)."
        />
        <Table>
          <Thead>
            <Tr>
              <Th>Doc (NF)</Th>
              <Th>Vencimento</Th>
              <Th>Placa</Th>
              <Th>Descrição</Th>
              <Th className="text-right">Valor</Th>
            </Tr>
          </Thead>
          <tbody>
            {PMZ_ROWS.map((r) => {
              const found = r.plate && plates.has(normalizePlate(r.plate));
              return (
                <Tr key={r.doc}>
                  <Td className="tabular-nums text-slate-600">{r.doc}</Td>
                  <Td>{formatDate(parseDateInput(r.date))}</Td>
                  <Td>
                    {r.plate ? (
                      <span className={found ? "text-slate-800" : "text-amber-600"}>
                        {r.plate}
                        {found ? "" : " (não encontrada)"}
                      </span>
                    ) : (
                      <span className="text-amber-600">sem placa</span>
                    )}
                  </Td>
                  <Td className="text-slate-800">{r.description}</Td>
                  <Td className="text-right tabular-nums">{formatCurrency(r.amount)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <div className="p-5">
          <ImportButton />
        </div>
      </Card>
    </div>
  );
}
