"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { updateAdSettingsAction } from "../actions";

const FIELDS: { key: string; label: string }[] = [
  { key: "preco", label: "Preço" },
  { key: "ano", label: "Ano" },
  { key: "km", label: "KM" },
  { key: "cor", label: "Cor" },
  { key: "combustivel", label: "Combustível" },
  { key: "cambio", label: "Câmbio" },
  { key: "versao", label: "Versão" },
];

/**
 * Configuração do anúncio (QR do para-brisa / vitrine): destaque promocional e
 * quais dados do veículo aparecem — todos pré-selecionados por padrão.
 */
export default function AdSettings({
  vehicleId,
  promo,
  hiddenFields,
}: {
  vehicleId: string;
  promo: string | null;
  hiddenFields: string[];
}) {
  const router = useRouter();
  const [promoText, setPromoText] = useState(promo || "");
  const [hidden, setHidden] = useState<Set<string>>(new Set(hiddenFields));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await updateAdSettingsAction(vehicleId, promoText, [...hidden]);
      setMsg(r.ok ? "Anúncio atualizado — o QR já mostra as mudanças." : r.error || "Não foi possível salvar.");
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-sm font-semibold text-slate-800">O que o anúncio mostra</p>
      <div className="mt-2 space-y-3">
        <Field label="Destaque promocional (tanque cheio, transferência grátis, brinde…)">
          <Input
            value={promoText}
            onChange={(e) => setPromoText(e.target.value)}
            placeholder="Ex: 🎁 Tanque cheio + transferência de propriedade grátis"
            maxLength={200}
          />
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Dados exibidos no anúncio (desmarque para ocultar)</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!hidden.has(f.key)}
                  onChange={() => toggle(f.key)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" disabled={pending} onClick={save} className="h-9">
            {pending ? "Salvando..." : "Salvar anúncio"}
          </Button>
          {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}
        </div>
      </div>
    </div>
  );
}
