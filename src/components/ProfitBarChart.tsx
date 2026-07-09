"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";

type MonthProfit = { label: string; lucroLiquido: number };

const WIDTH = 640;
const HEIGHT = 240;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 28;
const PADDING_X = 16;

/** Lucro líquido mensal: barras divergentes (azul = lucro, vermelho = prejuízo). */
export default function ProfitBarChart({ data }: { data: MonthProfit[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.lucroLiquido)));
  const plotHeight = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const baselineY = PADDING_TOP + plotHeight / 2;
  const halfHeight = plotHeight / 2;
  const bandWidth = (WIDTH - PADDING_X * 2) / data.length;
  const barWidth = Math.min(30, bandWidth * 0.5);

  function scale(value: number) {
    return (Math.abs(value) / maxAbs) * (halfHeight - 14);
  }

  return (
    <div className="viz-root">
      <style>{`
        .viz-root {
          --surface-1: #fcfcfb;
          --text-primary: #0b0b0b;
          --text-muted: #898781;
          --gridline: #e1e0d9;
          --baseline: #c3c2b7;
          --pos: #2a78d6;
          --neg: #e34948;
        }
        @media (prefers-color-scheme: dark) {
          .viz-root {
            --surface-1: #1a1a19;
            --text-primary: #ffffff;
            --text-muted: #898781;
            --gridline: #2c2c2a;
            --baseline: #383835;
            --pos: #3987e5;
            --neg: #e66767;
          }
        }
      `}</style>

      <div className="mb-3 flex items-center gap-4 text-xs font-medium text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--pos)" }} />
          Lucro
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--neg)" }} />
          Prejuízo
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Lucro líquido por mês"
        className="w-full"
        style={{ background: "var(--surface-1)" }}
      >
        <line
          x1={PADDING_X}
          x2={WIDTH - PADDING_X}
          y1={baselineY - halfHeight}
          y2={baselineY - halfHeight}
          stroke="var(--gridline)"
          strokeWidth={1}
        />
        <line
          x1={PADDING_X}
          x2={WIDTH - PADDING_X}
          y1={baselineY + halfHeight}
          y2={baselineY + halfHeight}
          stroke="var(--gridline)"
          strokeWidth={1}
        />
        <line x1={PADDING_X} x2={WIDTH - PADDING_X} y1={baselineY} y2={baselineY} stroke="var(--baseline)" strokeWidth={1} />

        {data.map((d, i) => {
          const cx = PADDING_X + bandWidth * i + bandWidth / 2;
          const h = scale(d.lucroLiquido);
          const positive = d.lucroLiquido >= 0;
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
                y={positive ? baselineY - h : baselineY}
                width={barWidth}
                height={h}
                rx={4}
                fill={positive ? "var(--pos)" : "var(--neg)"}
                opacity={isHovered || hovered === null ? 1 : 0.45}
              />
              {isHovered ? (
                <text
                  x={cx}
                  y={positive ? baselineY - h - 8 : baselineY + h + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--text-primary)"
                >
                  {formatCurrency(d.lucroLiquido)}
                </text>
              ) : null}
              {data.length <= 8 || i % 2 === (data.length - 1) % 2 ? (
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
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
