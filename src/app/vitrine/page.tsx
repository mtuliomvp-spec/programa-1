import type { Metadata } from "next";
import Link from "next/link";
import { getCompany } from "@/lib/company";
import { getBaseUrl } from "@/lib/base-url";
import { formatCurrency } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import {
  getShowroomVehicles,
  whatsappLink,
  vehicleTitle,
  displayName,
  isNewArrival,
} from "./shared";
import ShareButton from "./ShareButton";
import RepasseTag from "./RepasseTag";
import ThemeToggle from "./ThemeToggle";
import { PublicFooter, FloatingWhatsApp, ThemeScript } from "./PublicChrome";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompany().catch(() => null);
  const nome = company?.nomeFantasia || "MVP Veículos";
  const description = `Confira os veículos seminovos à venda na ${nome}. Fotos, preços e contato direto pelo WhatsApp.`;
  return {
    title: `${nome} — Veículos à venda`,
    description,
    openGraph: { title: `${nome} — Veículos à venda`, description },
  };
}

// Faixas de preço dos filtros rápidos (chips).
const FAIXAS: { key: string; label: string; min: number; max: number | null }[] = [
  { key: "0-50000", label: "Até R$ 50 mil", min: 0, max: 50000 },
  { key: "50000-80000", label: "R$ 50–80 mil", min: 50000, max: 80000 },
  { key: "80000-120000", label: "R$ 80–120 mil", min: 80000, max: 120000 },
  { key: "120000-", label: "Acima de R$ 120 mil", min: 120000, max: null },
];

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "inline-flex h-8 shrink-0 items-center rounded-full bg-slate-900 px-3.5 text-xs font-semibold text-white dark:bg-white dark:text-slate-900"
          : "inline-flex h-8 shrink-0 items-center rounded-full border border-slate-300 bg-white px-3.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      }
    >
      {children}
    </Link>
  );
}

export default async function VitrinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; marca?: string; faixa?: string; ordem?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const marca = (sp.marca || "").trim();
  const faixa = (sp.faixa || "").trim();
  const ordem = (sp.ordem || "").trim();

  const [company, allVehicles, base] = await Promise.all([
    getCompany().catch(() => null),
    getShowroomVehicles(),
    getBaseUrl(),
  ]);
  const nome = company?.nomeFantasia || "MVP Veículos";
  const cidade = company?.city ? `${company.city}${company.uf ? `/${company.uf}` : ""}` : null;
  const zapGeral = whatsappLink(
    company?.phone,
    `Olá! Vi os veículos no site da ${nome} e gostaria de mais informações.`,
  );
  const zapVender = whatsappLink(
    company?.phone,
    `Olá! Tenho um carro para vender e queria saber como funciona a consignação na ${nome}.`,
  );

  // Marcas presentes no estoque (para os chips) — nome de exibição padronizado.
  const marcas = Array.from(new Set(allVehicles.map((v) => displayName(v.brand)))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const faixaAtiva = FAIXAS.find((f) => f.key === faixa) || null;

  let vehicles = allVehicles;
  if (q) {
    vehicles = vehicles.filter((v) =>
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
    );
  }
  if (marca) vehicles = vehicles.filter((v) => displayName(v.brand) === marca);
  if (faixaAtiva) {
    vehicles = vehicles.filter(
      (v) => v.salePrice >= faixaAtiva.min && (faixaAtiva.max === null || v.salePrice < faixaAtiva.max),
    );
  }
  if (ordem === "menor") vehicles = [...vehicles].sort((a, b) => a.salePrice - b.salePrice);
  else if (ordem === "maior") vehicles = [...vehicles].sort((a, b) => b.salePrice - a.salePrice);

  // Monta o link dos chips preservando os demais filtros.
  const buildHref = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string> = { q, marca, faixa, ordem };
    for (const [k, val] of Object.entries(patch)) {
      if (val === null) delete merged[k];
      else merged[k] = val;
    }
    for (const [k, val] of Object.entries(merged)) if (val) params.set(k, val);
    const s = params.toString();
    return s ? `/vitrine?${s}` : "/vitrine";
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <ThemeScript />
      {/* Cabeçalho público */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {company?.logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logoDataUrl} alt="" className="h-9 w-auto" />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-base font-black tracking-tight text-slate-900 dark:text-white">{nome}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Seminovos selecionados</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
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
            {/* Sem botão "Entrar" na vitrine pública: a equipe acessa direto por /login. */}
          </div>
        </div>
      </header>

      {/* Faixa de boas-vindas (slogan da loja + diferenciais) */}
      <section className="bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-8 text-center sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Desde 2001</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Fazendo mais por você!
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Seminovos selecionados{cidade ? ` em ${cidade}` : ""} — negociação direta pelo WhatsApp.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-200">
            <span className="rounded-full bg-white/10 px-3 py-1.5">🔄 Aceitamos troca</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">💳 Financiamento</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5">🤝 Consignação</span>
            {cidade ? <span className="rounded-full bg-white/10 px-3 py-1.5">📍 {cidade}</span> : null}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Veículos à venda</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {vehicles.length} veículo(s) disponíveis — fale com a equipe pelo WhatsApp.
            </p>
          </div>
        </div>

        <form className="mt-4 flex max-w-xl gap-2">
          {marca ? <input type="hidden" name="marca" value={marca} /> : null}
          {faixa ? <input type="hidden" name="faixa" value={faixa} /> : null}
          {ordem ? <input type="hidden" name="ordem" value={ordem} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por marca, modelo, ano, cor..."
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Buscar
          </button>
        </form>

        {/* Filtros rápidos: marca, faixa de preço e ordenação */}
        {marcas.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <Chip href={buildHref({ marca: null })} active={!marca}>
              Todas as marcas
            </Chip>
            {marcas.map((m) => (
              <Chip key={m} href={buildHref({ marca: m === marca ? null : m })} active={m === marca}>
                {m}
              </Chip>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {FAIXAS.map((f) => (
            <Chip key={f.key} href={buildHref({ faixa: f.key === faixa ? null : f.key })} active={f.key === faixa}>
              {f.label}
            </Chip>
          ))}
          <span className="mx-1 hidden w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-700" />
          <Chip href={buildHref({ ordem: ordem === "menor" ? null : "menor" })} active={ordem === "menor"}>
            ↓ Menor preço
          </Chip>
          <Chip href={buildHref({ ordem: ordem === "maior" ? null : "maior" })} active={ordem === "maior"}>
            ↑ Maior preço
          </Chip>
        </div>

        {vehicles.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            {q || marca || faixa
              ? "Nenhum veículo encontrado para os filtros escolhidos."
              : "Nenhum veículo anunciado no momento — volte em breve!"}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => {
              const titulo = vehicleTitle(v);
              const showPrice = !v.adHiddenFields.includes("preco");
              const link = `${base}/vitrine/${v.id}`;
              const zap = whatsappLink(
                company?.phone,
                showPrice
                  ? `Olá! Tenho interesse no ${titulo} anunciado por ${formatCurrency(v.salePrice)} no site da ${nome}.`
                  : `Olá! Tenho interesse no ${titulo} anunciado no site da ${nome}.`,
              );
              return (
                <div key={v.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="relative">
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
                        <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-5xl dark:bg-slate-800">
                          🚗
                        </div>
                      )}
                    </Link>
                    {v.repasse ? <RepasseTag /> : null}
                    {/* Selos sobre a foto — abaixo da tarja, quando é repasse */}
                    <div
                      className={`pointer-events-none absolute left-2 flex flex-col items-start gap-1.5 ${
                        v.repasse ? "top-10" : "top-2"
                      }`}
                    >
                      {isNewArrival(v) ? (
                        <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow">
                          ✨ Chegou agora
                        </span>
                      ) : null}
                      {v.adPromo ? (
                        <span className="max-w-[220px] truncate rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white shadow">
                          🎁 {v.adPromo}
                        </span>
                      ) : null}
                    </div>
                    <div className={`absolute right-2 ${v.repasse ? "top-10" : "top-2"}`}>
                      <ShareButton
                        compact
                        title={titulo}
                        text={
                          showPrice
                            ? `${titulo} por ${formatCurrency(v.salePrice)} na ${nome}!`
                            : `${titulo} à venda na ${nome}!`
                        }
                        url={link}
                      />
                    </div>
                    {v.photoIds.length > 1 ? (
                      <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-slate-900/70 px-2 py-0.5 text-[11px] font-medium text-white">
                        📷 {v.photoIds.length} fotos
                      </span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <Link href={`/vitrine/${v.id}`} className="block">
                      <p className="truncate font-semibold text-slate-900 dark:text-white">{displayName(v.brand, v.model)}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {[
                          v.version ? displayName(v.version) : null,
                          `${v.manufactureYear}/${v.modelYear}`,
                          `${v.km.toLocaleString("pt-BR")} km`,
                          v.fuel,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-2 text-xl font-black text-slate-900 dark:text-white">
                        {showPrice ? formatCurrency(v.salePrice) : "Consulte"}
                      </p>
                    </Link>
                    <div className="mt-3 flex gap-2">
                      <Link
                        href={`/vitrine/${v.id}`}
                        className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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

        {/* Segunda porta de negócio: consignação */}
        {zapVender ? (
          <section className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-7 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
            <h2 className="text-xl font-bold text-emerald-900 dark:text-emerald-200">Quer vender seu carro?</h2>
            <p className="mx-auto mt-1 max-w-xl text-sm text-emerald-800 dark:text-emerald-300">
              Deixe seu veículo conosco: a {nome} cuida do anúncio, das visitas e de toda a burocracia
              da venda. Você só se preocupa em receber.
            </p>
            <a
              href={zapVender}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              💬 Quero vender meu carro
            </a>
          </section>
        ) : null}

        <PublicFooter company={company} />
      </main>

      <FloatingWhatsApp href={zapGeral} />
    </div>
  );
}
