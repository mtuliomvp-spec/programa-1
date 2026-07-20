import type { Metadata } from "next";
import Link from "next/link";
import { getCompany } from "@/lib/company";
import { formatCurrency } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import { getShowroomVehicles, whatsappLink, vehicleTitle } from "./shared";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompany().catch(() => null);
  const nome = company?.nomeFantasia || "MVP Veículos";
  return {
    title: `${nome} — Veículos à venda`,
    description: `Confira os veículos seminovos à venda na ${nome}. Fotos, preços e contato direto pelo WhatsApp.`,
  };
}

export default async function VitrinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = ((await searchParams).q || "").trim();
  const [company, allVehicles] = await Promise.all([
    getCompany().catch(() => null),
    getShowroomVehicles(),
  ]);
  const nome = company?.nomeFantasia || "MVP Veículos";
  const zapGeral = whatsappLink(
    company?.phone,
    `Olá! Vi os veículos no site da ${nome} e gostaria de mais informações.`,
  );

  const vehicles = q
    ? allVehicles.filter((v) =>
        matchesSearch(
          q,
          v.brand,
          v.model,
          v.version,
          v.color,
          v.fuel,
          v.transmission,
          `${v.manufactureYear}/${v.modelYear}`,
          v.manufactureYear,
          v.modelYear,
          v.salePrice,
          formatCurrency(v.salePrice),
        ),
      )
    : allVehicles;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Cabeçalho público */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {company?.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoDataUrl} alt="" className="h-9 w-auto" />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-base font-black tracking-tight text-slate-900">{nome}</p>
              <p className="text-[11px] text-slate-500">Gestão de seminovos</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {zapGeral ? (
              <a
                href={zapGeral}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                💬 WhatsApp
              </a>
            ) : null}
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Entrar
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">Veículos à venda</h1>
        <p className="mt-1 text-sm text-slate-500">
          {vehicles.length} veículo(s) disponíveis — fale com a equipe pelo WhatsApp.
        </p>

        <form className="mt-4 flex max-w-xl gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por marca, modelo, ano, cor..."
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700"
          >
            Buscar
          </button>
        </form>

        {vehicles.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            {q ? "Nenhum veículo encontrado para a busca." : "Nenhum veículo anunciado no momento — volte em breve!"}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => {
              const titulo = vehicleTitle(v);
              const zap = whatsappLink(
                company?.phone,
                `Olá! Tenho interesse no ${titulo} anunciado por ${formatCurrency(v.salePrice)} no site da ${nome}.`,
              );
              return (
                <div key={v.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <Link href={`/vitrine/${v.id}`} className="block">
                    {v.photoIds[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/vitrine/foto/${v.photoIds[0]}`}
                        alt={titulo}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-5xl">
                        🚗
                      </div>
                    )}
                  </Link>
                  <div className="p-4">
                    <Link href={`/vitrine/${v.id}`} className="block">
                      <p className="truncate font-semibold text-slate-900">
                        {v.brand} {v.model}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {[v.version, `${v.manufactureYear}/${v.modelYear}`, `${v.km.toLocaleString("pt-BR")} km`, v.fuel]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-2 text-xl font-black text-slate-900">{formatCurrency(v.salePrice)}</p>
                    </Link>
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/vitrine/${v.id}`}
                        className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Ver detalhes
                      </Link>
                      {zap ? (
                        <a
                          href={zap}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          💬 Tenho interesse
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="mt-10 border-t border-slate-200 pt-6 pb-8 text-center text-xs text-slate-400">
          {nome}
          {company?.address ? ` · ${company.address}` : ""}
          {company?.city ? ` — ${company.city}${company.uf ? `/${company.uf}` : ""}` : ""}
          {company?.phone ? ` · ${company.phone}` : ""}
        </footer>
      </main>
    </div>
  );
}
