import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { emailComercial, paginaAssinaturaAtiva } from "@/lib/assinatura-fincore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Política de privacidade | Fincore360" };

/** Política de privacidade do formulário de pedido de assinatura (/assinar). */
export default function PrivacidadePage() {
  if (!paginaAssinaturaAtiva()) notFound();
  const email = emailComercial();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Link href="/assinar" className="text-sm font-medium text-blue-700 underline">
          ← Voltar
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Política de privacidade</h1>
        <p className="mt-2 text-sm text-slate-500">Fincore360 — pedido de assinatura</p>

        <div className="mt-8 space-y-6 leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-bold text-slate-900">Quais dados coletamos</h2>
            <p className="mt-1.5">
              Os que você informa no formulário: nome da loja, CNPJ (opcional), seu nome, WhatsApp, e-mail,
              cidade, estado e a mensagem, se escrever uma.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900">Para que usamos</h2>
            <p className="mt-1.5">
              Somente para analisar o seu pedido de assinatura e entrar em contato com você sobre ele. Não
              vendemos nem repassamos os seus dados a terceiros.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900">Por quanto tempo guardamos</h2>
            <p className="mt-1.5">
              Enquanto durar a negociação ou a assinatura. Se você não contratar, apagamos o pedido quando
              solicitar.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-900">Seus direitos (LGPD)</h2>
            <p className="mt-1.5">
              Você pode pedir a qualquer momento para ver, corrigir ou apagar os seus dados, escrevendo para{" "}
              <a href={`mailto:${email}`} className="font-semibold text-blue-700 underline">
                {email}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
