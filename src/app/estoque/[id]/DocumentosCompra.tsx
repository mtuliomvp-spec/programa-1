"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { anexarDocumentosCompraAction } from "../actions";

type Resultado = Awaited<ReturnType<typeof anexarDocumentosCompraAction>>;

/**
 * Documentos da compra num veículo já cadastrado (CRLV, ATPV-e, NF-e,
 * boleto/Pix, contrato): o sistema reconhece cada arquivo e o põe no seu
 * lugar da ficha — o mesmo que o "Importar documentos da compra" do cadastro.
 */
export default function DocumentosCompra({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Resultado | null>(null);

  function enviar() {
    const arquivos = Array.from(inputRef.current?.files ?? []);
    if (!arquivos.length) return;
    setRes(null);
    start(async () => {
      const fd = new FormData();
      fd.set("vehicleId", vehicleId);
      for (const f of arquivos) fd.append("purchaseDocs", await resizeImageToJpeg(f));
      const r = await anexarDocumentosCompraAction(fd);
      setRes(r);
      if (r.ok) {
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    });
  }

  return (
    <div className="border-b border-slate-100 px-5 py-4">
      <p className="text-sm font-semibold text-slate-900">📄 Anexar documentos da compra</p>
      <p className="mt-0.5 text-xs text-slate-500">
        CRLV, ATPV-e, nota fiscal, boleto/Pix, contrato — um ou vários de uma vez. O sistema reconhece cada um e
        põe no seu lugar da ficha (o boleto/Pix vai para o título da compra).
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={() => setRes(null)}
          className="block max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-violet-500"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={pending}
          className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Lendo e anexando…" : "✨ Ler e anexar"}
        </button>
      </div>
      {res && !res.ok ? <p className="mt-2 text-xs text-rose-700">{res.error}</p> : null}
      {res?.ok && res.itens?.length ? (
        <ul className="mt-2 space-y-0.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs">
          {res.itens.map((it, i) => (
            <li key={i} className={it.erro ? "text-rose-700" : "text-emerald-800"}>
              {it.erro ? "✗" : "✓"} {it.nome} → {it.erro ? it.erro : it.onde}
              {it.aviso ? <span className="text-amber-700"> · ⚠ {it.aviso}</span> : null}
            </li>
          ))}
          {res.avisos?.map((a, i) => (
            <li key={`a${i}`} className="text-amber-800">
              ⚠️ Confira: {a}.
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
