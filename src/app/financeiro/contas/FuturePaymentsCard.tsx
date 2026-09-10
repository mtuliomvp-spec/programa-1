"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DiaAdiante } from "@/lib/payment-queue";

/**
 * Pagamentos já feitos em dias À FRENTE do movimento aberto.
 *
 * O caixa está no dia 08 e a conta foi paga hoje, dia 09: o dinheiro já saiu do
 * banco, mas a baixa só entra quando o movimento chegar no dia 09 (todo
 * lançamento tem a data do caixa aberto). Sem isto, o dinheiro ficava invisível
 * nesta tela — o saldo mostrado era o de ontem, sem dizer que já havia saída
 * de hoje esperando.
 *
 * Aqui é só a conta: o total de cada dia, e ao clicar a lista do que foi pago.
 * Nada é confirmado por esta tela — quando o caixa daquele dia for aberto, os
 * mesmos pagamentos aparecem na fila de sempre, com o ok para debitar.
 */
export default function FuturePaymentsCard({
  dias,
  workDateLabel,
}: {
  dias: DiaAdiante[];
  /** Data do movimento aberto; vazio quando não há caixa aberto. */
  workDateLabel: string;
}) {
  // O primeiro dia já abre: normalmente é "hoje", o que a pessoa quer ver.
  const [aberto, setAberto] = useState<string | null>(dias[0]?.date ?? null);

  if (dias.length === 0) return null;

  const total = dias.reduce((s, d) => s + d.total, 0);
  const totalEntradas = dias.reduce((s, d) => s + d.totalEntradas, 0);
  const partes = [
    total > 0.005 ? `💸 ${formatCurrency(total)} já pago` : null,
    totalEntradas > 0.005 ? `💰 ${formatCurrency(totalEntradas)} já recebido` : null,
  ].filter(Boolean);

  return (
    <Card className="mb-4 border border-sky-200 bg-sky-50/40">
      <CardHeader
        title={`${partes.join(" · ")}${dias.length > 1 ? ` em ${dias.length} dias` : ""} à frente do movimento`}
        description={
          workDateLabel
            ? `O dinheiro já passou pelo banco, mas o movimento ainda está em ${workDateLabel}. Ao abrir o caixa desses dias, os lançamentos aparecem prontos para o ok.`
            : "O dinheiro já passou pelo banco. Abra o caixa do dia para confirmar a baixa."
        }
      />
      <div className="divide-y divide-sky-100">
        {dias.map((d) => {
          const expandido = aberto === d.date;
          return (
            <div key={d.date}>
              <button
                type="button"
                onClick={() => setAberto(expandido ? null : d.date)}
                className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-3 text-left hover:bg-sky-50"
                aria-expanded={expandido}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <span aria-hidden className="text-slate-400">
                    {expandido ? "▾" : "▸"}
                  </span>
                  {formatDate(d.date)}
                  <span className="font-normal text-slate-500">
                    · {d.pagamentos.length} lançamento{d.pagamentos.length > 1 ? "s" : ""}
                  </span>
                </span>
                <span className="text-right">
                  {d.total > 0.005 ? (
                    <span className="block font-semibold tabular-nums text-rose-600">
                      −{formatCurrency(d.total)}
                    </span>
                  ) : null}
                  {d.totalEntradas > 0.005 ? (
                    <span className="block font-semibold tabular-nums text-emerald-600">
                      +{formatCurrency(d.totalEntradas)}
                    </span>
                  ) : null}
                </span>
              </button>

              {expandido ? (
                <ul className="divide-y divide-slate-100 border-t border-sky-100 bg-white">
                  {d.pagamentos.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-start gap-3 px-5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          <Link href={p.href} className="text-blue-700 hover:underline">
                            {p.kind === "combo"
                              ? `🧺 ${p.description} · ${p.titulos} título${p.titulos === 1 ? "" : "s"}`
                              : `${p.direcao === "entrada" ? "💰 " : ""}${p.orderNumber ? `${String(p.orderNumber).padStart(4, "0")} · ` : ""}${p.description}`}
                          </Link>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {p.supplierName ? `${p.supplierName} · ` : ""}
                          {p.accountName
                            ? `${p.direcao === "entrada" ? "credita em" : "debita em"} ${p.accountName}`
                            : "conta a escolher no ok"}
                          {" · "}
                          {p.kind === "combo" ? "mais antigo vencia em " : "vencia em "}
                          {formatDate(p.dueDate)}
                        </p>
                        {p.note ? (
                          <p className="mt-1 text-xs font-medium text-amber-700">⚠ {p.note}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-sm font-semibold tabular-nums ${
                            p.direcao === "entrada" ? "text-emerald-600" : "text-rose-600"
                          }`}
                        >
                          {p.direcao === "entrada" ? "+" : "−"}
                          {formatCurrency(p.amount)}
                        </p>
                        {Math.abs(p.amount - p.tituloAmount) > 0.005 ? (
                          <p className="text-[11px] text-slate-400">
                            {p.kind === "combo" ? "combo" : "título"} {formatCurrency(p.tituloAmount)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="border-t border-sky-100 px-5 py-2.5 text-xs text-slate-500">
        Estes valores <strong>ainda não estão</strong> no saldo das contas abaixo: eles entram na
        baixa, quando o movimento do dia for aberto e você der o ok.
      </p>
    </Card>
  );
}
