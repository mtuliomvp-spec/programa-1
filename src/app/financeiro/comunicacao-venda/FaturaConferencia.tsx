"use client";

import { useRef, useState, useTransition } from "react";
import { Badge, Button, Table, Td, Th, Thead, Tr } from "@/components/ui";
import {
  conferirFaturaSicoveAction,
  lancarFaltantesSicoveAction,
  type ConferenciaFatura,
} from "./actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/**
 * Confere a fatura da prestadora contra o que o sistema lançou e, num clique,
 * lança o que faltou. A leitura não grava nada — só o botão grava.
 */
export default function FaturaConferencia() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ConferenciaFatura | null>(null);
  const [lancando, startLancar] = useTransition();
  const [feito, setFeito] = useState<string | null>(null);

  async function conferir() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setRes(null);
    setFeito(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      setRes(await conferirFaturaSicoveAction(fd));
    } finally {
      setBusy(false);
    }
  }

  const faltantes = (res?.linhas ?? []).filter((l) => l.situacao === "FALTA");

  function lancar() {
    setFeito(null);
    startLancar(async () => {
      const r = await lancarFaltantesSicoveAction(
        faltantes.map((l) => ({
          numero: l.numero,
          tipo: l.tipo,
          placa: l.placa,
          enviadoEm: l.enviadoEm,
        })),
      );
      if (!r.ok) {
        setFeito(r.error || "Não foi possível lançar.");
        return;
      }
      setFeito(
        `${r.criados} título(s) lançado(s).${r.avisos?.length ? ` ${r.avisos.join(" ")}` : ""}`,
      );
      // Reconfere para a tabela refletir o que acabou de ser criado.
      await conferir();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
        <p className="text-sm font-semibold text-slate-800">📄 Fatura do mês</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Anexe o <strong>relatório de detalhamento da fatura</strong> (não o boleto). A leitura é
          local e instantânea — nada é gravado até você mandar lançar.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
          />
          <Button type="button" onClick={conferir} disabled={busy || lancando}>
            {busy ? "Lendo…" : "Conferir fatura"}
          </Button>
        </div>
        {res?.error ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠️ {res.error}
          </p>
        ) : null}
      </div>

      {res?.ok && res.fatura && res.resumo ? (
        <>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">
              Fatura {res.fatura.numero ?? "—"} · {res.fatura.itens} serviço(s)
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Período {res.fatura.periodo ?? "—"} · vencimento {res.fatura.vencimento ?? "—"}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Cobrado</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">
                  {brl(res.resumo.totalFatura)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Já lançado</p>
                <p className="text-lg font-bold tabular-nums text-slate-900">
                  {brl(res.resumo.totalLancado)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Falta lançar</p>
                <p
                  className={`text-lg font-bold tabular-nums ${res.resumo.faltando ? "text-amber-700" : "text-emerald-700"}`}
                >
                  {res.resumo.faltando}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Valor diferente</p>
                <p
                  className={`text-lg font-bold tabular-nums ${res.resumo.divergentes ? "text-rose-700" : "text-emerald-700"}`}
                >
                  {res.resumo.divergentes}
                </p>
              </div>
            </div>
            {faltantes.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button type="button" onClick={lancar} disabled={lancando}>
                  {lancando ? "Lançando…" : `Lançar os ${faltantes.length} que faltam`}
                </Button>
                <span className="text-xs text-slate-500">
                  Cada um vira um título vinculado ao veículo da placa, quando ele estiver no sistema.
                </span>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                ✓ Tudo o que a fatura cobrou já está lançado.
              </p>
            )}
            {feito ? (
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {feito}
              </p>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <Table>
              <Thead>
                <Tr>
                  <Th>Serviço</Th>
                  <Th>Placa</Th>
                  <Th>Enviado</Th>
                  <Th>Nº do registro</Th>
                  <Th>Cobrado</Th>
                  <Th>Situação</Th>
                </Tr>
              </Thead>
              <tbody>
                {res.linhas?.map((l) => (
                  <Tr key={l.numero}>
                    <Td>{l.tipo === "CANCELAMENTO" ? "Cancelamento" : "Comunicação"}</Td>
                    <Td>
                      <span className="font-medium text-slate-800">{l.placa}</span>
                      {l.veiculo ? (
                        <span className="block text-xs text-slate-500">{l.veiculo.label}</span>
                      ) : (
                        <span className="block text-xs text-amber-700">fora do estoque</span>
                      )}
                    </Td>
                    <Td className="tabular-nums">{dataBr(l.enviadoEm)}</Td>
                    <Td className="tabular-nums text-xs">{l.numero}</Td>
                    <Td className="tabular-nums">{brl(l.valorFatura)}</Td>
                    <Td>
                      {l.situacao === "LANCADO" ? (
                        <Badge tone="success">lançado</Badge>
                      ) : l.situacao === "FALTA" ? (
                        <Badge tone="warning">falta lançar</Badge>
                      ) : (
                        <>
                          <Badge tone="danger">valor diferente</Badge>
                          <span className="block text-xs text-slate-500">
                            lançado: {brl(l.valorLancado ?? 0)}
                          </span>
                        </>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>

          {res.sobrando && res.sobrando.length > 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-900">
                {res.sobrando.length} título(s) do mês que a fatura não cobrou
              </p>
              <p className="mt-0.5 text-xs text-rose-800">
                Ou o serviço entra na fatura seguinte, ou foi lançado a mais aqui. Confira antes de
                pagar.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-rose-900">
                {res.sobrando.map((s) => (
                  <li key={s.id}>
                    · {s.descricao} — {brl(s.valor)}
                    {s.numero ? ` (${s.numero})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
