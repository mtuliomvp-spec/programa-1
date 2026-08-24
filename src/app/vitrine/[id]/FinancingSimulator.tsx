"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { simulate, prazosAte, SIMULATOR_DISCLAIMER } from "@/lib/financing";

export type SimulatorRate = {
  id: string;
  name: string;
  monthlyRate: number;
  source: "LOJA" | "BCB";
  bcbReferenceLabel: string | null;
  maxInstallments: number;
  minDownPercent: number;
};

/**
 * Simulador da vitrine: o cliente escolhe entrada e prazo e vê a parcela
 * estimada de cada financeira. A conta roda no próprio navegador (Tabela
 * Price) — não há ida ao servidor a cada toque, e nenhum dado do visitante
 * é enviado.
 */
export default function FinancingSimulator({
  price,
  rates,
  whatsappBase,
  vehicleTitle,
}: {
  price: number;
  rates: SimulatorRate[];
  /** Link do WhatsApp da loja, sem o texto (o simulador monta a mensagem). */
  whatsappBase: string | null;
  vehicleTitle: string;
}) {
  const entradaMinima = Math.max(...rates.map((r) => r.minDownPercent), 0);
  const [percentEntrada, setPercentEntrada] = useState(Math.max(20, entradaMinima));
  const prazosDisponiveis = useMemo(() => {
    const maior = Math.max(...rates.map((r) => r.maxInstallments));
    return prazosAte(maior).filter((p) => p >= 12);
  }, [rates]);
  const [prazo, setPrazo] = useState(() => (prazosDisponiveis.includes(48) ? 48 : prazosDisponiveis.at(-1) || 48));

  const entrada = Math.round((price * percentEntrada) / 100);

  const linhas = rates
    .map((r) => {
      const parcelas = Math.min(prazo, r.maxInstallments);
      const entradaExigida = Math.ceil((price * r.minDownPercent) / 100);
      const abaixoDaEntrada = entrada < entradaExigida;
      return {
        ...r,
        parcelas,
        abaixoDaEntrada,
        entradaExigida,
        sim: simulate({ price, downPayment: entrada, months: parcelas, monthlyRatePercent: r.monthlyRate }),
      };
    })
    .sort((a, b) => a.sim.installment - b.sim.installment);

  const melhor = linhas.find((l) => !l.abaixoDaEntrada) ?? linhas[0];

  const zap = whatsappBase
    ? `${whatsappBase}${whatsappBase.includes("?") ? "&" : "?"}text=${encodeURIComponent(
        `Olá! Simulei o ${vehicleTitle} no site: entrada de ${formatCurrency(entrada)} e ${melhor.parcelas}x de ` +
          `${formatCurrency(melhor.sim.installment)} (${melhor.name}). Podemos conversar?`,
      )}`
    : null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">💳 Simule seu financiamento</h2>
      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Escolha a entrada e o prazo para ver a parcela estimada.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Entrada: <strong>{formatCurrency(entrada)}</strong>{" "}
            <span className="text-slate-400">({percentEntrada}%)</span>
          </span>
          <input
            type="range"
            min={0}
            max={80}
            step={5}
            value={percentEntrada}
            onChange={(e) => setPercentEntrada(Number(e.target.value))}
            className="mt-2 w-full accent-blue-600"
            aria-label="Percentual de entrada"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Prazo</span>
          <select
            value={prazo}
            onChange={(e) => setPrazo(Number(e.target.value))}
            className="mt-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          >
            {prazosDisponiveis.map((p) => (
              <option key={p} value={p}>
                {p}x
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul className="mt-4 space-y-2">
        {linhas.map((l) => (
          <li
            key={l.id}
            className={`rounded-xl border px-4 py-3 ${
              l.abaixoDaEntrada
                ? "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-800"
                : "border-slate-200 dark:border-slate-700"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100">{l.name}</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {l.parcelas}x de {formatCurrency(l.sim.installment)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {l.abaixoDaEntrada ? (
                <span className="text-amber-600 dark:text-amber-400">
                  Entrada mínima de {formatCurrency(l.entradaExigida)} ({l.minDownPercent}%) —
                  aumente a entrada para esta opção valer.{" "}
                </span>
              ) : null}
              Juros {l.monthlyRate.toFixed(2).replace(".", ",")}% a.m. (
              {l.sim.yearlyRatePercent.toFixed(2).replace(".", ",")}% a.a.) · financiado{" "}
              {formatCurrency(l.sim.financed)} · total das parcelas {formatCurrency(l.sim.total)} · com a entrada{" "}
              {formatCurrency(l.sim.totalWithDown)}
              {l.source === "BCB" ? (
                <> · taxa média do Banco Central{l.bcbReferenceLabel ? ` em ${l.bcbReferenceLabel}` : ""}</>
              ) : null}
            </p>
          </li>
        ))}
      </ul>

      {zap ? (
        <a
          href={zap}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Enviar esta simulação no WhatsApp
        </a>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        {SIMULATOR_DISCLAIMER}
      </p>
    </section>
  );
}
