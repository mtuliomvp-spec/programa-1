"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import MatchPicker from "./MatchPicker";
import CreateEntryForm from "./CreateEntryForm";
import {
  parseAndMatchAction,
  confirmMatchesAction,
  unreconcileAction,
  type BankTxn,
  type MatchCandidate,
  type MatchRow,
} from "./actions";

type Option = { id: string; name: string };
type Vehicle = { id: string; label: string };

export default function ReconcileClient({
  accounts,
  supplierNames,
  customers,
  vehicles,
  beneficiaries,
  costCenters,
  despesaCategories,
  receitaCategories,
}: {
  accounts: Option[];
  supplierNames: string[];
  customers: Option[];
  vehicles: Vehicle[];
  beneficiaries: Option[];
  costCenters: Option[];
  despesaCategories: string[];
  receitaCategories: string[];
}) {
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Vínculos escolhidos na mão, por linha do extrato (substituem o automático). */
  const [overrides, setOverrides] = useState<Record<string, MatchCandidate[]>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [createdIds, setCreatedIds] = useState<Set<string>>(new Set());
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pickerFor, setPickerFor] = useState<BankTxn | null>(null);
  const [createFor, setCreateFor] = useState<BankTxn | null>(null);

  const accountName = accounts.find((a) => a.id === accountId)?.name ?? "conta padrão";
  const entriesOf = (r: MatchRow) => overrides[r.txn.fitId] ?? r.matches;

  function handleUpload(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await parseAndMatchAction(formData);
      if (result.error) {
        setMessage({ tone: "err", text: result.error });
        setRows(null);
        return;
      }
      setRows(result.rows ?? []);
      setCreatedIds(new Set());
      setOverrides({});
      setSelected(
        new Set((result.rows ?? []).filter((r) => r.status === "casou").map((r) => r.txn.fitId)),
      );
    });
  }

  function handleConfirm() {
    if (!rows) return;
    const items = rows
      .filter((r) => r.status !== "ja_conciliado" && selected.has(r.txn.fitId))
      .map((r) => ({
        fitId: r.txn.fitId,
        date: r.txn.date,
        amount: r.txn.amount,
        kind: (r.txn.amount < 0 ? "payable" : "receivable") as "payable" | "receivable",
        ids: entriesOf(r).map((m) => m.id),
      }))
      .filter((i) => i.ids.length > 0);
    if (items.length === 0) {
      setMessage({ tone: "err", text: "Nenhuma transação selecionada para conciliar." });
      return;
    }
    const confirmedIds = new Set(items.map((i) => i.fitId));
    startTransition(async () => {
      const res = await confirmMatchesAction(items, accountId || undefined);
      if (!res.ok) {
        setMessage({
          tone: "err",
          text: res.error || "Não foi possível conciliar.",
        });
        if (res.done > 0) {
          setMessage({
            tone: "err",
            text: `${res.done} conciliada(s) antes do erro: ${res.error || "erro desconhecido"}`,
          });
        }
        return;
      }
      setMessage({
        tone: "ok",
        text: `${res.done} transação(ões) conciliada(s) com sucesso, na data do extrato. As pendentes receberam baixa automática.`,
      });
      setRows(
        (prev) =>
          prev?.map((r) =>
            confirmedIds.has(r.txn.fitId) ? { ...r, status: "ja_conciliado" as const } : r,
          ) ?? null,
      );
      setSelected(new Set());
    });
  }

  function handleUnreconcile(fitId: string) {
    startTransition(async () => {
      const res = await unreconcileAction(fitId);
      if (!res.ok) {
        setMessage({ tone: "err", text: res.error || "Não foi possível desconciliar." });
        return;
      }
      // A linha volta como "sem correspondência": dali o usuário escolhe o
      // título certo (o picker agora só lista pendentes) ou lança a conta.
      setRows(
        (prev) =>
          prev?.map((r) =>
            r.txn.fitId === fitId ? { ...r, status: "sem_match" as const, matches: [] } : r,
          ) ?? null,
      );
      setMessage({
        tone: "ok",
        text: "Linha desconciliada — nenhuma baixa foi desfeita. Ela voltou para 'Sem correspondência': escolha o título certo ou lance a conta.",
      });
    });
  }

  const pendingRows = rows?.filter((r) => r.status !== "ja_conciliado") ?? [];
  const matched = pendingRows.filter((r) => entriesOf(r).length > 0 && !createdIds.has(r.txn.fitId));
  const unmatched = pendingRows.filter((r) => entriesOf(r).length === 0 || createdIds.has(r.txn.fitId));
  const already = rows?.filter((r) => r.status === "ja_conciliado") ?? [];

  function txtCell(text: string, className: string) {
    return (
      <span title={text} className={className}>
        {text}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="1. Importar extrato"
          description="No app ou site do seu banco, exporte o extrato em formato OFX (Money) e envie aqui"
        />
        <form action={handleUpload} className="flex flex-wrap items-center gap-3 px-5 py-4">
          <input
            type="file"
            name="ofx"
            accept=".ofx,.OFX,text/plain"
            required
            className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-700 file:px-3.5 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-600"
          />
          {accounts.length > 0 ? (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              title="Conta do extrato"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Analisando..." : "Analisar extrato"}
          </Button>
        </form>
        {message ? (
          <p
            className={`px-5 pb-4 text-sm font-medium ${
              message.tone === "ok" ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </Card>

      {rows ? (
        <>
          <Card>
            <CardHeader
              title={`2. Correspondências encontradas (${matched.length})`}
              description="Confira o que o sistema casou — dá para trocar ou juntar mais de um título na mesma linha do banco. A baixa entra com a data do extrato."
              action={
                matched.length > 0 ? (
                  <Button onClick={handleConfirm} disabled={pending}>
                    {pending ? "Conciliando..." : `Conciliar selecionadas (${selected.size})`}
                  </Button>
                ) : undefined
              }
            />
            {matched.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Nenhuma correspondência pendente.</p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>{""}</Th>
                    <Th>Data</Th>
                    <Th>Extrato do banco</Th>
                    <Th className="text-right">Valor</Th>
                    <Th>Conta(s) no sistema</Th>
                    <Th>Situação</Th>
                    <Th>{""}</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {matched.map((r) => {
                    const entries = entriesOf(r);
                    return (
                      <Tr key={r.txn.fitId}>
                        <Td>
                          <input
                            type="checkbox"
                            checked={selected.has(r.txn.fitId)}
                            onChange={(e) => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(r.txn.fitId);
                                else next.delete(r.txn.fitId);
                                return next;
                              });
                            }}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </Td>
                        <Td className="whitespace-nowrap">{formatDate(r.txn.date)}</Td>
                        <Td className="max-w-[260px] text-slate-600">
                          {txtCell(r.txn.memo, "block break-words")}
                        </Td>
                        <Td
                          className={`text-right tabular-nums ${
                            r.txn.amount < 0 ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          {formatCurrency(r.txn.amount)}
                        </Td>
                        <Td className="max-w-[280px]">
                          <ul className="space-y-1">
                            {entries.map((m) => (
                              <li key={m.id} className="text-slate-900">
                                {txtCell(m.description, "block break-words font-medium")}
                                <span className="text-xs text-slate-500">
                                  {formatCurrency(m.amount)}
                                  {/* Data do título: deixa visível quando o casamento
                                      pegou um título de outro dia (é só trocar). */}
                                  {` · ${formatDate(m.date)}`}
                                  {m.who ? ` · ${m.who}` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                          {entries.length > 1 ? (
                            <p className="mt-1 text-xs font-medium text-blue-700">
                              {entries.length} títulos nesta linha
                            </p>
                          ) : null}
                        </Td>
                        <Td>
                          <Badge tone={entries.every((m) => m.settled) ? "success" : "warning"}>
                            {entries.every((m) => m.settled)
                              ? "Já baixada"
                              : "Pendente → baixa automática"}
                          </Badge>
                        </Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => setPickerFor(r.txn)}
                            className="whitespace-nowrap text-sm font-medium text-blue-700 hover:underline"
                          >
                            Escolher títulos
                          </button>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`3. Sem correspondência (${unmatched.length})`}
              description="Movimentações do banco que não existem no sistema — procure o título certo ou lance a conta com todos os dados"
            />
            {unmatched.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">
                Tudo do extrato tem correspondência. 🎉
              </p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Data</Th>
                    <Th>Descrição no banco</Th>
                    <Th className="text-right">Valor</Th>
                    <Th />
                  </Tr>
                </Thead>
                <tbody>
                  {unmatched.map((r) => (
                    <Tr key={r.txn.fitId}>
                      <Td className="whitespace-nowrap">{formatDate(r.txn.date)}</Td>
                      <Td className="max-w-[320px] text-slate-700">
                        {txtCell(r.txn.memo, "block break-words")}
                      </Td>
                      <Td
                        className={`text-right tabular-nums ${
                          r.txn.amount < 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {formatCurrency(r.txn.amount)}
                      </Td>
                      <Td>
                        {createdIds.has(r.txn.fitId) ? (
                          <Badge tone="success">Criado ✓</Badge>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => setPickerFor(r.txn)}
                              className="whitespace-nowrap text-sm font-medium text-blue-700 hover:underline"
                            >
                              Escolher títulos
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => setCreateFor(r.txn)}
                              className="whitespace-nowrap text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
                            >
                              {r.txn.amount < 0 ? "Lançar conta paga" : "Lançar recebimento"}
                            </button>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {already.length > 0 ? (
            <Card>
              <CardHeader
                title={`4. Já conciliadas (${already.length})`}
                description="Linhas do extrato conciliadas anteriormente. Se alguma casou com o título errado, desconcilie — a marca é removida (nenhuma baixa é desfeita) e a linha volta para 'Sem correspondência' para ser casada de novo."
              />
              <Table>
                <Thead>
                  <Tr>
                    <Th>Data</Th>
                    <Th>Descrição no banco</Th>
                    <Th className="text-right">Valor</Th>
                    <Th>Conciliada com</Th>
                    <Th />
                  </Tr>
                </Thead>
                <tbody>
                  {already.map((r) => (
                    <Tr key={r.txn.fitId}>
                      <Td className="whitespace-nowrap">{formatDate(r.txn.date)}</Td>
                      <Td className="max-w-[280px] text-slate-700">
                        {txtCell(r.txn.memo, "block break-words")}
                      </Td>
                      <Td
                        className={`text-right tabular-nums ${
                          r.txn.amount < 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {formatCurrency(r.txn.amount)}
                      </Td>
                      <Td className="max-w-[280px]">
                        {r.matches.length ? (
                          <ul className="space-y-1">
                            {r.matches.map((m) => (
                              <li key={m.id} className="text-slate-900">
                                {txtCell(m.description, "block break-words")}
                                <span className="text-xs text-slate-500">
                                  {formatCurrency(m.amount)} · {formatDate(m.date)}
                                  {m.who ? ` · ${m.who}` : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </Td>
                      <Td>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleUnreconcile(r.txn.fitId)}
                          className="whitespace-nowrap text-sm font-medium text-rose-700 hover:underline disabled:opacity-50"
                        >
                          Desconciliar
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ) : null}
        </>
      ) : null}

      {pickerFor ? (
        <MatchPicker
          txn={pickerFor}
          initial={
            overrides[pickerFor.fitId] ??
            rows?.find((r) => r.txn.fitId === pickerFor.fitId)?.matches ??
            []
          }
          onClose={() => setPickerFor(null)}
          onConfirm={(items) => {
            setOverrides((prev) => ({ ...prev, [pickerFor.fitId]: items }));
            setSelected((prev) => new Set(prev).add(pickerFor.fitId));
            setPickerFor(null);
            setMessage(null);
          }}
        />
      ) : null}

      {createFor ? (
        <CreateEntryForm
          txn={createFor}
          accountId={accountId}
          accountName={accountName}
          supplierNames={supplierNames}
          customers={customers}
          vehicles={vehicles}
          beneficiaries={beneficiaries}
          costCenters={costCenters}
          categories={createFor.amount < 0 ? despesaCategories : receitaCategories}
          onClose={() => setCreateFor(null)}
          onCreated={() => {
            setCreatedIds((prev) => new Set(prev).add(createFor.fitId));
            setMessage({
              tone: "ok",
              text: `Lançamento criado e conciliado: ${createFor.memo}`,
            });
            setCreateFor(null);
          }}
        />
      ) : null}
    </div>
  );
}
