"use client";

import { useId, useState } from "react";
import { formatCurrency } from "@/lib/format";

type MonthData = { label: string; entradas: number; saidas: number };

const WIDTH = 640;
const HEIGHT = 260;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 28;
const PADDING_X = 16;

export default function CashFlowChart({ data }: { data: MonthData[] }) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  const maxValue = Math.max(1, ...data.map((d) => Math.max(d.entradas, d.saidas)));
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const baselineY = PADDING_TOP + plotHeight / 2;
  const halfHeight = plotHeight / 2;
  const bandWidth = (WIDTH - PADDING_X * 2) / data.length;
  const barWidth = Math.min(28, bandWidth * 0.42);

  function scale(value: number) {
    return (value / maxValue) * (halfHeight - 12);
  }

  const gridSteps = [0.5, 1];

  return (
    <div className="viz-root">
      <style>{`
        .viz-root {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-secondary: #52514e;
          --text-muted: #898781;
          --gridline: #e1e0d9;
          --baseline: #c3c2b7;
          --series-entradas: #2a78d6;
          --series-saidas: #e34948;
        }
        @media (prefers-color-scheme: dark) {
          .viz-root {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-secondary: #c3c2b7;
            --text-muted: #898781;
            --gridline: #2c2c2a;
            --baseline: #383835;
            --series-entradas: #3987e5;
            --series-saidas: #e66767;
          }
        }
      `}</style>

      <div className="mb-3 flex items-center gap-4 text-xs font-medium text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--series-entradas)" }} />
          Entradas (recebido)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--series-saidas)" }} />
          Saídas (pago)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Gráfico de entradas e saídas de caixa por mês"
        className="w-full"
        style={{ background: "var(--surface-1)" }}
      >
        <title id={gradientId}>Fluxo de caixa mensal</title>

        {gridSteps.map((step) => (
          <g key={step}>
            <line
              x1={PADDING_X}
              x2={WIDTH - PADDING_X}
              y1={baselineY - halfHeight * step}
              y2={baselineY - halfHeight * step}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
            <line
              x1={PADDING_X}
              x2={WIDTH - PADDING_X}
              y1={baselineY + halfHeight * step}
              y2={baselineY + halfHeight * step}
              stroke="var(--gridline)"
              strokeWidth={1}
            />
          </g>
        ))}

        <line x1={PADDING_X} x2={WIDTH - PADDING_X} y1={baselineY} y2={baselineY} stroke="var(--baseline)" strokeWidth={1} />

        {data.map((d, i) => {
          const cx = PADDING_X + bandWidth * i + bandWidth / 2;
          const entradaH = scale(d.entradas);
          const saidaH = scale(d.saidas);
          const isHovered = hovered === i;

          return (
            <g
              key={d.label}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              <rect x={cx - bandWidth / 2} y={PADDING_TOP} width={bandWidth} height={plotHeight} fill="transparent" />

              <rect
                x={cx - barWidth / 2}
                y={baselineY - entradaH}
                width={barWidth}
                height={entradaH}
                rx={4}
                fill="var(--series-entradas)"
                opacity={isHovered || hovered === null ? 1 : 0.45}
              />
              <rect
                x={cx - barWidth / 2}
                y={baselineY}
                width={barWidth}
                height={saidaH}
                rx={4}
                fill="var(--series-saidas)"
                opacity={isHovered || hovered === null ? 1 : 0.45}
              />

              {isHovered ? (
                <text x={cx} y={baselineY - entradaH - 8} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-primary)">
                  {formatCurrency(d.entradas)}
                </text>
              ) : null}
              {isHovered ? (
                <text x={cx} y={baselineY + saidaH + 16} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-primary)">
                  {formatCurrency(d.saidas)}
                </text>
              ) : null}

              <text
                x={cx}
                y={HEIGHT - 8}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text-muted)"
                style={{ textTransform: "capitalize" }}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="text-[var(--text-muted)]">
            <tr>
              <th className="py-1 pr-4 font-medium">Mês</th>
              <th className="py-1 pr-4 font-medium">Entradas</th>
              <th className="py-1 pr-4 font-medium">Saídas</th>
              <th className="py-1 font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t border-[var(--gridline)]">
                <td className="py-1.5 pr-4 capitalize text-[var(--text-secondary)]">{d.label}</td>
                <td className="py-1.5 pr-4 tabular-nums text-[var(--text-primary)]">{formatCurrency(d.entradas)}</td>
                <td className="py-1.5 pr-4 tabular-nums text-[var(--text-primary)]">{formatCurrency(d.saidas)}</td>
                <td
                  className="py-1.5 tabular-nums font-medium"
                  style={{ color: d.entradas - d.saidas >= 0 ? "#006300" : "#c62a2a" }}
                >
                  {formatCurrency(d.entradas - d.saidas)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
