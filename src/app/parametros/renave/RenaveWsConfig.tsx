"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { salvarRenaveWsAction, testarRenaveWsAction, type RenaveWsState } from "./actions";

export type RenaveWsConfigDados = {
  ambiente: string | null;
  email: string | null;
  cpfOperador: string | null;
  certProducao: boolean;
  certHomologacao: boolean;
};

/**
 * Integração direta com o Renave-WS (API do SERPRO): ambiente, e-mail da loja e
 * CPF do operador padrão. O certificado fica nas variáveis da instalação — aqui
 * só aparece se está configurado.
 */
export default function RenaveWsConfig({ dados }: { dados: RenaveWsConfigDados }) {
  const [state, formAction, pending] = useActionState(salvarRenaveWsAction, {} as RenaveWsState);
  const [ambiente, setAmbiente] = useState(dados.ambiente ?? "");
  // Depois de salvar, a página volta com o ambiente gravado: o teste usa ele.
  const [gravado, setGravado] = useState(dados.ambiente);
  if (dados.ambiente !== gravado) {
    setGravado(dados.ambiente);
    setAmbiente(dados.ambiente ?? "");
  }
  const [teste, setTeste] = useState<RenaveWsState | null>(null);
  const [testando, startTeste] = useTransition();

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Ambiente">
          {/* Não controlado: o formulário de ação volta aos valores padrão depois de
              salvar; com `value` a caixa voltava a "Desligada" mesmo gravada em produção. */}
          <Select
            key={dados.ambiente ?? "off"}
            name="renaveWsAmbiente"
            defaultValue={dados.ambiente ?? ""}
            onChange={(e) => setAmbiente(e.target.value)}
          >
            <option value="">Desligada</option>
            <option value="HOMOLOGACAO">Homologação (testes, sem custo)</option>
            <option value="PRODUCAO">Produção (cobrado, vale de verdade)</option>
          </Select>
        </Field>
        <Field label="E-mail da loja no Renave">
          <Input name="renaveWsEmail" type="email" defaultValue={dados.email ?? ""} placeholder="contato@loja.com.br" />
        </Field>
        <Field label="CPF do operador (padrão)">
          <Input name="renaveWsCpfOperador" defaultValue={dados.cpfOperador ?? ""} placeholder="usado quando o usuário não tem CPF" />
        </Field>
      </div>
      <ul className="space-y-1 text-xs text-slate-600">
        <li>
          Certificado e-CNPJ de produção:{" "}
          {dados.certProducao ? (
            <strong className="text-emerald-700">configurado na instalação</strong>
          ) : (
            <strong className="text-amber-700">não configurado (variáveis RENAVE_CERT_PFX_BASE64 e RENAVE_CERT_SENHA)</strong>
          )}
        </li>
        <li>
          Homologação:{" "}
          {dados.certHomologacao
            ? "usa o certificado de homologação configurado"
            : "sem certificado — o SERPRO atende como “Estabelecimento padrão de teste” e as operações usam veículos de teste"}
        </li>
        <li>
          O e-mail da loja vai em toda movimentação (o manual pede sempre o mesmo). O CPF do operador é o do usuário logado
          quando ele tem CPF no cadastro; senão, este.
        </li>
      </ul>
      {state.error ? <p className="text-sm text-rose-700">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      {teste?.error ? <p className="text-sm text-rose-700">Teste: {teste.error}</p> : null}
      {teste?.success ? <p className="text-sm text-emerald-700">Teste: {teste.success}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar integração"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!ambiente || testando}
          onClick={() => startTeste(async () => setTeste(await testarRenaveWsAction(ambiente)))}
        >
          {testando ? "Testando..." : "🔌 Testar conexão"}
        </Button>
      </div>
    </form>
  );
}
