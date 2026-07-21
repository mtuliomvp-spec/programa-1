import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany } from "@/lib/company";
import { getBaseUrl } from "@/lib/base-url";
import { formatCurrency } from "@/lib/format";
import { getShowroomVehicle, whatsappLink, vehicleTitle } from "../shared";
import VitrineGallery from "./VitrineGallery";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [v, company] = await Promise.all([getShowroomVehicle(id), getCompany().catch(() => null)]);
  if (!v) return { title: "Veículo não encontrado" };
  const nome = company?.nomeFantasia || "MVP Veículos";
  const titulo = vehicleTitle(v);
  const base = await getBaseUrl();
  return {
    title: `${titulo} — ${formatCurrency(v.salePrice)} | ${nome}`,
    description: `${titulo} à venda na ${nome}: ${v.km.toLocaleString("pt-BR")} km${v.color ? `, ${v.color}` : ""}${v.fuel ? `, ${v.fuel}` : ""}. ${formatCurrency(v.salePrice)}. Fale com a equipe pelo WhatsApp.`,
    openGraph: v.photoIds[0]
      ? { images: [`${base}/vitrine/foto/${v.photoIds[0]}`], title: `${titulo} — ${formatCurrency(v.salePrice)}` }
      : undefined,
  };
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

export default async function VitrineVeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, company] = await Promise.all([getShowroomVehicle(id), getCompany().catch(() => null)]);
  if (!v) notFound();

  const nome = company?.nomeFantasia || "MVP Veículos";
  const titulo = vehicleTitle(v);
  const zap = whatsappLink(
    company?.phone,
    `Olá! Tenho interesse no ${titulo} anunciado por ${formatCurrency(v.salePrice)} no site da ${nome}.`,
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/vitrine" className="text-sm font-medium text-slate-700 hover:underline">
            ← Todos os veículos
          </Link>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {v.brand} {v.model}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {[v.version, `${v.manufactureYear}/${v.modelYear}`].filter(Boolean).join(" · ")}
        </p>

        {/* Galeria com lightbox navegável (setas/teclado no desktop, swipe no celular) */}
        {v.photoIds.length > 0 ? (
          <VitrineGallery photoIds={v.photoIds} title={titulo} />
        ) : (
          <div className="mt-4 flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-slate-100 text-6xl">
            🚗
          </div>
        )}

        {/* Preço + contato */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Preço</p>
            <p className="text-3xl font-black text-slate-900">{formatCurrency(v.salePrice)}</p>
          </div>
          {zap ? (
            <a
              href={zap}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700"
            >
              💬 Falar com a equipe {nome}
            </a>
          ) : (
            <p className="text-sm text-slate-500">
              Contato: {company?.phone || "telefone não informado"}
            </p>
          )}
        </div>

        {/* Ficha */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Spec label="Ano" value={`${v.manufactureYear}/${v.modelYear}`} />
          <Spec label="KM" value={`${v.km.toLocaleString("pt-BR")} km`} />
          {v.color ? <Spec label="Cor" value={v.color} /> : null}
          {v.fuel ? <Spec label="Combustível" value={v.fuel} /> : null}
          {v.transmission ? <Spec label="Câmbio" value={v.transmission} /> : null}
          {v.version ? <Spec label="Versão" value={v.version} /> : null}
        </div>

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
