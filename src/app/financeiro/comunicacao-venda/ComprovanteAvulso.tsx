"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { lancarComprovanteAvulsoAction, type ComprovanteAvulsoResult } from "./actions";

/**
 * Lançar o comprovante do SICOVE sem passar pela ficha do carro.
 *
 * É o caminho de quem não tem ficha para anexar: o veículo já saiu do estoque
 * ou nunca esteve nele (a loja entrou só como agente da comunicação). Achando
 * a placa em um carro EM ESTOQUE, o custo entra nele como sempre; nos demais
 * casos entra como despesa administrativa.
 */
export default function ComprovanteAvulso() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [res, setRes] = useState<ComprovanteAvulsoResult | null>(null);
  const [pending, start] = useTransition();

  function lancar() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setRes(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const r = await lancarComprovanteAvulsoAction(fd);
      setRes(r);
      if (r.ok) {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf,image/*"
          className="block w-full max-w-sm text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
        />
        <Button type="button" onClick={lancar} disabled={pending}>
          {pending ? "Lançando…" : "Lançar cobrança"}
        </Button>
      </div>

      {res?.ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ✓ {res.mensagem}{" "}
          {res.payableId ? (
            <Link
              href={`/financeiro/a-pagar/${res.payableId}/ordem`}
              className="font-medium text-blue-700 hover:underline"
            >
              ver o título →
            </Link>
          ) : null}
        </p>
      ) : null}
      {res && !res.ok ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ {res.mensagem}
        </p>
      ) : null}
    </div>
  );
}
