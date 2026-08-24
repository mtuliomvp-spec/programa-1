"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import MoneyInput from "@/components/MoneyInput";
import {
  saveSubscriptionAction,
  registerSubscriptionPaymentAction,
  uploadSignedContractAction,
  deleteSubscriptionPaymentAction,
  deleteSignedContractAction,
  type SubscriptionFormState,
} from "./actions";

const vazio: SubscriptionFormState = {};

function Aviso({ state }: { state: SubscriptionFormState }) {
  if (state.error) return <p className="text-sm font-medium text-rose-600">{state.error}</p>;
  if (state.success) return <p className="text-sm font-medium text-emerald-700">{state.success}</p>;
  return null;
}

/** Edição do contrato: some e volta pelo botão, para a tela ficar limpa. */
export function EditContractForm({
  contrato,
}: {
  contrato: {
    status: string;
    planName: string;
    monthlyAmount: number;
    dueDay: number;
    nextChargeAt: string;
    startedAt: string;
    notes: string;
    providerName: string;
    providerDocument: string;
    providerAddress: string;
    providerEmail: string;
    providerPhone: string;
  };
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(saveSubscriptionAction, vazio);

  if (!aberto) {
    return (
      <Button type="button" variant="secondary" onClick={() => setAberto(true)}>
        ✏️ Editar contrato
      </Button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-900">Editar contrato</p>
      <Aviso state={state} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Situação" required>
          <Select name="status" defaultValue={contrato.status}>
            <option value="TESTE">Período de teste</option>
            <option value="EM_DIA">Em dia</option>
            <option value="A_VENCER">A vencer</option>
            <option value="ATRASADO">Atrasado</option>
            <option value="BLOQUEADO">Bloqueado</option>
          </Select>
        </Field>
        <Field label="Plano" required>
          <Input name="planName" defaultValue={contrato.planName} required />
        </Field>
        <Field label="Mensalidade (R$)" required>
          <MoneyInput name="monthlyAmount" defaultValue={contrato.monthlyAmount} required />
        </Field>
        <Field label="Dia de vencimento" required>
          <Input name="dueDay" type="number" min={1} max={31} defaultValue={contrato.dueDay} required />
        </Field>
        <Field label="Próxima cobrança">
          <Input name="nextChargeAt" type="date" defaultValue={contrato.nextChargeAt} />
        </Field>
        <Field label="Contrato desde">
          <Input name="startedAt" type="date" defaultValue={contrato.startedAt} />
        </Field>
      </div>

      <Field label="Observação">
        <Input name="notes" defaultValue={contrato.notes} placeholder="Ex.: reajuste anual pelo IPCA" />
      </Field>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Dados da contratada (fornecedora do sistema)
        </legend>
        <p className="mb-3 text-xs text-slate-500">
          Usados no contrato de prestação de serviço. Deixe em branco e o contrato sai com
          [colchetes] para preencher à mão.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Razão social ou nome">
            <Input name="providerName" defaultValue={contrato.providerName} />
          </Field>
          <Field label="CNPJ ou CPF">
            <Input
              name="providerDocument"
              defaultValue={contrato.providerDocument}
              placeholder="a fornecedora pode ser pessoa física"
            />
          </Field>
          <Field label="Endereço">
            <Input name="providerAddress" defaultValue={contrato.providerAddress} />
          </Field>
          <Field label="E-mail">
            <Input name="providerEmail" defaultValue={contrato.providerEmail} />
          </Field>
          <Field label="Telefone">
            <Input name="providerPhone" defaultValue={contrato.providerPhone} />
          </Field>
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar contrato"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
          Fechar
        </Button>
      </div>
    </form>
  );
}

/** Lançamento de mensalidade paga, com comprovante. */
export function RegisterPaymentForm({ sugestao }: { sugestao: { competencia: string; amount: number } }) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, pending] = useActionState(registerSubscriptionPaymentAction, vazio);

  if (!aberto) {
    return (
      <Button type="button" onClick={() => setAberto(true)}>
        ➕ Registrar pagamento
      </Button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-900">Registrar pagamento da mensalidade</p>
      <Aviso state={state} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Competência (mês de referência)" required>
          <Input name="competencia" type="month" defaultValue={sugestao.competencia} required />
        </Field>
        <Field label="Data do pagamento" required>
          <Input name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </Field>
        <Field label="Valor pago (R$)" required>
          <MoneyInput name="amount" defaultValue={sugestao.amount} required />
        </Field>
        <Field label="Forma de pagamento">
          <Select name="method" defaultValue="PIX">
            <option value="PIX">PIX</option>
            <option value="Boleto">Boleto</option>
            <option value="Transferência">Transferência</option>
            <option value="Cartão">Cartão</option>
            <option value="Dinheiro">Dinheiro</option>
          </Select>
        </Field>
      </div>

      <Field label="Comprovante (PDF ou imagem, até 10 MB)">
        <input
          type="file"
          name="proof"
          accept="image/*,.pdf"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
      </Field>

      <Field label="Observação">
        <Input name="notes" placeholder="Ex.: pago com 5 dias de atraso" />
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar pagamento"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Anexo da via assinada do contrato. */
export function UploadSignedContractForm() {
  const [state, formAction, pending] = useActionState(uploadSignedContractAction, vazio);
  return (
    <form action={formAction} className="space-y-3">
      <Aviso state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Data da assinatura">
          <Input name="signedAt" type="date" />
        </Field>
        <Field label="Arquivo (PDF/JPG/PNG)" required>
          <input
            type="file"
            name="file"
            accept="image/*,.pdf"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
        </Field>
      </div>
      <Field label="Observação">
        <Input name="notes" placeholder="Ex.: assinado em cartório, com testemunhas" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "📎 Anexar contrato assinado"}
      </Button>
    </form>
  );
}

/** Exclusão de um pagamento ou de uma via assinada. */
export function DeleteRowButton({ id, kind }: { id: string; kind: "pagamento" | "contrato" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErro(null);
          const texto =
            kind === "pagamento"
              ? "Excluir este pagamento do histórico? O comprovante anexado também será apagado."
              : "Excluir esta via assinada do contrato?";
          if (!confirm(texto)) return;
          start(async () => {
            const r =
              kind === "pagamento"
                ? await deleteSubscriptionPaymentAction(id)
                : await deleteSignedContractAction(id);
            if (!r.ok) {
              setErro(r.error || "Não foi possível excluir.");
              return;
            }
            router.refresh();
          });
        }}
        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
      >
        {pending ? "Excluindo…" : "Excluir"}
      </button>
      {erro ? <span className="ml-2 text-xs text-rose-600">{erro}</span> : null}
    </>
  );
}
