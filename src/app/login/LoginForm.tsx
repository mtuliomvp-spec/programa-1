"use client";

import { useActionState, useEffect, useState } from "react";
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

export default function LoginForm({ isSetup, next, loja }: { isSetup: boolean; next?: string; loja: string }) {
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
                Peça o código ao administrador da {loja} antes de se cadastrar — sem ele o cadastro não prossegue.
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
      <AvisoCookies voltouParaLogin={Boolean(next)} />
      <form action={loginFormAction} onSubmit={marcarTentativa} className="space-y-4">
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

const CHAVE_TENTATIVA = "fincore:login-em";

/** Guarda a hora do envio do login (para perceber se a pessoa "caiu" logo depois). */
function marcarTentativa() {
  try {
    sessionStorage.setItem(CHAVE_TENTATIVA, String(Date.now()));
  } catch {
    // Armazenamento bloqueado: o próprio AvisoCookies já acusa.
  }
}

/** O navegador guarda cookies? (o acesso ao sistema depende do cookie de sessão) */
function cookiesFuncionam(): boolean {
  try {
    if (!navigator.cookieEnabled) return false;
    const teste = `fincore_teste=${Date.now()}`;
    document.cookie = `${teste}; path=/; SameSite=Lax`;
    const ok = document.cookie.includes(teste);
    document.cookie = "fincore_teste=; path=/; max-age=0";
    return ok;
  } catch {
    return false;
  }
}

/**
 * Aviso de navegador que não guarda o acesso. Sintoma típico no celular: a
 * pessoa entra, vê a primeira tela e, ao trocar de tela, volta para o login —
 * o cookie da sessão não foi guardado (cookies bloqueados no Safari/Chrome ou
 * navegador interno de outro app). Duas pistas: o teste de cookie falha, ou a
 * pessoa voltou para cá poucos minutos depois de entrar.
 */
function AvisoCookies({ voltouParaLogin }: { voltouParaLogin: boolean }) {
  const [motivo, setMotivo] = useState<"bloqueado" | "caiu" | null>(null);

  useEffect(() => {
    let caiu = false;
    try {
      const em = Number(sessionStorage.getItem(CHAVE_TENTATIVA) || 0);
      caiu = voltouParaLogin && em > 0 && Date.now() - em < 10 * 60 * 1000;
      sessionStorage.removeItem(CHAVE_TENTATIVA);
    } catch {
      // sessionStorage bloqueado também é sinal de cookies bloqueados.
    }
    const bloqueado = !cookiesFuncionam();
    // Só depois de montar: o teste usa APIs do navegador.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMotivo(bloqueado ? "bloqueado" : caiu ? "caiu" : null);
  }, [voltouParaLogin]);

  if (!motivo) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-semibold">
        {motivo === "bloqueado"
          ? "Este navegador está bloqueando os cookies — sem eles o sistema não guarda o seu acesso."
          : "Você acabou de entrar e o sistema pediu o login de novo: o navegador não guardou o acesso."}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong>iPhone:</strong> Ajustes → Apps → Safari → desligue <em>Bloquear Todos os Cookies</em>.
        </li>
        <li>
          <strong>Android (Chrome):</strong> ⋮ → Configurações → Configurações do site → Cookies de terceiros / Dados
          do site → <em>Permitir</em>.
        </li>
        <li>
          Se abriu pelo link do WhatsApp ou Instagram, toque em ⋯ e escolha <em>Abrir no navegador</em> (Safari ou
          Chrome).
        </li>
      </ul>
    </div>
  );
}
