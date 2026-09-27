"use client";

import { startTransition, useActionState, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { Button, Field, Input, Select } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import { cobrirLivreNegativoAction, type CapitalFormState } from "../actions";

type AppliedAccount = { accountId: string; accountName: string; applied: number };
type Substitute = { id: string; name: string; free: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cobrir o saldo livre NEGATIVO do sócio com a fatia aplicada dele: outro
 * sócio, com capital livre, assume parte do aplicado. Não sai dinheiro do
 * caixa — só muda de quem é a fatia na conta de Aplicação.
 */
export default function CoverNegativeFreeForm({
  beneficiaryId,
  beneficiaryName,
  devido,
  appliedAccounts,
  substitutes,
  caixaData,
}: {
  beneficiaryId: string;
  beneficiaryName: string;
  /** Quanto o livre está negativo (valor positivo). */
  devido: number;
  appliedAccounts: AppliedAccount[];
  substitutes: Substitute[];
  /** Data do caixa aberto (dd/mm/aaaa) — a do par no livro caixa. Null = caixa fechado. */
  caixaData: string | null;
}) {
  const [state, submit, pending] = useActionState(cobrirLivreNegativoAction, {} as CapitalFormState);
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(appliedAccounts[0]?.accountId ?? "");
  const [substituteId, setSubstituteId] = useState("");
  const conta = appliedAccounts.find((a) => a.accountId === accountId);
  const sugerido = round2(Math.min(devido, conta?.applied ?? 0));
  const [valor, setValor] = useState(sugerido);

  const candidatos = substitutes.filter((s) => s.free > 0.005);
  const substituto = substitutes.find((s) => s.id === substituteId);

  if (appliedAccounts.length === 0) return null;

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">Cobrir saldo livre negativo</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {beneficiaryName} está com <strong>{formatCurrency(devido)}</strong> de livre negativo (mais
            aplicado do que capital). Outro sócio, com capital livre, <strong>assume parte da fatia
            aplicada</strong>: o livre dele vira aplicado e o livre de {beneficiaryName} volta a zero. Não sai
            dinheiro do caixa — o livro caixa recebe um par (entrada e saída iguais na conta de Aplicação) só
            para registro.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100"
        >
          {open ? "Fechar" : "Cobrir com outro sócio"}
        </button>
      </div>

      {open ? (
        <form
          action={submit}
          // Sem o reset automático do <form action>: com erro, o que foi
          // escolhido continua na tela.
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => submit(fd));
          }}
          className="mt-4 space-y-3 border-t border-rose-200 pt-4"
        >
          {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
          {state.message ? <p className="text-sm text-emerald-700">{state.message}</p> : null}
          <input type="hidden" name="beneficiaryId" value={beneficiaryId} />
          <Field label="De qual aplicação sai a fatia?" required>
            <Select name="accountId" required value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {appliedAccounts.map((a) => (
                <option key={a.accountId} value={a.accountId}>
                  {a.accountName} · aplicado {formatCurrency(a.applied)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quem assume a fatia (aplica o valor)" required>
            <Select name="substituteId" required value={substituteId} onChange={(e) => setSubstituteId(e.target.value)}>
              <option value="">Selecione…</option>
              {candidatos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · capital livre {formatCurrency(s.free)}
                </option>
              ))}
            </Select>
            {candidatos.length === 0 ? (
              <span className="mt-1 block text-xs text-rose-600">
                Nenhum sócio tem capital livre para assumir a fatia agora.
              </span>
            ) : null}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor a cobrir (R$)" required>
              <MoneyInput
                key={`${accountId}-${sugerido}`}
                name="amount"
                required
                defaultValue={sugerido}
                onValueChange={setValor}
              />
            </Field>
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Data</span>
              <span className="flex h-10 items-center rounded-lg bg-white px-3 text-slate-700">
                {caixaData ? `${caixaData} (caixa)` : "caixa fechado"}
              </span>
            </div>
          </div>
          {!caixaData ? (
            <p className="text-xs text-rose-600">
              Abra o caixa em Contas e caixas: o par do livro caixa leva a data do caixa aberto.
            </p>
          ) : null}
          <Field label="Observação">
            <Input name="description" placeholder="Opcional" />
          </Field>
          {valor > 0 ? (
            <div className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
              <p>
                Depois: livre de <strong>{beneficiaryName}</strong> fica em{" "}
                <strong className={devido - valor > 0.005 ? "text-rose-600" : "text-emerald-700"}>
                  {formatCurrency(round2(valor - devido))}
                </strong>{" "}
                · aplicado em {conta?.accountName ?? "—"} cai para{" "}
                {formatCurrency(round2((conta?.applied ?? 0) - valor))}.
              </p>
              {substituto ? (
                <p>
                  <strong>{substituto.name}</strong>: livre {formatCurrency(substituto.free)} →{" "}
                  <strong className={substituto.free - valor < -0.005 ? "text-rose-600" : ""}>
                    {formatCurrency(round2(substituto.free - valor))}
                  </strong>{" "}
                  (o valor passa a ser aplicado dele).
                </p>
              ) : null}
            </div>
          ) : null}
          <Button type="submit" disabled={pending || candidatos.length === 0 || !caixaData} className="w-full">
            {pending ? "Registrando…" : "Confirmar cobertura"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
