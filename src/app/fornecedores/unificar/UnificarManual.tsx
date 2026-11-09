"use client";

import { useState, useTransition } from "react";
import { Button, Field, Select } from "@/components/ui";
import { perguntar } from "@/lib/confirmar";
import { unificarDoisFornecedoresAction } from "./actions";

export type OpcaoFornecedor = {
  id: string;
  name: string;
  document: string | null;
  usuario: boolean;
  /** Lançamentos ligados (veículos, peças, títulos, recorrências…). */
  lancamentos: number;
};

const rotulo = (f: OpcaoFornecedor) =>
  `${f.name}${f.document ? ` · ${f.document}` : ""}${f.usuario ? " · usuário" : ""} (${f.lancamentos} lanç.)`;

/**
 * Escolher à mão dois cadastros do mesmo fornecedor: o que FICA e o que é
 * incorporado (os lançamentos dele passam para o que fica e ele é excluído).
 */
export default function UnificarManual({ fornecedores, inicial }: { fornecedores: OpcaoFornecedor[]; inicial?: string }) {
  const [some, setSome] = useState(inicial ?? "");
  const [fica, setFica] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fSome = fornecedores.find((f) => f.id === some);
  const fFica = fornecedores.find((f) => f.id === fica);
  // Qualquer cadastro pode ir em qualquer campo. Escolher num campo o que já
  // está no outro troca os dois de lugar.
  function escolherSome(id: string) {
    if (id && id === fica) setFica(some);
    setSome(id);
  }
  function escolherFica(id: string) {
    if (id && id === some) setSome(fica);
    setFica(id);
  }
  function inverter() {
    setSome(fica);
    setFica(some);
  }
  const someEhUsuario = !!fSome?.usuario;

  async function unificar() {
    if (!fSome || !fFica) return;
    setErro(null);
    const ok = await perguntar(
      `Unificar «${fSome.name}» em «${fFica.name}»?\n\n` +
        `${fSome.lancamentos} lançamento(s) passam para «${fFica.name}». Nenhum lançamento é apagado. ` +
        `Depois disso, o cadastro «${fSome.name}» (já vazio) é excluído.`,
    );
    if (!ok) return;
    start(async () => {
      const r = await unificarDoisFornecedoresAction(fFica.id, fSome.id);
      if (!r.ok) {
        setErro(r.error || "Não foi possível unificar.");
        return;
      }
      window.location.assign(`/fornecedores/unificar?ok=${encodeURIComponent(`${fSome.name} → ${r.nome} · ${r.movidos} lançamento(s)`)}`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <Field label="Cadastro que SOME (vai ser incorporado)">
          <Select value={some} onChange={(e) => escolherSome(e.target.value)}>
            <option value="">— escolha —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {rotulo(f)}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          type="button"
          variant="secondary"
          onClick={inverter}
          disabled={!some && !fica}
          title="Trocar: o que some passa a ficar, e vice-versa"
        >
          ⇄ Inverter
        </Button>
        <Field label="Cadastro que FICA">
          <Select value={fica} onChange={(e) => escolherFica(e.target.value)}>
            <option value="">— escolha —</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {rotulo(f)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {someEhUsuario ? (
        <p className="text-sm text-amber-700">
          «{fSome!.name}» é um usuário do sistema e não pode sumir. Clique em ⇄ Inverter para que ele seja o cadastro
          que fica.
        </p>
      ) : fSome && fFica && fSome.lancamentos > fFica.lancamentos ? (
        <p className="text-sm text-slate-500">
          Dica: «{fSome.name}» tem mais lançamentos. Se ele é o cadastro mais completo, use ⇄ Inverter para que ele
          fique.
        </p>
      ) : null}
      {fSome && fFica ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <strong>{fSome.lancamentos}</strong> lançamento(s) de «{fSome.name}» passam para «<strong>{fFica.name}</strong>».
          O que estiver vazio em «{fFica.name}» (telefone, e-mail, endereço, dados bancários…) é completado com os dados de
          «{fSome.name}». Depois, «{fSome.name}» é excluído.
        </p>
      ) : null}
      {erro ? <p className="text-sm text-rose-600">{erro}</p> : null}
      <Button type="button" onClick={unificar} disabled={!fSome || !fFica || someEhUsuario || pending}>
        {pending ? "Unificando…" : "Unificar estes dois cadastros"}
      </Button>
    </div>
  );
}
