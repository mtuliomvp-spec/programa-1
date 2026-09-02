"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { setSaleTransferDoneAction } from "../actions";

/**
 * Transferência de propriedade no DETRAN: enquanto não é feita, o carro
 * vendido continua no nome do dono anterior — e multa e ponto continuam
 * caindo para ele. É esta marcação que acende o selo vermelho/verde no card
 * do estoque.
 *
 * A leitura do CRLV marca sozinha quando o documento novo sai no nome do
 * comprador. Se o CRLV foi anexado antes dessa leitura existir, a ficha mostra
 * que ele já está em nome de terceiro (`crlvOwner`) e pede só a confirmação.
 */
export default function SaleTransferSetting({
  saleId,
  initialDone,
  canManage,
  crlvOwner = null,
  crlvDate = null,
}: {
  saleId: string;
  /** Data da transferência em yyyy-mm-dd, ou string vazia quando não feita. */
  initialDone: string;
  canManage: boolean;
  /** Nome no CRLV mais recente quando ele já é o do comprador (não da casa). */
  crlvOwner?: string | null;
  /** Data (yyyy-mm-dd) em que esse CRLV foi anexado — sugestão para a marcação. */
  crlvDate?: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [saved, setSaved] = useState(initialDone);
  const [date, setDate] = useState(initialDone || crlvDate || today);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(next: string | null) {
    setError(null);
    startSave(async () => {
      const r = await setSaleTransferDoneAction(saleId, next);
      if (!r.ok) {
        setError(r.error || "Não foi possível salvar.");
        return;
      }
      setSaved(next || "");
      if (!next) setDate(today);
    });
  }

  const savedDate = saved ? new Date(`${saved}T12:00:00.000Z`) : null;

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {savedDate ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-emerald-700">
            ✓ Transferido para o comprador em {formatDate(savedDate)}
          </p>
          {canManage ? (
            <button
              type="button"
              onClick={() => save(null)}
              disabled={saving}
              className="text-xs text-slate-400 hover:underline disabled:opacity-50"
            >
              {saving ? "..." : "desfazer"}
            </button>
          ) : null}
        </div>
      ) : crlvOwner ? (
        <div>
          <p className="text-sm font-medium text-emerald-700">
            ✓ O CRLV mais recente já está em nome de {crlvOwner}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            A transferência ao comprador foi concluída. Confirme a data para registrar na venda
            (ou use “Ler dados” no CRLV, que registra sozinho com a data do documento).
          </p>
          {canManage ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-40"
              />
              <Button type="button" onClick={() => save(date)} disabled={saving || !date}>
                {saving ? "Salvando..." : "Confirmar transferência"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-rose-600">⚠ Ainda no nome do dono anterior</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Enquanto a transferência não é feita no DETRAN, multa e pontuação continuam caindo para
            o dono anterior.
          </p>
          {canManage ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-40"
              />
              <Button type="button" onClick={() => save(date)} disabled={saving || !date}>
                {saving ? "Salvando..." : "Marcar como transferido"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-2 text-sm font-medium text-rose-600">{error}</p> : null}
    </div>
  );
}
