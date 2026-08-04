import type { CompanySettings } from "@prisma/client";

/** Peças compartilhadas das páginas públicas da vitrine (rodapé + zap flutuante). */

function instagramUrl(v: string): string {
  const clean = v.trim().replace(/^@/, "");
  return clean.startsWith("http") ? clean : `https://instagram.com/${clean}`;
}

function instagramHandle(v: string): string {
  const clean = v.trim().replace(/^@/, "");
  if (!clean.startsWith("http")) return `@${clean}`;
  const last = clean.replace(/\/+$/, "").split("/").pop() || clean;
  return `@${last}`;
}

export function PublicFooter({ company }: { company: CompanySettings | null }) {
  const nome = company?.nomeFantasia || "MVP Veículos";
  // Mesmo formato de endereço da página de login (Waze/Apple acham melhor assim).
  const endereco = [
    company?.address,
    company?.city ? `${company.city}${company?.uf ? ` - ${company.uf}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const mapsQuery = encodeURIComponent(endereco);
  const telDigits = (company?.phone || "").replace(/\D/g, "");

  const navBtn =
    "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50";

  return (
    <footer className="mt-10 border-t border-slate-200 pt-8 pb-24 text-center">
      {/* Onde estamos: endereço + atalhos de navegação (Google Maps/Waze/Apple) */}
      {endereco ? (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-900">📍 Onde estamos</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{endereco}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className={navBtn}
            >
              🗺️ Google Maps
            </a>
            <a
              href={`https://waze.com/ul?q=${mapsQuery}&navigate=yes`}
              target="_blank"
              rel="noopener noreferrer"
              className={navBtn}
            >
              🚗 Waze
            </a>
            <a
              href={`https://maps.apple.com/?q=${mapsQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className={navBtn}
            >
              🍎 Apple Maps
            </a>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5 text-xs text-slate-500">
        <p className="font-semibold text-slate-700">{nome} · Desde 2001 — Fazendo mais por você!</p>
        <p className="flex items-center justify-center gap-3">
          {company?.phone && telDigits.length >= 10 ? (
            <a href={`tel:+55${telDigits}`} className="hover:underline">
              📞 {company.phone}
            </a>
          ) : null}
          {company?.instagram ? (
            <a
              href={instagramUrl(company.instagram)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              📷 {instagramHandle(company.instagram)}
            </a>
          ) : null}
        </p>
      </div>
    </footer>
  );
}

/** Botão de WhatsApp fixo no canto (o do topo some quando a página rola). */
export function FloatingWhatsApp({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-3xl shadow-lg shadow-emerald-500/30 transition hover:scale-105 hover:bg-emerald-600 print:hidden"
    >
      💬
    </a>
  );
}
