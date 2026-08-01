"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import {
  loginAction,
  setupAdminAction,
  signupAction,
  forgotPasswordAction,
  type LoginFormState,
  type SignupFormState,
} from "./actions";

type Mode = "login" | "signup" | "forgot";

export default function LoginForm({ isSetup, next }: { isSetup: boolean; next?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [loginState, loginFormAction, loginPending] = useActionState(
    isSetup ? setupAdminAction : loginAction,
    {} as LoginFormState,
  );
  const [signupState, signupFormAction, signupPending] = useActionState(
    signupAction,
    {} as SignupFormState,
  );
  const [forgotState, forgotFormAction, forgotPending] = useActionState(
    forgotPasswordAction,
    {} as SignupFormState,
  );

  if (isSetup) {
    return (
      <form action={loginFormAction} className="space-y-4">
        {loginState.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {loginState.error}
          </div>
        ) : null}
        <Field label="Seu nome" required>
          <Input name="name" required placeholder="Ex: Marcelo" autoFocus />
        </Field>
        <Field label="E-mail" required>
          <Input name="email" type="email" required placeholder="voce@email.com" />
        </Field>
        <Field label="Crie uma senha (mín. 6 caracteres)" required>
          <Input name="password" type="password" required minLength={6} />
        </Field>
        <Button type="submit" disabled={loginPending} className="w-full">
          {loginPending ? "Entrando..." : "Criar e entrar"}
        </Button>
      </form>
    );
  }

  if (mode === "signup") {
    return (
      <div className="space-y-4">
        <form action={signupFormAction} className="space-y-4">
          {signupState.error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {signupState.error}
            </div>
          ) : null}
          {signupState.success ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {signupState.success}
            </div>
          ) : (
            <>
              <Field label="Seu nome" required>
                <Input name="name" required placeholder="Ex: João da Silva" autoFocus />
              </Field>
              <Field label="E-mail" required>
                <Input name="email" type="email" required placeholder="voce@email.com" />
              </Field>
              <Field label="Crie uma senha (mín. 6 caracteres)" required>
                <Input name="password" type="password" required minLength={6} />
              </Field>
              <Field label="Código de liberação" required>
                <Input
                  name="accessCode"
                  required
                  placeholder="Ex: K7M2QP"
                  className="uppercase tracking-widest"
                  autoComplete="off"
                />
              </Field>
              <p className="-mt-2 text-xs text-slate-400">
                Peça o código ao administrador da MVP Veículos antes de se cadastrar — sem ele o cadastro não prossegue.
              </p>
              <Button type="submit" disabled={signupPending} className="w-full">
                {signupPending ? "Enviando..." : "Cadastrar meu acesso"}
              </Button>
              <p className="text-xs text-slate-400">
                Seu acesso ficará em espera até o administrador aprovar e liberar os módulos.
              </p>
            </>
          )}
        </form>
        <button
          type="button"
          onClick={() => setMode("login")}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          ← Voltar para o login
        </button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className="space-y-4">
        <form action={forgotFormAction} className="space-y-4">
          {forgotState.error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {forgotState.error}
            </div>
          ) : null}
          {forgotState.success ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {forgotState.success}
            </div>
          ) : (
            <>
              <Field label="E-mail cadastrado" required>
                <Input name="email" type="email" required placeholder="voce@email.com" autoFocus />
              </Field>
              <Button type="submit" disabled={forgotPending} className="w-full">
                {forgotPending ? "Enviando..." : "Solicitar nova senha"}
              </Button>
              <p className="text-xs text-slate-400">
                O administrador verá seu pedido na gestão de usuários e definirá uma nova senha.
              </p>
            </>
          )}
        </form>
        <button
          type="button"
          onClick={() => setMode("login")}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          ← Voltar para o login
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form action={loginFormAction} className="space-y-4">
        {loginState.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {loginState.error}
          </div>
        ) : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="E-mail" required>
          <Input name="email" type="email" required placeholder="voce@email.com" autoFocus />
        </Field>
        <Field label="Senha" required>
          <Input name="password" type="password" required />
        </Field>
        <Button type="submit" disabled={loginPending} className="w-full">
          {loginPending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
      <div className="flex items-center justify-between text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("signup")}
          className="text-blue-700 hover:underline"
        >
          Cadastrar primeiro acesso
        </button>
        <button
          type="button"
          onClick={() => setMode("forgot")}
          className="text-slate-500 hover:underline"
        >
          Esqueci a senha
        </button>
      </div>
    </div>
  );
}
