import type { ReactNode } from "react";

type Company = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  uf: string | null;
  logoDataUrl: string | null;
};

/** Cabeçalho padrão dos documentos impressos, com os dados dos Parâmetros. */
export default function CompanyDocHeader({
  company,
  right,
}: {
  company: Company;
  right: ReactNode;
}) {
  const cityLine = company.city ? `${company.city}${company.uf ? `/${company.uf}` : ""}` : null;
  return (
    <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
      <div className="flex items-start gap-3">
        {company.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logoDataUrl} alt="" className="h-14 w-auto" />
        ) : null}
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            {company.nomeFantasia.toUpperCase()}
          </h1>
          {company.razaoSocial !== company.nomeFantasia ? (
            <p className="text-xs text-slate-500">{company.razaoSocial}</p>
          ) : null}
          <p className="text-xs text-slate-500">
            {[company.cnpj ? `CNPJ ${company.cnpj}` : null, company.phone, company.email]
              .filter(Boolean)
              .join(" · ") || "Gestão de seminovos"}
          </p>
          {company.address ? (
            <p className="text-xs text-slate-500">
              {company.address}
              {cityLine ? ` — ${cityLine}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 text-right text-sm">{right}</div>
    </header>
  );
}
