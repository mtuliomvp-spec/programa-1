"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, Field, Input, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { buildRentSchedule, type RentContractParams } from "@/lib/rent-contract";
import { createRentContractAction } from "./actions";

/** dd/mm/aaaa a partir de "yyyy-mm-dd" (sem depender de fuso). */
function fmt(d: string): string {
  const [y, m, day] = (d || "").split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

const tipoTone = { DESCONTO: "info", INTEGRAL: "default", CARENCIA: "warning" } as const;
const tipoLabel = { DESCONTO: "Com desconto", INTEGRAL: "Integral", CARENCIA: "Carência (isento)" } as const;

export default function RentContractForm({
  defaults,
}: {
  defaults: RentContractParams & { locador: string };
}) {
  const router = useRouter();
  const [locador, setLocador] = useState(defaults.locador);
  const [valorAluguel, setValorAluguel] = useState(String(defaults.valorAluguel));
  const [descontoMensal, setDescontoMensal] = useState(String(defaults.descontoMensal));
  const [mesesDesconto, setMesesDesconto] = useState(String(defaults.mesesDesconto));
  const [totalMeses, setTotalMeses] = useState(String(defaults.totalMeses));
  const [mesesCarencia, setMesesCarencia] = useState(String(defaults.mesesCarencia));
  const [primeiroVencimento, setPrimeiroVencimento] = useState(defaults.primeiroVencimento);
  const [diaVencimento, setDiaVencimento] = useState(String(defaults.diaVencimento));
  const [caucaoValor, setCaucaoValor] = useState(String(defaults.caucaoValor));
  const [caucaoData, setCaucaoData] = useState(defaults.caucaoData);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const params: RentContractParams = useMemo(
    () => ({
      valorAluguel: Number(valorAluguel) || 0,
      descontoMensal: Number(descontoMensal) || 0,
      mesesDesconto: Number(mesesDesconto) || 0,
      totalMeses: Number(totalMeses) || 0,
      mesesCarencia: Number(mesesCarencia) || 0,
      primeiroVencimento,
      diaVencimento: Number(diaVencimento) || 10,
      caucaoValor: Number(caucaoValor) || 0,
      caucaoData,
    }),
    [valorAluguel, descontoMensal, mesesDesconto, totalMeses, mesesCarencia, primeiroVencimento, diaVencimento, caucaoValor, caucaoData],
  );

  const schedule = useMemo(() => buildRentSchedule(params), [params]);
  const totalTitulos = schedule.parcelas.length + (schedule.caucao ? 1 : 0);

  function gerar() {
    setMsg(null);
    if (!confirm(`Gerar ${totalTitulos} título(s) no Contas a pagar?`)) return;
    start(async () => {
      const r = await createRentContractAction(locador, params);
      if (!r.ok) {
        setMsg(r.error || "Não foi possível gerar.");
        return;
      }
      router.push("/financeiro/a-pagar");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Parâmetros do contrato"
          description="Confira os valores; o cronograma abaixo é atualizado automaticamente."
        />
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Locador (fornecedor)">
            <Input value={locador} onChange={(e) => setLocador(e.target.value)} />
          </Field>
          <Field label="Valor do aluguel (R$)">
            <Input type="number" step="0.01" value={valorAluguel} onChange={(e) => setValorAluguel(e.target.value)} />
          </Field>
          <Field label="Desconto mensal (R$)">
            <Input type="number" step="0.01" value={descontoMensal} onChange={(e) => setDescontoMensal(e.target.value)} />
          </Field>
          <Field label="Meses com desconto">
            <Input type="number" value={mesesDesconto} onChange={(e) => setMesesDesconto(e.target.value)} />
          </Field>
          <Field label="Total de meses">
            <Input type="number" value={totalMeses} onChange={(e) => setTotalMeses(e.target.value)} />
          </Field>
          <Field label="Meses de carência (final, isentos)">
            <Input type="number" value={mesesCarencia} onChange={(e) => setMesesCarencia(e.target.value)} />
          </Field>
          <Field label="1º vencimento do aluguel">
            <Input type="date" value={primeiroVencimento} onChange={(e) => setPrimeiroVencimento(e.target.value)} />
          </Field>
          <Field label="Dia do vencimento">
            <Input type="number" min={1} max={28} value={diaVencimento} onChange={(e) => setDiaVencimento(e.target.value)} />
          </Field>
          <Field label="Caução (R$)">
            <Input type="number" step="0.01" value={caucaoValor} onChange={(e) => setCaucaoValor(e.target.value)} />
          </Field>
          <Field label="Data da caução">
            <Input type="date" value={caucaoData} onChange={(e) => setCaucaoData(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Cronograma (preview — nada foi lançado ainda)"
          description="Descontos e carência já entram como observação; a carência entra como R$ 0,00 registrada."
        />
        <div className="grid grid-cols-2 gap-3 px-5 pt-4 sm:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Total de títulos</p>
            <p className="text-lg font-bold text-slate-900">{totalTitulos}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Caução</p>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(schedule.totais.caucao)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">A pagar (aluguéis)</p>
            <p className="text-lg font-bold text-emerald-700">{formatCurrency(schedule.totais.aPagarParcelas)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Não pago (registrado)</p>
            <p className="text-lg font-bold text-amber-700">{formatCurrency(schedule.totais.naoPago)}</p>
          </div>
        </div>

        <div className="max-h-[520px] overflow-auto p-5">
          <Table>
            <Thead>
              <Tr>
                <Th>Competência</Th>
                <Th>Vencimento</Th>
                <Th>Tipo</Th>
                <Th className="text-right">A pagar</Th>
                <Th className="text-right">Não pago</Th>
                <Th>Observação</Th>
              </Tr>
            </Thead>
            <tbody>
              {schedule.caucao ? (
                <Tr className="bg-slate-50">
                  <Td className="font-medium text-slate-900">Caução</Td>
                  <Td className="whitespace-nowrap">{fmt(schedule.caucao.date)}</Td>
                  <Td>
                    <Badge tone="success">Garantia</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{formatCurrency(schedule.caucao.amount)}</Td>
                  <Td className="text-right tabular-nums">—</Td>
                  <Td className="text-xs text-slate-500">Garantia locatícia (Cl. 4ª).</Td>
                </Tr>
              ) : null}
              {schedule.parcelas.map((l) => (
                <Tr key={l.index}>
                  <Td className="whitespace-nowrap">{l.competencia}</Td>
                  <Td className="whitespace-nowrap">{fmt(l.dueDate)}</Td>
                  <Td>
                    <Badge tone={tipoTone[l.tipo]}>{tipoLabel[l.tipo]}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums">{formatCurrency(l.valorPagar)}</Td>
                  <Td className="text-right tabular-nums text-amber-700">
                    {l.naoPago > 0 ? formatCurrency(l.naoPago) : "—"}
                  </Td>
                  <Td className="text-xs text-slate-500">{l.observacao}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-5 py-4">
          {msg ? <p className="text-sm text-rose-600">{msg}</p> : null}
          <Button type="button" onClick={gerar} disabled={pending || totalTitulos === 0}>
            {pending ? "Gerando..." : `Gerar ${totalTitulos} título(s) no a-pagar`}
          </Button>
        </div>
      </Card>
    </div>
  );
}
