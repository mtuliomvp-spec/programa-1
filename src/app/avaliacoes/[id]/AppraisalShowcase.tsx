"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import { publishAppraisalAction } from "../actions";

/**
 * Publicar a avaliação na vitrine como REPASSE. Mesmo par de botões da ficha do
 * veículo (postar / ver anúncio / remover), com um campo a mais: o preço de
 * repasse, que é opcional — sem ele o anúncio mostra "Consulte".
 *
 * O valor avaliado e o pedido do proprietário NÃO vão para o anúncio; só este
 * preço é público.
 */
export default function AppraisalShowcase({
  appraisalId,
  published,
  repassePrice,
  visitas,
}: {
  appraisalId: string;
  published: boolean;
  repassePrice: number | null;
  /** Visitas ao anúncio de repasse (não conta a equipe logada). */
  visitas: { total: number; ultimos7: number; pessoas: number; contatos: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  // O MoneyInput publica o número num input oculto; aqui basta acompanhar.
  const [preco, setPreco] = useState<number>(repassePrice ?? 0);

  function aplicar(publish: boolean) {
    setError(null);
    setOk(null);
    start(async () => {
      const r = await publishAppraisalAction(appraisalId, publish, preco > 0 ? preco : null);
      if (!r.ok) {
        setError(r.error || "Não foi possível atualizar a vitrine.");
        return;
      }
      setOk(publish ? "Anúncio de repasse no ar." : "Removido da vitrine.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 p-5">
      <div className="max-w-xs">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Preço de repasse (opcional)
        </label>
        <MoneyInput name="repassePrice" defaultValue={repassePrice} onValueChange={setPreco} />
        <p className="mt-1 text-xs text-slate-500">
          Em branco, o anúncio mostra “Consulte”. O valor avaliado e o pedido do proprietário nunca
          aparecem na vitrine.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        {published ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              🔁 No ar na vitrine (repasse)
            </span>
            <a
              href={`/vitrine/${appraisalId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              Ver anúncio →
            </a>
            <Button type="button" variant="secondary" onClick={() => aplicar(true)} disabled={pending}>
              {pending ? "Salvando..." : "Salvar preço"}
            </Button>
            <button
              type="button"
              onClick={() => aplicar(false)}
              disabled={pending}
              className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-50"
            >
              {pending ? "Removendo..." : "Remover da vitrine"}
            </button>
          </>
        ) : (
          <>
            <Button type="button" onClick={() => aplicar(true)} disabled={pending}>
              {pending ? "Postando..." : "🔁 Postar na vitrine como repasse"}
            </Button>
            <p className="text-xs text-slate-500">
              O anúncio sai ao lado dos veículos do estoque, com a tarja “Repasse” sobre as fotos.
            </p>
          </>
        )}
        {error ? <p className="w-full text-sm font-medium text-rose-600">{error}</p> : null}
        {ok ? <p className="w-full text-sm font-medium text-emerald-700">{ok}</p> : null}
      </div>

      {visitas.total > 0 ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-800">
            👁️ {visitas.total} visita{visitas.total === 1 ? "" : "s"} no anúncio
          </span>
          <span className="text-xs text-slate-500">
            {visitas.ultimos7} nos últimos 7 dias · {visitas.pessoas} pessoa
            {visitas.pessoas === 1 ? "" : "s"} diferente{visitas.pessoas === 1 ? "" : "s"}
          </span>
          <span
            className={`text-xs font-medium ${visitas.contatos > 0 ? "text-emerald-700" : "text-slate-500"}`}
            title="Visitantes que tocaram em “Tenho interesse” / WhatsApp"
          >
            💬 {visitas.contatos} contato{visitas.contatos === 1 ? "" : "s"} pelo WhatsApp
          </span>
        </div>
      ) : published ? (
        <p className="text-xs text-slate-500">
          👁️ Nenhuma visita ao anúncio ainda — ele acabou de entrar no ar.
        </p>
      ) : null}
    </div>
  );
}
