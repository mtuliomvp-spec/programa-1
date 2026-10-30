"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { pedirAssinaturaAction, type PedidoState } from "./actions";

/** Formulário "Solicite seu acesso" da página /assinar. */
export default function PedidoForm({ ufs, email, dias }: { ufs: readonly string[]; email: string; dias: number }) {
  const [state, action, pending] = useActionState(pedirAssinaturaAction, {} as PedidoState);
  const v = state.valores ?? {};

  if (state.ok) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-6 text-emerald-900">
        <p className="text-lg font-semibold">Pedido recebido. Obrigado!</p>
        <p className="mt-2 text-sm leading-relaxed">
          Seu cadastro entrou em análise. Em até {dias} dias corridos entraremos em contato pelo WhatsApp ou
          pelo e-mail informado para liberar o seu acesso. Se preferir, escreva para{" "}
          <a href={`mailto:${email}`} className="font-semibold underline">
            {email}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </div>
      ) : null}

      {/* Armadilha para robôs: escondida de quem enxerga e de leitores de tela. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site
          <input name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da loja" required>
          <Input name="nomeLoja" defaultValue={v.nomeLoja} required maxLength={120} autoComplete="organization" />
        </Field>
        <Field label="CNPJ">
          <Input name="cnpj" defaultValue={v.cnpj} inputMode="numeric" maxLength={18} placeholder="Opcional" />
        </Field>
        <Field label="Seu nome" required>
          <Input name="responsavel" defaultValue={v.responsavel} required maxLength={120} autoComplete="name" />
        </Field>
        <Field label="WhatsApp com DDD" required>
          <Input name="whatsapp" defaultValue={v.whatsapp} type="tel" required inputMode="tel" maxLength={20} placeholder="(00) 00000-0000" autoComplete="tel" />
        </Field>
        <Field label="E-mail" required>
          <Input name="email" defaultValue={v.email} type="email" required maxLength={120} autoComplete="email" />
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Cidade" required>
            <Input name="cidade" defaultValue={v.cidade} required maxLength={80} autoComplete="address-level2" />
          </Field>
          <Field label="UF" required>
            <Select key={v.uf ?? ""} name="uf" required defaultValue={v.uf ?? ""}>
              <option value="" disabled>
                —
              </option>
              {ufs.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <Field label="Quer contar algo sobre a sua loja?">
        <Textarea name="mensagem" defaultValue={v.mensagem} rows={3} maxLength={1000} placeholder="Opcional: quantos carros em estoque, sistema que usa hoje…" />
      </Field>

      <label className="flex items-start gap-2.5 text-sm text-slate-600">
        <input type="checkbox" name="aceite" required defaultChecked={!!state.valores} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Autorizo o contato pelo WhatsApp e por e-mail e o uso destes dados para analisar o meu cadastro,
          conforme a{" "}
          <Link href="/assinar/privacidade" target="_blank" className="font-medium text-blue-700 underline">
            política de privacidade
          </Link>
          .
        </span>
      </label>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Enviando…" : "Solicitar meu acesso"}
      </Button>
    </form>
  );
}
