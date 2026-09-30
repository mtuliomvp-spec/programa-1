"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import { resizeImageToJpeg } from "@/lib/image-resize";
import {
  registerVehicleAdvanceAction,
  deleteVehicleAdvanceAction,
  desfazerDevolucaoSinalAction,
  type AdvanceFormState,
} from "../actions";
import ConfirmButton from "@/components/ConfirmButton";
import DevolverSinal from "./DevolverSinal";

type Account = { id: string; name: string };
type Customer = { id: string; name: string };
type Advance = {
  id: string;
  amount: number;
  date: Date;
  accountName: string | null;
  customerName: string | null;
  status: "PENDENTE" | "RECEBIDO";
  proofAttachmentId: string | null;
};
/** Sinal já devolvido (a venda não aconteceu): histórico, com o desfazer. */
type Devolvido = {
  id: string;
  amount: number;
  date: Date;
  customerName: string | null;
  devolvido: number;
  retido: number;
  /** Situação do título da devolução: null = tudo retido (sem título). */
  devolucaoPaga: boolean | null;
  /** O sinal devolvido ainda aguarda o crédito no caixa. */
  sinalPendente?: boolean;
};

export default function VehicleAdvance({
  vehicleId,
  accounts,
  customers,
  advances,
  devolvidos = [],
  canManage = true,
}: {
  vehicleId: string;
  accounts: Account[];
  customers: Customer[];
  advances: Advance[];
  devolvidos?: Devolvido[];
  canManage?: boolean;
}) {
  const [desfazendo, startDesfazer] = useTransition();
  const [erroDesfazer, setErroDesfazer] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [show, setShow] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [deleting, startDelete] = useTransition();
  const total = advances.reduce((s, a) => s + a.amount, 0);
  const [state, formAction, pending] = useActionState<AdvanceFormState, FormData>(
    async (prev, formData) => {
      const result = await registerVehicleAdvanceAction(prev, formData);
      if (result.success) {
        formRef.current?.reset();
        setShow(false);
      }
      return result;
    },
    {},
  );

  async function handleSend() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.set("vehicleId", vehicleId);
    const file = fd.get("file");
    // Comprovante é opcional; se for imagem, reduz antes de enviar (PDF passa direto).
    if (file instanceof File && file.size > 0) {
      setPreparing(true);
      try {
        fd.set("file", await resizeImageToJpeg(file));
      } finally {
        setPreparing(false);
      }
    } else {
      fd.delete("file");
    }
    formAction(fd);
  }

  return (
    <div>
      {advances.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {advances.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">{formatCurrency(a.amount)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  {a.status === "PENDENTE" ? (
                    <>
                      <Badge tone="warning">Aguardando crédito</Badge>
                      <span>depósito em {formatDate(a.date)}</span>
                    </>
                  ) : (
                    formatDate(a.date)
                  )}
                  {a.accountName ? <Badge tone={a.status === "RECEBIDO" ? "success" : "default"}>{a.accountName}</Badge> : null}
                  {a.customerName ? <span>· {a.customerName}</span> : null}
                  {a.proofAttachmentId ? (
                    <a
                      href={`/anexos/${a.proofAttachmentId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-700 hover:underline"
                    >
                      📎 Comprovante
                    </a>
                  ) : null}
                </p>
                {a.status === "PENDENTE" ? (
                  <p className="mt-0.5 text-xs text-amber-700">
                    Será creditado ao abrir o caixa na data do depósito (uma mensagem em
                    &quot;Contas e caixas&quot; pedirá a confirmação).
                  </p>
                ) : null}
              </div>
              {canManage ? (
                <div className="flex flex-col items-end gap-1">
                  {/* Pergunta na tela (o confirm do navegador não abre em todo celular). */}
                  <ConfirmButton
                    disabled={deleting}
                    confirmLabel="Excluir"
                    question={
                      a.status === "RECEBIDO"
                        ? "Excluir só se foi lançado por ENGANO: o valor some da conta como se nunca tivesse entrado. Se o cliente desistiu e o dinheiro volta para ele, use “Devolver”."
                        : "Excluir este sinal pendente?"
                    }
                    onConfirm={() => startDelete(() => deleteVehicleAdvanceAction(a.id, vehicleId))}
                    className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
                  >
                    Excluir
                  </ConfirmButton>
                </div>
              ) : null}
              {canManage ? (
                <div className="basis-full">
                  <DevolverSinal
                    receivableId={a.id}
                    vehicleId={vehicleId}
                    amount={a.amount}
                    accounts={accounts}
                    contaDoSinal={a.accountName}
                    aguardandoCredito={a.status !== "RECEBIDO"}
                  />
                </div>
              ) : null}
            </li>
          ))}
          <li className="flex items-center justify-between px-5 py-2 text-sm font-semibold text-slate-700">
            <span>Total de sinal</span>
            <span className="text-emerald-700">{formatCurrency(total)}</span>
          </li>
        </ul>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-500">
          Nenhum sinal registrado. Ao fechar a venda, o sinal é abatido do valor a pagar do cliente.
        </p>
      )}

      {devolvidos.length > 0 ? (
        <div className="border-t border-slate-100 px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sinais devolvidos</p>
          <ul className="mt-1 divide-y divide-slate-100">
            {devolvidos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-slate-700">
                  {formatCurrency(d.amount)} de {formatDate(d.date)}
                  {d.customerName ? ` · ${d.customerName}` : ""}
                  <span className="block text-xs text-slate-500">
                    {d.devolvido > 0.005
                      ? `devolvido ${formatCurrency(d.devolvido)} — ${d.devolucaoPaga ? "pago" : "no Contas a pagar"}`
                      : "retido integralmente pela loja"}
                    {d.retido > 0.005 && d.devolvido > 0.005 ? ` · retido ${formatCurrency(d.retido)} (receita administrativa)` : ""}
                    {d.sinalPendente ? " · sinal ainda aguardando crédito no caixa" : ""}
                  </span>
                </span>
                {canManage && !d.devolucaoPaga ? (
                  <ConfirmButton
                    disabled={desfazendo}
                    confirmLabel="Desfazer"
                    question="Desfazer a devolução? O valor volta a ser sinal deste veículo e o título da devolução some."
                    onConfirm={() =>
                      startDesfazer(async () => {
                        setErroDesfazer(null);
                        const r = await desfazerDevolucaoSinalAction(d.id, vehicleId);
                        if (!r.ok) setErroDesfazer(r.error || "Não foi possível desfazer.");
                      })
                    }
                    className="text-xs font-medium text-slate-500 hover:text-rose-600 hover:underline"
                  >
                    ↩︎ Desfazer devolução
                  </ConfirmButton>
                ) : null}
              </li>
            ))}
          </ul>
          {erroDesfazer ? <p className="text-xs text-rose-600">{erroDesfazer}</p> : null}
        </div>
      ) : null}

      <div className={`border-t border-slate-100 px-5 py-4 ${canManage ? "" : "hidden"}`}>
        {show ? (
          <form ref={formRef} className="space-y-3">
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Valor do sinal (R$)" required>
                <Input name="amount" type="number" step="0.01" min="0.01" required />
              </Field>
              <Field label="Data do depósito" required>
                <Input name="date" type="date" defaultValue={toDateInputValue(new Date())} required />
              </Field>
              <Field label="Conta em que o cliente depositou" required>
                <Select name="accountId" defaultValue={accounts[0]?.id ?? ""}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Cliente (opcional)">
                <Select name="customerId" defaultValue="">
                  <option value="">Sem cliente</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Comprovante do depósito (opcional — PDF, imagem…)">
              <input
                type="file"
                name="file"
                accept=".pdf,image/*"
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </Field>
            <p className="text-xs text-slate-500">
              O valor <strong>não</strong> entra no caixa agora. Quando o caixa for aberto na data do
              depósito, uma mensagem em &quot;Contas e caixas&quot; perguntará se deseja creditá-lo.
            </p>
            {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
            <div className="flex gap-2">
              <Button type="button" onClick={handleSend} disabled={pending || preparing || accounts.length === 0}>
                {preparing ? "Preparando…" : pending ? "Registrando…" : "Registrar sinal"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShow(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setShow(true)}>
            + Registrar sinal / entrada antecipada
          </Button>
        )}
      </div>
    </div>
  );
}
