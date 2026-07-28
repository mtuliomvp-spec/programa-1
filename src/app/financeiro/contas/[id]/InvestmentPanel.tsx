"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { formatCurrency } from "@/lib/format";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Table, Td, Th, Thead, Tr } from "@/components/ui";
import {
  aplicarAction,
  resgatarAction,
  rendimentoAction,
  type InvestFormState,
} from "./investment-actions";

type Beneficiary = { id: string; name: string };
type Applied = { beneficiaryId: string; name: string; applied: number };
type SourceAccount = { id: string; name: string };

export default function InvestmentPanel({
  accountId,
  balance,
  allocated,
  reconciled,
  applied,
  beneficiaries,
  sourceAccounts,
  today,
  canManage = true,
}: {
  accountId: string;
  balance: number;
  allocated: number;
  reconciled: boolean;
  applied: Applied[];
  beneficiaries: Beneficiary[];
  sourceAccounts: SourceAccount[];
  today: string;
  canManage?: boolean;
}) {
  const aplicarBound = aplicarAction.bind(null, accountId);
  const resgatarBound = resgatarAction.bind(null, accountId);
  const [aplicarState, aplicarSubmit, aplicarPending] = useActionState(aplicarBound, {} as InvestFormState);
  const [resgatarState, resgatarSubmit, resgatarPending] = useActionState(resgatarBound, {} as InvestFormState);

  const [source, setSource] = useState<"CAIXA" | "EXTERNO">("CAIXA");

  return (
    <div className="space-y-4">
      {/* Como creditar */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-slate-700">
        💡 Para <strong>colocar dinheiro aqui</strong>, use <strong>Aplicar</strong> abaixo. Esta conta
        não aparece nas entradas comuns do caixa de propósito — o valor é sempre creditado a um sócio
        (por isso o saldo fica sempre dividido entre eles).
      </div>

      {/* Reconciliação */}
      <Card className={`border-2 ${reconciled ? "border-emerald-200" : "border-rose-300"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden>{reconciled ? "✅" : "⚠️"}</span>
            <div>
              <p className="font-semibold text-slate-900">
                {reconciled ? "Aplicação conferida" : "Aplicação desbalanceada"}
              </p>
              <p className="text-xs text-slate-500">
                Saldo da conta {formatCurrency(balance)} · distribuído entre sócios {formatCurrency(allocated)}
                {reconciled ? "" : ` · diferença ${formatCurrency(balance - allocated)}`}
              </p>
            </div>
          </div>
          <Badge tone={reconciled ? "success" : "danger"}>
            {reconciled ? "Bate certinho" : "Ajuste necessário"}
          </Badge>
        </div>
      </Card>

      {/* Distribuição por sócio */}
      <Card>
        <CardHeader title="Quanto cada sócio tem aplicado" description="A soma bate com o saldo da conta" />
        {applied.length === 0 ? (
          <EmptyState title="Nada aplicado ainda" description="Use 'Aplicar' abaixo para o sócio investir nesta conta." />
        ) : (
          <Table>
            <Thead>
              <Tr>
                <Th>Sócio</Th>
                <Th className="text-right">Valor aplicado</Th>
              </Tr>
            </Thead>
            <tbody>
              {applied.map((a) => (
                <Tr key={a.beneficiaryId}>
                  <Td className="font-medium text-slate-900">{a.name}</Td>
                  <Td className="text-right font-semibold tabular-nums text-slate-900">{formatCurrency(a.applied)}</Td>
                </Tr>
              ))}
              <Tr className="bg-slate-50 font-bold">
                <Td>Total</Td>
                <Td className="text-right tabular-nums">{formatCurrency(allocated)}</Td>
              </Tr>
            </tbody>
          </Table>
        )}
      </Card>

      <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${canManage ? "" : "hidden"}`}>
        {/* Aplicar */}
        <Card>
          <CardHeader title="Aplicar (creditar dinheiro na conta)" description="Um sócio passa a ter capital aplicado nesta conta" />
          <form action={aplicarSubmit} className="space-y-3 p-5">
            {aplicarState.error ? <p className="text-sm text-rose-600">{aplicarState.error}</p> : null}
            {aplicarState.ok ? <p className="text-sm text-emerald-600">Aplicado com sucesso.</p> : null}
            {beneficiaries.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Nenhum sócio cadastrado. <a href="/capital" className="font-semibold underline">Cadastre o sócio no Capital</a> primeiro
                para creditar o dinheiro a ele.
              </p>
            ) : null}
            <Field label="Sócio" required>
              <Select name="beneficiaryId" required>
                <option value="">Selecione…</option>
                {beneficiaries.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="De onde vem o dinheiro?" required>
              <Select name="source" value={source} onChange={(e) => setSource(e.target.value as "CAIXA" | "EXTERNO")}>
                <option value="CAIXA">Do caixa/banco da loja (capital que o sócio já tem)</option>
                <option value="EXTERNO">Crédito / dinheiro novo do sócio (de fora)</option>
              </Select>
            </Field>
            {source === "CAIXA" ? (
              <Field label="Conta de origem" required>
                <Select name="fromAccountId" required>
                  <option value="">Selecione…</option>
                  {sourceAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Valor (R$)" required>
              <Input name="amount" type="number" step="0.01" min="0.01" required placeholder="0,00" />
            </Field>
            <Field label="Data" required>
              <Input name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Observação">
              <Input name="description" placeholder="Opcional" />
            </Field>
            <Button type="submit" disabled={aplicarPending} className="w-full">
              {aplicarPending ? "Aplicando…" : "Aplicar"}
            </Button>
          </form>
        </Card>

        <div className="space-y-4">
          {/* Rendimento */}
          <RendimentoForm accountId={accountId} applied={applied} beneficiaries={beneficiaries} today={today} />

          {/* Resgatar */}
          <Card>
            <CardHeader title="Resgatar" description="O sócio tira dinheiro saindo desta conta" />
            <form action={resgatarSubmit} className="space-y-3 p-5">
              {resgatarState.error ? <p className="text-sm text-rose-600">{resgatarState.error}</p> : null}
              {resgatarState.ok ? <p className="text-sm text-emerald-600">Resgatado com sucesso.</p> : null}
              <Field label="Sócio" required>
                <Select name="beneficiaryId" required>
                  <option value="">Selecione…</option>
                  {applied.map((a) => (
                    <option key={a.beneficiaryId} value={a.beneficiaryId}>
                      {a.name} · aplicado {formatCurrency(a.applied)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Valor (R$)" required>
                <Input name="amount" type="number" step="0.01" min="0.01" required placeholder="0,00" />
              </Field>
              <Field label="Data" required>
                <Input name="date" type="date" defaultValue={today} required />
              </Field>
              <Field label="Observação">
                <Input name="description" placeholder="Opcional" />
              </Field>
              <Button type="submit" disabled={resgatarPending} variant="secondary" className="w-full">
                {resgatarPending ? "Resgatando…" : "Resgatar"}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RendimentoForm({
  accountId,
  applied,
  beneficiaries,
  today,
}: {
  accountId: string;
  applied: Applied[];
  beneficiaries: Beneficiary[];
  today: string;
}) {
  // Base da divisão: quem já tem aplicado; se ninguém, todos os beneficiários.
  const rows = applied.length ? applied.map((a) => ({ id: a.beneficiaryId, name: a.name })) : beneficiaries;
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  const total = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0),
    [amounts],
  );

  function distribuirProporcional(totalStr: string) {
    const t = Number(totalStr) || 0;
    const base = applied.reduce((s, a) => s + a.applied, 0);
    if (t <= 0 || base <= 0) return;
    const next: Record<string, string> = {};
    let acc = 0;
    applied.forEach((a, i) => {
      const val = i === applied.length - 1 ? t - acc : Math.round((t * a.applied) / base * 100) / 100;
      acc += val;
      next[a.beneficiaryId] = val.toFixed(2);
    });
    setAmounts(next);
  }

  function submit() {
    setError(null);
    setOk(false);
    const splits = rows
      .map((r) => ({ beneficiaryId: r.id, amount: Number(amounts[r.id]) || 0 }))
      .filter((s) => s.amount > 0);
    if (splits.length === 0) {
      setError("Informe o valor do rendimento de pelo menos um sócio.");
      return;
    }
    start(async () => {
      const res = await rendimentoAction(accountId, splits, date, description);
      if (res.error) setError(res.error);
      else {
        setOk(true);
        setAmounts({});
        setDescription("");
      }
    });
  }

  return (
    <Card>
      <CardHeader title="Registrar rendimento" description="Os juros da conta viram capital dos sócios (não entram no lucro da loja)" />
      <div className="space-y-3 p-5">
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {ok ? <p className="text-sm text-emerald-600">Rendimento registrado.</p> : null}
        {applied.length > 0 ? (
          <div className="flex items-end gap-2">
            <Field label="Rendimento total (dividir proporcional ao aplicado)">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                onChange={(e) => distribuirProporcional(e.target.value)}
              />
            </Field>
          </div>
        ) : null}
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-slate-700">{r.name}</span>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={amounts[r.id] ?? ""}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                className="w-32"
              />
            </div>
          ))}
        </div>
        <p className="text-right text-sm font-semibold text-slate-700">Total: {formatCurrency(total)}</p>
        <Field label="Data" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Observação">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
        </Field>
        <Button type="button" onClick={submit} disabled={pending} className="w-full">
          {pending ? "Registrando…" : "Registrar rendimento"}
        </Button>
      </div>
    </Card>
  );
}
