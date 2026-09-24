"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { dismissQueuedPaymentAction } from "./actions";
import type { DiaAdiante, PagamentoNaFila } from "@/lib/payment-queue";

/** Os ids de título que a linha carrega — o lote devolve todos os que cobre. */
function idsDaLinha(p: PagamentoNaFila): string[] {
  return p.kind === "lote" ? (p.itens ?? []).map((i) => i.id) : [p.id];
}

/**
 * Pagamentos já feitos em dias À FRENTE do movimento aberto.
 *
 * O caixa está no dia 08 e a conta foi paga hoje, dia 09: o dinheiro já saiu do
 * banco, mas a baixa só entra quando o movimento chegar no dia 09 (todo
 * lançamento tem a data do caixa aberto). Sem isto, o dinheiro ficava invisível
 * nesta tela — o saldo mostrado era o de ontem, sem dizer que já havia saída
 * de hoje esperando.
 *
 * Aqui é a conta do dia e, ao clicar, a lista do que foi pago. Nada é
 * CONFIRMADO por esta tela — a baixa só acontece na fila, quando o caixa
 * alcançar o dia. Mas desfazer tem que caber aqui: quem errou o pré-lançamento
 * de um dia à frente não tem como esperar o caixa chegar lá só para poder
 * apagar, então cada linha tem o mesmo "tirar da fila" da fila de espera.
 */
export default function FuturePaymentsCard({
  dias,
  workDateLabel,
  canPagar,
}: {
  dias: DiaAdiante[];
  /** Data do movimento aberto; vazio quando não há caixa aberto. */
  workDateLabel: string;
  canPagar: boolean;
}) {
  const router = useRouter();
  // O primeiro dia já abre: normalmente é "hoje", o que a pessoa quer ver.
  const [aberto, setAberto] = useState<string | null>(dias[0]?.date ?? null);
  // Lote (um boleto só) aberto nos títulos que ele cobre.
  const [loteAberto, setLoteAberto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Linhas já tiradas da fila: somem da tela na hora, sem esperar a página ser
  // redesenhada pelo servidor. Sem isto o lançamento continuava aparecendo
  // depois do clique e parecia que a exclusão não tinha funcionado.
  const [removidas, setRemovidas] = useState<string[]>([]);
  const [dismissing, startDismiss] = useTransition();

  function descartar(p: PagamentoNaFila) {
    const ids = idsDaLinha(p);
    const pergunta =
      ids.length > 1
        ? `Tirar da fila os ${ids.length} títulos deste boleto? Os anexos continuam neles.`
        : p.avulso
          ? // Avulso nasceu no movimento de caixa só para ser pago: tirar da
            // fila o apaga, em vez de deixar um título solto no a pagar.
            "Este lançamento foi feito no movimento de caixa e será APAGADO (não é um título do Contas a pagar). Continuar?"
          : p.kind === "financiamento" || p.kind === "retorno"
            ? "Tirar da fila? Nada é creditado e a venda volta a mostrar o \"Receber\" em Financiamentos."
            : "Tirar este pré-lançamento da fila? O anexo continua no título.";
    if (!confirm(pergunta)) return;
    setErro(null);
    setRemovidas((prev) => [...prev, p.id]);
    startDismiss(async () => {
      for (const id of ids) {
        const res = await dismissQueuedPaymentAction(id);
        if (!res.ok) {
          // Deu errado: a linha volta para a tela, senão o pré-lançamento
          // sumiria daqui continuando de pé no banco de dados.
          setRemovidas((prev) => prev.filter((x) => x !== p.id));
          setErro(res.error || "Não foi possível tirar da fila.");
          break;
        }
      }
      router.refresh();
    });
  }

  // O que continua na tela depois das retiradas, com os totais refeitos: o
  // valor do card tem que cair junto com a linha que saiu.
  const visiveis = dias
    .map((d) => {
      const pagamentos = d.pagamentos.filter((p) => !removidas.includes(p.id));
      return {
        date: d.date,
        pagamentos,
        total: pagamentos.filter((p) => p.direcao !== "entrada").reduce((s, p) => s + p.amount, 0),
        totalEntradas: pagamentos
          .filter((p) => p.direcao === "entrada")
          .reduce((s, p) => s + p.amount, 0),
      };
    })
    .filter((d) => d.pagamentos.length > 0);

  if (visiveis.length === 0) return null;

  const total = visiveis.reduce((s, d) => s + d.total, 0);
  const totalEntradas = visiveis.reduce((s, d) => s + d.totalEntradas, 0);
  const partes = [
    total > 0.005 ? `💸 ${formatCurrency(total)} já pago` : null,
    totalEntradas > 0.005 ? `💰 ${formatCurrency(totalEntradas)} já recebido` : null,
  ].filter(Boolean);

  return (
    <Card className="mb-4 border border-sky-200 bg-sky-50/40">
      <CardHeader
        title={`${partes.join(" · ")}${visiveis.length > 1 ? ` em ${visiveis.length} dias` : ""} à frente do movimento`}
        description={
          workDateLabel
            ? `O dinheiro já passou pelo banco, mas o movimento ainda está em ${workDateLabel}. Ao abrir o caixa desses dias, os lançamentos aparecem prontos para o ok.`
            : "O dinheiro já passou pelo banco. Abra o caixa do dia para confirmar a baixa."
        }
      />
      <div className="divide-y divide-sky-100">
        {visiveis.map((d) => {
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
                  {d.pagamentos.map((p) => {
                    const lote = p.kind === "lote";
                    const abertoLote = loteAberto === p.id;
                    return (
                      <li key={p.id} className="px-5 py-2.5">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900">
                              {lote ? (
                                // O lote não leva a lugar nenhum: ele ABRE nos
                                // títulos que o boleto cobre, aqui mesmo.
                                <button
                                  type="button"
                                  onClick={() => setLoteAberto(abertoLote ? null : p.id)}
                                  className="text-left text-blue-700 hover:underline"
                                  aria-expanded={abertoLote}
                                >
                                  <span aria-hidden className="mr-1 text-slate-400">
                                    {abertoLote ? "▾" : "▸"}
                                  </span>
                                  🧾 {p.description}
                                </button>
                              ) : (
                                <Link href={p.href} className="text-blue-700 hover:underline">
                                  {p.kind === "combo"
                                    ? `🧺 ${p.description} · ${p.titulos} título${p.titulos === 1 ? "" : "s"}`
                                    : `${p.direcao === "entrada" ? "💰 " : ""}${p.orderNumber ? `${String(p.orderNumber).padStart(4, "0")} · ` : ""}${p.description}`}
                                </Link>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {p.supplierName ? `${p.supplierName} · ` : ""}
                              {p.accountName
                                ? `${p.direcao === "entrada" ? "credita em" : "debita em"} ${p.accountName}`
                                : "conta a escolher no ok"}
                              {" · "}
                              {p.rotuloData ?? (p.kind === "combo" || lote ? "mais antigo vencia em " : "vencia em ")}
                              {formatDate(p.dueDate)}
                            </p>
                            {p.note ? (
                              <p className="mt-1 text-xs font-medium text-amber-700">⚠ {p.note}</p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            {lote ? (
                              <button
                                type="button"
                                onClick={() => setLoteAberto(abertoLote ? null : p.id)}
                                className="block w-full text-right text-sm font-semibold tabular-nums text-rose-600 hover:underline"
                                aria-expanded={abertoLote}
                                title="Ver os títulos deste boleto"
                              >
                                −{formatCurrency(p.amount)}
                              </button>
                            ) : (
                              <p
                                className={`text-sm font-semibold tabular-nums ${
                                  p.direcao === "entrada" ? "text-emerald-600" : "text-rose-600"
                                }`}
                              >
                                {p.direcao === "entrada" ? "+" : "−"}
                                {formatCurrency(p.amount)}
                              </p>
                            )}
                            {Math.abs(p.amount - p.tituloAmount) > 0.005 ? (
                              <p className="text-[11px] text-slate-400">
                                {p.rotuloValor ?? (p.kind === "combo" ? "combo" : "título")}{" "}
                                {formatCurrency(p.tituloAmount)}
                              </p>
                            ) : null}
                            {canPagar ? (
                              <button
                                type="button"
                                onClick={() => descartar(p)}
                                disabled={dismissing}
                                className="mt-1 text-[11px] font-medium text-slate-400 hover:text-rose-600 hover:underline disabled:opacity-50"
                              >
                                tirar da fila
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {lote && abertoLote ? (
                          <ul className="mt-2 space-y-1 border-l-2 border-sky-200 pl-3">
                            {(p.itens ?? []).map((i) => (
                              <li key={i.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                                <Link
                                  href={i.href}
                                  className="min-w-0 flex-1 text-blue-700 hover:underline"
                                >
                                  {i.orderNumber
                                    ? `${String(i.orderNumber).padStart(4, "0")} · `
                                    : ""}
                                  {i.description}
                                </Link>
                                <span className="text-slate-400">
                                  vencia em {formatDate(i.dueDate)}
                                </span>
                                <span className="tabular-nums font-medium text-rose-600">
                                  −{formatCurrency(i.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
      {erro ? (
        <p className="border-t border-sky-100 px-5 py-2.5 text-sm font-medium text-rose-600">
          {erro}
        </p>
      ) : null}
      <p className="border-t border-sky-100 px-5 py-2.5 text-xs text-slate-500">
        Estes valores <strong>ainda não estão</strong> no saldo das contas abaixo: eles entram na
        baixa, quando o movimento do dia for aberto e você der o ok.
        {canPagar ? " Errou o pré-lançamento? Use o “tirar da fila” da linha para desfazer." : ""}
      </p>
    </Card>
  );
}
