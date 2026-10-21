"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { lancarComprovanteAvulsoAction, type ComprovanteAvulsoResult } from "./actions";

/**
 * Lançar os comprovantes do SICOVE: é aqui que nasce o título da comunicação
 * de venda (a ficha do carro só guarda o documento).
 *
 * Aceita vários PDFs de uma vez — cada um vira o seu título, na ordem. Achando
 * a placa em um carro cadastrado, o custo entra nele (pós-venda, se vendido);
 * placa desconhecida entra como despesa administrativa.
 */
export default function ComprovanteAvulso() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [res, setRes] = useState<(ComprovanteAvulsoResult & { arquivo: string })[]>([]);
  const [pending, start] = useTransition();

  function lancar() {
    const files = Array.from(fileRef.current?.files ?? []);
    if (files.length === 0) return;
    setRes([]);
    start(async () => {
      const lista: (ComprovanteAvulsoResult & { arquivo: string })[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.set("file", file);
        const r = await lancarComprovanteAvulsoAction(fd);
        lista.push({ ...r, arquivo: file.name });
        setRes([...lista]);
      }
      if (lista.some((r) => r.ok)) {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    });
  }

  const varios = res.length > 1;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="application/pdf,.pdf,image/*"
          className="block w-full max-w-sm text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
        />
        <Button type="button" onClick={lancar} disabled={pending}>
          {pending ? "Lançando…" : "Lançar cobrança"}
        </Button>
      </div>

      {res.map((r, i) =>
        r.ok ? (
          <p
            key={i}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          >
            ✓ {varios ? <strong>{r.arquivo}: </strong> : null}
            {r.mensagem}{" "}
            {r.payableId ? (
              <Link
                href={`/financeiro/a-pagar/${r.payableId}/ordem`}
                className="font-medium text-blue-700 hover:underline"
              >
                ver o título →
              </Link>
            ) : null}
          </p>
        ) : (
          <p
            key={i}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            ⚠️ {varios ? <strong>{r.arquivo}: </strong> : null}
            {r.mensagem}
          </p>
        ),
      )}
    </div>
  );
}
