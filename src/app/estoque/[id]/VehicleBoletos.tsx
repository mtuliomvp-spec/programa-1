"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button, Field } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  uploadVehicleBoletoAction,
  deleteVehicleAttachmentAction,
  encerrarDebitosVeiculoAction,
  refazerDebitosVeiculoAction,
  type AttachmentState,
} from "../actions";

type Boleto = {
  id: string;
  description: string;
  filename: string;
  size: number;
  createdAt: Date | string;
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Titulo = { amount: number; paid: boolean };

/** Valores "R$ 1.234,56" que aparecem na descrição do anexo → números. */
function amountsInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/R\$\s*([\d.]+,\d{2})/g)) {
    const n = Number(m[1].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(n)) out.push(Math.round(n * 100) / 100);
  }
  return out;
}

/**
 * Status de pagamento de um boleto: casa os valores lidos na descrição do anexo
 * com os títulos de débitos/quitação do veículo (por valor). Um título já usado
 * não casa de novo (dois boletos de mesmo valor → dois títulos distintos).
 * "pago" quando todos os valores casados estão pagos; "parcial" quando só
 * alguns; "pendente" quando nenhum; null quando não achou título (sem badge).
 */
function statusBoleto(
  description: string,
  titulos: Titulo[],
): { label: string; tone: "success" | "warning" | "info" } | null {
  const valores = amountsInText(description);
  if (!valores.length) return null;
  const disponiveis = titulos.map((t) => ({ ...t, usado: false }));
  let casados = 0;
  let pagos = 0;
  for (const v of valores) {
    const t = disponiveis.find((x) => !x.usado && Math.abs(x.amount - v) <= 0.005);
    if (!t) continue;
    t.usado = true;
    casados++;
    if (t.paid) pagos++;
  }
  if (!casados) return null;
  if (pagos === casados) return { label: casados > 1 ? "✓ Pagos" : "✓ Pago", tone: "success" };
  if (pagos > 0) return { label: `${pagos}/${casados} pagos`, tone: "info" };
  return { label: "A pagar", tone: "warning" };
}

/**
 * Boletos/guias de pagamento do veículo (IPVA, multas, licenciamento, quitação
 * de financiamento). Ao anexar, a IA lê valor/vencimento/tipo e o sistema casa
 * com os descontos da negociação, aplicando as regras de desconto/acréscimo já
 * existentes (a action explica o que fez nas mensagens).
 */
export default function VehicleBoletos({
  vehicleId,
  boletos,
  canManage = true,
  saldoDebitos = null,
  debitoTitulos = [],
}: {
  vehicleId: string;
  boletos: Boleto[];
  canManage?: boolean;
  /** Saldo do título "Débitos do veículo (repasse)" ainda não identificado. */
  saldoDebitos?: number | null;
  /** Títulos de débitos/quitação do veículo — para o status pago por boleto. */
  debitoTitulos?: Titulo[];
}) {
  const [state, formAction, pending] = useActionState(
    uploadVehicleBoletoAction,
    {} as AttachmentState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [removing, startRemove] = useTransition();
  const [preparing, setPreparing] = useState(false);
  const [closing, startClose] = useTransition();
  const [closeMsg, setCloseMsg] = useState<string | null>(null);
  const [redoing, startRedo] = useTransition();
  const [redoMsg, setRedoMsg] = useState<string | null>(null);

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
    setPreparing(true);
    try {
      // Lado maior (2400 px): boleto tem linha digitável e valores miúdos.
      fd.set("file", await resizeImageToJpeg(file, 2400, 0.92));
      formAction(fd);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="p-5">
      {saldoDebitos != null && saldoDebitos > 0.005 ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Ainda há <strong>{formatCurrency(saldoDebitos)}</strong> do que foi descontado na
            negociação sem guia identificada (título &quot;Débitos do veículo (repasse)&quot;).
            Anexe as guias que faltam — cada uma vira um título e abate desse saldo.
          </p>
          {canManage ? (
            <button
              type="button"
              disabled={closing}
              onClick={() => {
                if (
                  confirm(
                    `Encerrar os débitos? O título restante de ${formatCurrency(saldoDebitos)} é excluído e a sobra reduz o custo do veículo.`,
                  )
                ) {
                  setCloseMsg(null);
                  startClose(async () => {
                    const res = await encerrarDebitosVeiculoAction(vehicleId);
                    setCloseMsg(res.ok ? res.message ?? "Débitos encerrados." : res.error ?? "Não foi possível encerrar.");
                  });
                }
              }}
              className="mt-2 text-sm font-medium text-amber-900 underline hover:no-underline disabled:opacity-50"
            >
              {closing ? "Encerrando…" : "Encerrar débitos (a sobra reduz o custo)"}
            </button>
          ) : null}
          {closeMsg ? <p className="mt-2 font-medium">{closeMsg}</p> : null}
        </div>
      ) : null}

      {boletos.length === 0 ? (
        <p className="mb-4 text-sm text-slate-500">Nenhum boleto anexado ainda.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100">
          {boletos.map((b) => {
            const st = statusBoleto(b.description, debitoTitulos);
            const tone =
              st?.tone === "success"
                ? "bg-emerald-100 text-emerald-700"
                : st?.tone === "info"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-amber-100 text-amber-700";
            return (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">
                  🧾 {b.description}
                  {st ? (
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
                      {st.label}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {b.filename} · {humanSize(b.size)} · {formatDate(b.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <a
                  href={`/anexos/${b.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 hover:underline"
                >
                  Abrir
                </a>
                <a
                  href={`/anexos/${b.id}?download=1`}
                  className="font-medium text-slate-600 hover:underline"
                >
                  Baixar
                </a>
                {canManage ? (
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => {
                      if (confirm("Excluir este boleto? (os ajustes já aplicados não são desfeitos)")) {
                        startRemove(() => deleteVehicleAttachmentAction(b.id, vehicleId));
                      }
                    }}
                    className="font-medium text-rose-600 hover:underline disabled:opacity-50"
                  >
                    Excluir
                  </button>
                ) : null}
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {canManage && (boletos.length > 0 || (saldoDebitos != null && saldoDebitos > 0.005)) ? (
        <div className="mb-4 border-t border-slate-100 pt-3">
          <button
            type="button"
            disabled={redoing}
            onClick={() => {
              if (
                confirm(
                  "Refazer os débitos? Os títulos de débitos PENDENTES (o principal e as guias já lançadas) e os ajustes de custo são removidos, e volta o título único com o valor descontado na compra. Nada pago é alterado. Depois, anexe os boletos de novo para recasar.",
                )
              ) {
                setRedoMsg(null);
                startRedo(async () => {
                  const res = await refazerDebitosVeiculoAction(vehicleId);
                  setRedoMsg(res.ok ? res.message ?? "Débitos refeitos." : res.error ?? "Não foi possível refazer.");
                });
              }
            }}
            className="text-xs font-medium text-slate-500 underline hover:text-slate-700 disabled:opacity-50"
          >
            {redoing ? "Refazendo…" : "↺ Refazer débitos (corrigir casamento errado)"}
          </button>
          {redoMsg ? <p className="mt-1 text-xs font-medium text-slate-700">{redoMsg}</p> : null}
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
            <p>Boleto anexado.</p>
            {state.filled?.map((f) => (
              <p key={f} className="mt-1">
                ✓ {f}
              </p>
            ))}
          </div>
        ) : null}
        {state.warnings?.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {state.warnings.map((w) => (
              <p key={w}>⚠ {w}</p>
            ))}
          </div>
        ) : null}
        <Field label="Arquivo do boleto/guia (PDF, imagem…)">
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
            {preparing ? "Preparando…" : pending ? "Lendo o boleto…" : "Anexar boleto"}
          </Button>
        </div>
      </form>
    </div>
  );
}
