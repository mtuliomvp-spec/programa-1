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
  const endereco = [company?.address, company?.city ? `${company.city}${company?.uf ? `/${company.uf}` : ""}` : ""]
    .filter(Boolean)
    .join(" — ");
  const mapsUrl = endereco
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nome} ${endereco}`)}`
    : null;
  const telDigits = (company?.phone || "").replace(/\D/g, "");

  return (
    <footer className="mt-10 space-y-1.5 border-t border-slate-200 pt-6 pb-24 text-center text-xs text-slate-500">
      <p className="font-semibold text-slate-700">{nome} · Desde 2001 — Fazendo mais por você!</p>
      {mapsUrl ? (
        <p>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
            📍 {endereco} <span className="text-slate-400">(ver no mapa)</span>
          </a>
        </p>
      ) : null}
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
