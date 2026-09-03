import clsx from "@/lib/clsx";
import { buildDateLabel, versaoLabel } from "@/lib/app-version";

export default function BrandMark({
  dark = false,
  name = "MVP Veículos",
  logoDataUrl = null,
}: {
  dark?: boolean;
  name?: string;
  logoDataUrl?: string | null;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      {logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoDataUrl} alt="" className="h-9 w-9 rounded-xl bg-white object-contain shadow-md" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-[11px] font-black tracking-tight text-white shadow-md">
          {initials}
        </div>
      )}
      <div className="leading-tight">
        <p className={clsx("text-sm font-bold tracking-tight", dark ? "text-white" : "text-slate-900")}>
          {name}
        </p>
        <p className={clsx("text-[11px]", dark ? "text-slate-400" : "text-slate-500")}>
          Gestão de seminovos
        </p>
        {/* Contador de versão: número do PR que está no ar (ver next.config.ts). */}
        <p
          className={clsx("text-[10px] font-medium tabular-nums", dark ? "text-sky-300/80" : "text-blue-600/80")}
          title={buildDateLabel() ? `Publicada em ${buildDateLabel()}` : undefined}
        >
          {versaoLabel()}
        </p>
      </div>
    </div>
  );
}
