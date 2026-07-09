import clsx from "@/lib/clsx";

export default function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-[11px] font-black tracking-tight text-white shadow-md">
        MVP
      </div>
      <div className="leading-tight">
        <p className={clsx("text-sm font-bold tracking-tight", dark ? "text-white" : "text-slate-900")}>
          MVP Veículos
        </p>
        <p className={clsx("text-[11px]", dark ? "text-slate-400" : "text-slate-500")}>
          Gestão de seminovos
        </p>
      </div>
    </div>
  );
}
