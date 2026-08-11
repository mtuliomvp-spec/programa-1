import Link from "next/link";
import { formatCurrency } from "@/lib/format";

type Tone = "green" | "blue" | "amber" | "violet" | "red" | "slate";

const border: Record<Tone, string> = {
  green: "border-l-emerald-500",
  blue: "border-l-blue-500",
  amber: "border-l-amber-500",
  violet: "border-l-violet-500",
  red: "border-l-rose-500",
  slate: "border-l-slate-400",
};
const valueColor: Record<Tone, string> = {
  green: "text-emerald-600",
  blue: "text-slate-900",
  amber: "text-amber-600",
  violet: "text-violet-600",
  red: "text-rose-600",
  slate: "text-slate-900",
};

export default function PatrimonialCard({
  label,
  value,
  tone,
  icon,
  sub,
  subItems,
  redItem,
  redItems,
  formula,
  href,
}: {
  label: string;
  value: number | string;
  tone: Tone;
  icon?: string;
  sub?: string;
  subItems?: { label: string; value: number }[];
  redItem?: { label: string; value: number; href?: string };
  redItems?: { label: string; value: number; href?: string }[];
  formula?: string;
  href?: string;
}) {
  const reds = [...(redItem ? [redItem] : []), ...(redItems ?? [])].filter((r) => r.value > 0);
  // Linha vermelha com link próprio: o card não pode ser um único <a> (link
  // dentro de link é inválido) — o cabeçalho vira o link do card e cada linha
  // com href vira o seu.
  const hasRowLinks = reds.some((r) => r.href);

  const header = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {icon ? <span aria-hidden className="text-lg">{icon}</span> : null}
      </div>
      <p className={`mt-1 text-2xl font-bold ${valueColor[tone]}`}>
        {typeof value === "number" ? formatCurrency(value) : value}
      </p>
      {subItems && subItems.length > 0 ? (
        <p className="mt-1 text-xs text-slate-400">
          {subItems.map((s, i) => (
            <span key={s.label}>
              {i > 0 ? " · " : ""}
              {s.label}: {formatCurrency(s.value)}
            </span>
          ))}
        </p>
      ) : null}
    </>
  );

  const rows = reds.map((r) =>
    r.href ? (
      <p key={r.label} className="mt-1 text-xs font-semibold text-rose-600">
        <Link
          href={r.href}
          className="underline decoration-rose-300 underline-offset-2 hover:decoration-rose-600"
          title="Ver os títulos que compõem este valor"
        >
          {r.label}: {formatCurrency(r.value)}
        </Link>
      </p>
    ) : (
      <p key={r.label} className="mt-1 text-xs font-semibold text-rose-600">
        {r.label}: {formatCurrency(r.value)}
      </p>
    ),
  );

  const tail = (
    <>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
      {formula ? <p className="mt-2 text-[11px] leading-tight text-slate-400">{formula}</p> : null}
    </>
  );

  if (hasRowLinks) {
    return (
      <div
        className={`h-full rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm ${border[tone]}`}
      >
        {href ? (
          <Link href={href} className="block transition-opacity hover:opacity-80">
            {header}
          </Link>
        ) : (
          header
        )}
        {rows}
        {tail}
      </div>
    );
  }

  const inner = (
    <div
      className={`h-full rounded-xl border border-slate-200 border-l-4 bg-white p-4 shadow-sm ${border[tone]} ${href ? "transition-shadow hover:shadow-md" : ""}`}
    >
      {header}
      {rows}
      {tail}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
