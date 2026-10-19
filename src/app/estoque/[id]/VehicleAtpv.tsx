"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@/components/ui";
import {
  DICA_FASE_ATPV,
  FASES_ATPV,
  ROTULO_FASE_ATPV,
  faseDaDescricao,
  numeroDaDescricao,
  type FaseAtpv,
} from "@/lib/atpv-fases";
import { formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  uploadVehicleAttachmentAction,
  deleteVehicleAttachmentAction,
  readAtpvAttachmentAction,
  definirFaseAtpvAction,
  type AttachmentState,
} from "../actions";

type Atpv = {
  id: string;
  description: string;
  filename: string;
  size: number;
  createdAt: Date | string;
  /** Fase do arquivo (gravada ou deduzida); sem ela, vale a da descrição. */
  fase?: FaseAtpv | null;
  /** A fase foi confirmada (gravada na descrição) ou é só dedução. */
  faseGravada?: boolean;
  numero?: string | null;
  /** Já passou pela leitura (CRV, chassi, comprador…). */
  lida?: boolean;
};

/** Completa o que a tela não mandou com o que a descrição diz. */
function normalizar(a: Atpv): Atpv {
  const daDescricao = faseDaDescricao(a.description);
  return {
    ...a,
    fase: a.fase ?? daDescricao,
    faseGravada: a.faseGravada ?? !!daDescricao,
    numero: a.numero ?? numeroDaDescricao(a.description),
    lida: a.lida ?? /n[ºo°]\s*\d/i.test(a.description),
  };
}

/**
 * Os arquivos são FASES da mesma ATPV-e (emitida → preenchida → assinada →
 * termo de conformidade): agrupa pelo número; arquivo sem número (o termo,
 * por exemplo) entra na ATPV-e mais recente.
 */
function agrupar(atpvs: Atpv[]): { numero: string | null; arquivos: Atpv[] }[] {
  const numeros = [...new Set(atpvs.map((a) => a.numero).filter((n): n is string => !!n))];
  if (numeros.length <= 1) return atpvs.length ? [{ numero: numeros[0] ?? null, arquivos: atpvs }] : [];
  const grupos = numeros.map((n) => ({ numero: n as string | null, arquivos: atpvs.filter((a) => a.numero === n) }));
  const soltos = atpvs.filter((a) => !a.numero);
  if (soltos.length) grupos[0].arquivos.push(...soltos);
  return grupos;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Campo dedicado para a ATPV-e (Autorização para Transferência de Propriedade
 * do Veículo, eletrônica). Mesmo molde do CRLV/Comunicação de venda: o anexo é
 * um documento comum identificado pela descrição "ATPV-e" — o card de
 * Documentos do veículo não o lista de novo.
 */
export default function VehicleAtpv({
  vehicleId,
  atpvs,
  canManage = true,
}: {
  vehicleId: string;
  atpvs: Atpv[];
  canManage?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    uploadVehicleAttachmentAction,
    {} as AttachmentState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [lendo, startLeitura] = useTransition();
  const [leitura, setLeitura] = useState<AttachmentState | null>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  async function handleSend() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return;
    fd.set("vehicleId", vehicleId);
    fd.set("kind", "DOCUMENTO");
    fd.set("description", "ATPV-e");
    setPreparing(true);
    try {
      fd.set("file", await resizeImageToJpeg(file));
      formAction(fd);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="p-5">
      {atpvs.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">Nenhuma ATPV-e anexada ainda.</p>
      ) : (
        <div className="mb-4 space-y-4">
          {agrupar(atpvs.map(normalizar)).map((g, gi) => {
            // Lê a versão mais completa (assinada > preenchida > emitida).
            const paraLer =
              (["ASSINADA", "PREENCHIDA", "EMITIDA"] as FaseAtpv[])
                .map((f) => g.arquivos.find((a) => a.fase === f))
                .find(Boolean) ?? g.arquivos.find((a) => a.fase !== "TERMO");
            const semFase = g.arquivos.filter((a) => !a.fase);
            return (
              <div key={g.numero ?? gi} className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">
                    📄 ATPV-e{g.numero ? ` nº ${g.numero}` : ""}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {g.arquivos.length} arquivo(s) — fases do mesmo documento
                    </span>
                  </p>
                  {canManage && paraLer ? (
                    <button
                      type="button"
                      disabled={lendo}
                      onClick={() => {
                        setLeitura(null);
                        startLeitura(async () => setLeitura(await readAtpvAttachmentAction(paraLer.id)));
                      }}
                      className="text-xs font-medium text-indigo-700 hover:underline disabled:opacity-50"
                      title="A IA lê o documento e completa a ficha (número e código do CRV, chassi, RENAVAM)"
                    >
                      {lendo ? "Lendo…" : paraLer.lida ? "🤖 Ler de novo" : "🤖 Ler este documento"}
                    </button>
                  ) : null}
                </div>
                <ol className="divide-y divide-slate-100">
                  {FASES_ATPV.map((f, i) => {
                    const daFase = g.arquivos.filter((a) => a.fase === f);
                    return (
                      <li key={f} className="flex gap-3 px-3 py-2">
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            daFase.length ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
                          }`}
                        >
                          {daFase.length ? "✓" : i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${daFase.length ? "text-slate-900" : "text-slate-400"}`}>
                            {ROTULO_FASE_ATPV[f]}
                            <span className="ml-1 text-xs font-normal text-slate-400">— {DICA_FASE_ATPV[f]}</span>
                          </p>
                          {daFase.length ? (
                            daFase.map((a) => (
                              <Arquivo key={a.id} a={a} vehicleId={vehicleId} canManage={canManage} />
                            ))
                          ) : (
                            <p className="text-xs text-slate-400">ainda não anexada</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {semFase.length ? (
                  <div className="border-t border-slate-100 px-3 py-2">
                    <p className="text-xs font-medium text-amber-700">Fase não identificada — escolha abaixo:</p>
                    {semFase.map((a) => (
                      <Arquivo key={a.id} a={a} vehicleId={vehicleId} canManage={canManage} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {lendo ? (
        <p className="mb-4 text-xs text-slate-500">
          A IA está lendo a ATPV-e — costuma levar alguns segundos. Não feche a página.
        </p>
      ) : null}

      {leitura?.error ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {leitura.error}
        </p>
      ) : null}

      {leitura?.ok ? (
        <div className="mb-4 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          {leitura.filled && leitura.filled.length > 0 ? (
            <div>
              <p className="font-medium text-emerald-800">
                ✓ {leitura.filled.length} dado(s) preenchido(s) na ficha:
              </p>
              <ul className="mt-1 space-y-0.5 text-emerald-700">
                {leitura.filled.map((f, i) => (
                  <li key={i}>· {f}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {leitura.warnings && leitura.warnings.length > 0 ? (
            <ul className="space-y-0.5 text-amber-800">
              {leitura.warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-emerald-700">Recarregue a página para ver a ficha atualizada.</p>
        </div>
      ) : null}

      <form
        ref={formRef}
        className={`space-y-3 border-t border-slate-100 pt-4 ${canManage ? "" : "hidden"}`}
      >
        {state.error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <p>ATPV-e anexada e lida.</p>
            {state.filled?.length ? (
              <ul className="mt-1 space-y-0.5 text-xs">
                {state.filled.map((f, i) => (
                  <li key={i}>· {f}</li>
                ))}
              </ul>
            ) : null}
            {state.warnings?.length ? (
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                {state.warnings.map((w, i) => (
                  <li key={i}>⚠️ {w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <Field label="Arquivo da ATPV-e (PDF, imagem…)">
          <input
            type="file"
            name="file"
            required
            accept=".pdf,image/*"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </Field>
        <div className="flex justify-end">
          <Button type="button" onClick={handleSend} disabled={pending || preparing}>
            {preparing ? "Preparando…" : pending ? "Enviando e lendo…" : "Anexar ATPV-e"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Um arquivo de uma fase: abrir, baixar, corrigir a fase e excluir. */
function Arquivo({ a, vehicleId, canManage }: { a: Atpv; vehicleId: string; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="min-w-0 truncate text-slate-500">
        {a.filename} · {humanSize(a.size)} · {formatDate(a.createdAt)}
      </span>
      <a href={`/anexos/${a.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline">
        Abrir
      </a>
      <a href={`/anexos/${a.id}?download=1`} className="font-medium text-slate-600 hover:underline">
        Baixar
      </a>
      {canManage ? (
        <>
          <select
            value=""
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await definirFaseAtpvAction(a.id, (e.target.value || null) as FaseAtpv | null);
                router.refresh();
              })
            }
            className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs text-slate-700"
            title="Corrigir a fase deste arquivo"
          >
            <option value="">{a.fase ? "Trocar fase…" : "Escolher fase…"}</option>
            {FASES_ATPV.filter((f) => f !== a.fase).map((f) => (
              <option key={f} value={f}>
                {ROTULO_FASE_ATPV[f]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Excluir este arquivo da ATPV-e?")) {
                start(async () => {
                  await deleteVehicleAttachmentAction(a.id, vehicleId);
                  router.refresh();
                });
              }
            }}
            className="font-medium text-rose-600 hover:underline disabled:opacity-50"
          >
            Excluir
          </button>
        </>
      ) : null}
    </div>
  );
}
