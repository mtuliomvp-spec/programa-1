import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company";
import { getBaseUrl } from "@/lib/base-url";
import { formatCurrency, formatDate } from "@/lib/format";
import { showroomRates } from "@/lib/financing-rates";
import {
  getShowroomVehicle,
  getShowroomVehicles,
  whatsappBase,
  whatsappLink,
  vehicleTitle,
  displayName,
  similarVehicles,
} from "../shared";
import VitrineGallery from "./VitrineGallery";
import RegistraVisita from "./RegistraVisita";
import FinancingSimulator from "./FinancingSimulator";
import ShareButton from "../ShareButton";
import ContatoWhatsApp from "../ContatoWhatsApp";
import ThemeToggle from "../ThemeToggle";
import { PublicFooter, FloatingWhatsApp, ThemeScript } from "../PublicChrome";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [v, company] = await Promise.all([getShowroomVehicle(id), getCompany().catch(() => null)]);
  if (!v) return { title: "Veículo indisponível" };
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
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  );
}

export default async function VitrineVeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [all, company, base, rates] = await Promise.all([
    getShowroomVehicles(),
    getCompany().catch(() => null),
    getBaseUrl(),
    showroomRates().catch(() => []),
  ]);
  const v = all.find((x) => x.id === id);
  // Veículo fora da vitrine (não publicado, vendido, reservado ou com pré-venda):
  // em vez de um 404 cru — ruim para quem escaneia o QR do para-brisa no pátio —
  // mostra uma página amigável com o contato da loja. O mesmo QR volta a abrir o
  // anúncio assim que o veículo for publicado e estiver à venda.
  if (!v) {
    const dbVehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { brand: true, model: true, manufactureYear: true, modelYear: true },
    });
    const nomeLoja = company?.nomeFantasia || "MVP Veículos";
    const carroTitulo = dbVehicle ? displayName(dbVehicle.brand, dbVehicle.model) : null;
    const zapIndisp = whatsappLink(
      company?.phone,
      carroTitulo
        ? `Olá! Vi o QR do ${carroTitulo} e gostaria de mais informações.`
        : `Olá! Gostaria de informações sobre os veículos da ${nomeLoja}.`,
    );
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <ThemeScript />
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/vitrine" className="text-sm font-medium text-slate-700 hover:underline dark:text-slate-300">
              ← Todos os veículos
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="text-6xl">🚗</div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">
            Veículo indisponível no momento
          </h1>
          {carroTitulo ? (
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              {carroTitulo}
              {dbVehicle ? ` · ${dbVehicle.manufactureYear}/${dbVehicle.modelYear}` : ""}
            </p>
          ) : null}
          <p className="mx-auto mt-3 max-w-md text-slate-600 dark:text-slate-400">
            Este veículo não está disponível na nossa vitrine agora — pode já ter sido vendido,
            reservado ou ainda estar em preparação. Fale com a nossa equipe que ajudamos você a
            encontrar o carro ideal.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {zapIndisp ? (
              <a
                href={zapIndisp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700"
              >
                💬 Falar com a equipe {nomeLoja}
              </a>
            ) : null}
            <Link
              href="/vitrine"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-base font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Ver todos os veículos
            </Link>
          </div>
          <div className="mt-10">
            <PublicFooter company={company} />
          </div>
        </main>
        <FloatingWhatsApp href={zapIndisp} />
      </div>
    );
  }

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <ThemeScript />
      {/* Conta a visita a este anúncio (só visitante, não a equipe logada). */}
      <RegistraVisita alvo={v.id} />
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/vitrine" className="text-sm font-medium text-slate-700 hover:underline dark:text-slate-300">
            ← Todos os veículos
          </Link>
          {/* Sem botão "Entrar" na vitrine pública: a equipe acessa direto por /login. */}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{displayName(v.brand, v.model)}</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {[v.version ? displayName(v.version) : null, `${v.manufactureYear}/${v.modelYear}`]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {/* Galeria com lightbox navegável (setas/teclado no desktop, swipe no celular) */}
        {v.photoIds.length > 0 ? (
          <VitrineGallery photoIds={v.photoIds} title={titulo} repasse={v.repasse} />
        ) : (
          <div className="mt-4 flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-slate-100 text-6xl dark:bg-slate-800">
            🚗
          </div>
        )}

        {/* Repasse: carro de terceiro intermediado pela loja — o cliente
            precisa saber disso antes de perguntar o preço. */}
        {v.repasse ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-300 bg-slate-100 px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
            <span className="text-2xl">🔁</span>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              <strong className="font-bold">Repasse.</strong> Veículo de terceiro intermediado pela{" "}
              {nome} — fale com a equipe para condições e disponibilidade.
            </p>
          </div>
        ) : null}

        {/* Destaque promocional do anúncio (tanque cheio, transferência, brinde…) */}
        {v.adPromo ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/40">
            <span className="text-3xl">🎁</span>
            <p className="text-base font-bold text-emerald-800 dark:text-emerald-200">{v.adPromo}</p>
          </div>
        ) : null}

        {/* Preço + contato */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Preço</p>
            <p className="text-3xl font-black text-slate-900 dark:text-white">
              {showPrice ? formatCurrency(v.salePrice) : "Consulte"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {zap ? (
              // Marca a visita desta pessoa como contato com a loja.
              <ContatoWhatsApp
                href={zap}
                alvo={v.id}
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700"
              >
                💬 Falar com a equipe {nome}
              </ContatoWhatsApp>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
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

        {/* Simulador de financiamento: só com preço visível, simulador ligado
            nos Parâmetros e ao menos uma financeira com taxa. */}
        {company?.showroomSimulator && showPrice && !v.repasse && rates.length > 0 ? (
          <FinancingSimulator
            price={v.salePrice}
            vehicleTitle={titulo}
            whatsappBase={whatsappBase(company?.phone)}
            rates={rates.map((r) => ({
              id: r.id,
              name: r.name,
              monthlyRate: r.monthlyRate,
              source: r.source,
              bcbReferenceLabel: r.bcbReferenceDate ? formatDate(r.bcbReferenceDate) : null,
              maxInstallments: r.maxInstallments,
              minDownPercent: r.minDownPercent,
            }))}
          />
        ) : null}

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
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Veículos parecidos</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {parecidos.map((p) => {
                const showP = !p.adHiddenFields.includes("preco");
                return (
                  <Link
                    key={p.id}
                    href={`/vitrine/${p.id}`}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow dark:border-slate-800 dark:bg-slate-900"
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
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-4xl dark:bg-slate-800">
                        🚗
                      </div>
                    )}
                    <div className="p-3">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {displayName(p.brand, p.model)}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {p.manufactureYear}/{p.modelYear} · {p.km.toLocaleString("pt-BR")} km
                      </p>
                      <p className="mt-1 font-black text-slate-900 dark:text-white">
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

      <FloatingWhatsApp href={zap} alvo={v.id} />
    </div>
  );
}
