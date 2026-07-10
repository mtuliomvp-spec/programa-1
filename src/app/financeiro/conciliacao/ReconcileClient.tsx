"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, CardHeader, Table, Td, Th, Thead, Tr } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  parseAndMatchAction,
  confirmMatchesAction,
  createFromBankTxnAction,
  type MatchRow,
} from "./actions";

export default function ReconcileClient() {
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [createdIds, setCreatedIds] = useState<Set<string>>(new Set());

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
      setSelected(
        new Set((result.rows ?? []).filter((r) => r.status === "casou").map((r) => r.txn.fitId)),
      );
    });
  }

  function handleConfirm() {
    if (!rows) return;
    const toConfirm = rows
      .filter((r) => r.status === "casou" && r.match && selected.has(r.txn.fitId))
      .map((r) => ({
        kind: r.match!.kind,
        id: r.match!.id,
        fitId: r.txn.fitId,
        date: r.txn.date,
      }));
    if (toConfirm.length === 0) {
      setMessage({ tone: "err", text: "Nenhuma transação selecionada para conciliar." });
      return;
    }
    startTransition(async () => {
      const { done } = await confirmMatchesAction(toConfirm);
      setMessage({
        tone: "ok",
        text: `${done} transação(ões) conciliada(s) com sucesso. Pendentes casadas receberam baixa automática.`,
      });
      setRows(
        (prev) =>
          prev?.map((r) =>
            selected.has(r.txn.fitId) && r.status === "casou"
              ? { ...r, status: "ja_conciliado" as const }
              : r,
          ) ?? null,
      );
      setSelected(new Set());
    });
  }

  function handleCreate(row: MatchRow) {
    startTransition(async () => {
      await createFromBankTxnAction(row.txn);
      setCreatedIds((prev) => new Set(prev).add(row.txn.fitId));
      setMessage({
        tone: "ok",
        text: `Lançamento criado e conciliado: ${row.txn.memo}`,
      });
    });
  }

  const matched = rows?.filter((r) => r.status === "casou") ?? [];
  const unmatched = rows?.filter((r) => r.status === "sem_match") ?? [];
  const already = rows?.filter((r) => r.status === "ja_conciliado") ?? [];

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
              description="O sistema casou estas transações do banco com contas do sistema — confira e confirme"
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
                    <Th>Conta no sistema</Th>
                    <Th>Situação</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {matched.map((r) => (
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
                      <Td className="max-w-[260px] truncate text-slate-600">{r.txn.memo}</Td>
                      <Td
                        className={`text-right tabular-nums ${
                          r.txn.amount < 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {formatCurrency(r.txn.amount)}
                      </Td>
                      <Td className="max-w-[260px] truncate font-medium text-slate-900">
                        {r.match?.description}
                      </Td>
                      <Td>
                        <Badge tone={r.match?.settled ? "success" : "warning"}>
                          {r.match?.settled ? "Já baixada" : "Pendente → baixa automática"}
                        </Badge>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title={`3. Sem correspondência (${unmatched.length})`}
              description="Movimentações do banco que não existem no sistema — crie o lançamento com um clique"
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
                      <Td className="max-w-[320px] truncate text-slate-700">{r.txn.memo}</Td>
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
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => handleCreate(r)}
                            className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
                          >
                            {r.txn.amount < 0 ? "Criar conta paga" : "Criar recebimento"}
                          </button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {already.length > 0 ? (
            <Card className="px-5 py-4">
              <p className="text-sm text-slate-500">
                {already.length} transação(ões) do extrato já estavam conciliadas anteriormente.
              </p>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
