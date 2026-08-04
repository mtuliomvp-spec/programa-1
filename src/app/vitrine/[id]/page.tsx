import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompany } from "@/lib/company";
import { getBaseUrl } from "@/lib/base-url";
import { formatCurrency } from "@/lib/format";
import {
  getShowroomVehicle,
  getShowroomVehicles,
  whatsappLink,
  vehicleTitle,
  displayName,
  similarVehicles,
} from "../shared";
import VitrineGallery from "./VitrineGallery";
import ShareButton from "../ShareButton";
import { PublicFooter, FloatingWhatsApp } from "../PublicChrome";

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
  const showPrice = !v.adHiddenFields.includes("preco");
  const precoTitle = showPrice ? ` — ${formatCurrency(v.salePrice)}` : "";
  return {
    title: `${titulo}${precoTitle} | ${nome}`,
    description: `${titulo} à venda na ${nome}: ${v.km.toLocaleString("pt-BR")} km${v.color ? `, ${v.color}` : ""}${v.fuel ? `, ${v.fuel}` : ""}.${showPrice ? ` ${formatCurrency(v.salePrice)}.` : ""} Fale com a equipe pelo WhatsApp.`,
    openGraph: v.photoIds[0]
      ? { images: [`${base}/vitrine/foto/${v.photoIds[0]}`], title: `${titulo}${precoTitle}` }
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
  const [all, company, base] = await Promise.all([
    getShowroomVehicles(),
    getCompany().catch(() => null),
    getBaseUrl(),
  ]);
  const v = all.find((x) => x.id === id);
  if (!v) notFound();

  const nome = company?.nomeFantasia || "MVP Veículos";
  const titulo = vehicleTitle(v);
  const parecidos = similarVehicles(all, v);
  // Campos ocultos do anúncio (gerenciados na ficha; vazio = mostra tudo).
  const hidden = new Set(v.adHiddenFields);
  const showPrice = !hidden.has("preco");
  const zap = whatsappLink(
    company?.phone,
    showPrice
      ? `Olá! Tenho interesse no ${titulo} anunciado por ${formatCurrency(v.salePrice)} no site da ${nome}.`
      : `Olá! Tenho interesse no ${titulo} anunciado no site da ${nome}.`,
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/vitrine" className="text-sm font-medium text-slate-700 hover:underline">
            ← Todos os veículos
          </Link>
          {/* Sem botão "Entrar" na vitrine pública: a equipe acessa direto por /login. */}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">{displayName(v.brand, v.model)}</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {[v.version ? displayName(v.version) : null, `${v.manufactureYear}/${v.modelYear}`]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {/* Galeria com lightbox navegável (setas/teclado no desktop, swipe no celular) */}
        {v.photoIds.length > 0 ? (
          <VitrineGallery photoIds={v.photoIds} title={titulo} />
        ) : (
          <div className="mt-4 flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-slate-100 text-6xl">
            🚗
          </div>
        )}

        {/* Destaque promocional do anúncio (tanque cheio, transferência, brinde…) */}
        {v.adPromo ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <span className="text-3xl">🎁</span>
            <p className="text-base font-bold text-emerald-800">{v.adPromo}</p>
          </div>
        ) : null}

        {/* Preço + contato */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Preço</p>
            <p className="text-3xl font-black text-slate-900">
              {showPrice ? formatCurrency(v.salePrice) : "Consulte"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <ShareButton
              title={titulo}
              text={
                showPrice
                  ? `${titulo} por ${formatCurrency(v.salePrice)} na ${nome}!`
                  : `${titulo} à venda na ${nome}!`
              }
              url={`${base}/vitrine/${v.id}`}
            />
          </div>
        </div>

        {/* Ficha (só os campos habilitados no anúncio) */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {!hidden.has("ano") ? <Spec label="Ano" value={`${v.manufactureYear}/${v.modelYear}`} /> : null}
          {!hidden.has("km") ? <Spec label="KM" value={`${v.km.toLocaleString("pt-BR")} km`} /> : null}
          {!hidden.has("cor") && v.color ? <Spec label="Cor" value={v.color} /> : null}
          {!hidden.has("combustivel") && v.fuel ? <Spec label="Combustível" value={v.fuel} /> : null}
          {!hidden.has("cambio") && v.transmission ? <Spec label="Câmbio" value={v.transmission} /> : null}
          {!hidden.has("versao") && v.version ? <Spec label="Versão" value={v.version} /> : null}
        </div>

        {/* Quem não fechou com este, vê outros na mesma faixa antes de sair */}
        {parecidos.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-lg font-bold text-slate-900">Veículos parecidos</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {parecidos.map((p) => {
                const showP = !p.adHiddenFields.includes("preco");
                return (
                  <Link
                    key={p.id}
                    href={`/vitrine/${p.id}`}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow"
                  >
                    {p.photoIds[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/vitrine/foto/${p.photoIds[0]}`}
                        alt={vehicleTitle(p)}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-4xl">
                        🚗
                      </div>
                    )}
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {displayName(p.brand, p.model)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {p.manufactureYear}/{p.modelYear} · {p.km.toLocaleString("pt-BR")} km
                      </p>
                      <p className="mt-1 font-black text-slate-900">
                        {showP ? formatCurrency(p.salePrice) : "Consulte"}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <PublicFooter company={company} />
      </main>

      <FloatingWhatsApp href={zap} />
    </div>
  );
}
