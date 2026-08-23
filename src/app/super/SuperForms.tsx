"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import {
  createSuperAdminAction,
  demoteSuperAdminAction,
  setMaintenanceAction,
  setPaymentBlockAction,
  type SuperFormState,
} from "./actions";

const vazio: SuperFormState = {};

function Aviso({ state }: { state: SuperFormState }) {
  if (state.error) return <p className="text-sm font-medium text-rose-600">{state.error}</p>;
  if (state.success) return <p className="text-sm font-medium text-emerald-700">{state.success}</p>;
  return null;
}

/** Portão: senha mestra da instalação. */
export function GateForm({ action }: { action: (p: SuperFormState, f: FormData) => Promise<SuperFormState> }) {
  const [state, formAction, pending] = useActionState(action, vazio);
  return (
    <form action={formAction} className="space-y-4">
      <Aviso state={state} />
      <Field label="Senha mestra" required>
        <Input type="password" name="password" autoComplete="off" autoFocus required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Verificando…" : "Entrar"}
      </Button>
    </form>
  );
}

/** Bloqueio por falta de pagamento. */
export function PaymentBlockForm({
  bloqueado,
  mensagem,
}: {
  bloqueado: boolean;
  mensagem: string;
}) {
  const [state, formAction, pending] = useActionState(setPaymentBlockAction, vazio);
  return (
    <form action={formAction} className="space-y-4">
      <Aviso state={state} />
      <input type="hidden" name="blocked" value={bloqueado ? "false" : "true"} />
      {bloqueado ? (
        <>
          <p className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <strong>Acesso suspenso.</strong> Ninguém da loja entra — nem o administrador. Só você.
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? "Liberando…" : "🔓 Liberar acesso"}
          </Button>
        </>
      ) : (
        <>
          <Field label="Mensagem que a loja vai ver (opcional)">
            <Input
              name="message"
              defaultValue={mensagem}
              placeholder="Acesso suspenso por pendência financeira. Fale com o fornecedor do sistema."
            />
          </Field>
          <Button type="submit" disabled={pending} className="bg-rose-600 hover:bg-rose-500">
            {pending ? "Suspendendo…" : "🔒 Suspender acesso por falta de pagamento"}
          </Button>
        </>
      )}
    </form>
  );
}

/** Modo manutenção (o administrador da loja continua navegando). */
export function MaintenanceButton({ locked }: { locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setErro(null);
          start(async () => {
            const r = await setMaintenanceAction(!locked);
            if (!r.ok) {
              setErro(r.error || "Não foi possível alterar.");
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Aguarde…" : locked ? "🔓 Encerrar manutenção" : "🛠️ Colocar em manutenção"}
      </Button>
      {erro ? <p className="mt-2 text-xs text-rose-600">{erro}</p> : null}
    </div>
  );
}

/** Criação/promoção de Super Admin. */
export function NewSuperAdminForm() {
  const [state, formAction, pending] = useActionState(createSuperAdminAction, vazio);
  return (
    <form action={formAction} className="space-y-4">
      <Aviso state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Nome" required>
          <Input name="name" required />
        </Field>
        <Field label="E-mail" required>
          <Input name="email" type="email" autoComplete="off" required />
        </Field>
        <Field label="Senha (mín. 8)" required>
          <Input name="password" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        Se o e-mail já existir no sistema, a conta é <strong>promovida</strong> a Super Admin e a senha é
        redefinida — útil para transformar a sua conta de administrador sem perder o histórico.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando…" : "Criar / promover"}
      </Button>
    </form>
  );
}

export function DemoteButton({ id, nome }: { id: string; nome: string }) {
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
          if (!confirm(`Rebaixar ${nome} para administrador comum? Ele deixa de ver o painel do dono do sistema.`)) return;
          start(async () => {
            const r = await demoteSuperAdminAction(id);
            if (!r.ok) {
              setErro(r.error || "Não foi possível rebaixar.");
              return;
            }
            router.refresh();
          });
        }}
        className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
      >
        {pending ? "Aguarde…" : "Rebaixar"}
      </button>
      {erro ? <p className="mt-1 text-xs text-rose-600">{erro}</p> : null}
    </>
  );
}
