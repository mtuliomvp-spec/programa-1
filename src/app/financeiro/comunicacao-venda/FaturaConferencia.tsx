"use client";

import { useRef, useState, useTransition } from "react";
import { Badge, Button, Table, Td, Th, Thead, Tr } from "@/components/ui";
import Link from "next/link";
import {
  conferirFaturaSicoveAction,
  lancarFaltantesSicoveAction,
  unificarFaturaSicoveAction,
  type ConferenciaFatura,
  type UnificacaoFatura,
} from "./actions";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/**
 * Confere a fatura da prestadora contra o que o sistema lançou e, num clique,
 * lança o que faltou. A leitura não grava nada — só o botão grava.
 */
export default function FaturaConferencia() {
  const fileRef = useRef<HTMLInputElement>(null);
  const boletoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ConferenciaFatura | null>(null);
  const [lancando, startLancar] = useTransition();
  const [feito, setFeito] = useState<string | null>(null);
  const [unindo, startUnir] = useTransition();
  const [uniao, setUniao] = useState<UnificacaoFatura | null>(null);

  /** `limpar` false = reconferência depois de gravar, que não apaga o retorno. */
  async function conferir(limpar = true) {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setRes(null);
    if (limpar) {
      setFeito(null);
      setUniao(null);
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const boleto = boletoRef.current?.files?.[0];
      if (boleto) fd.set("boleto", boleto);
      setRes(await conferirFaturaSicoveAction(fd));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Unifica os títulos do mês num borderô só — o boleto. Os arquivos são
   * reenviados porque é o servidor que relê os dois: o que vale é o que está
   * no PDF, nunca o que a tela achou que leu.
   */
  function unificar() {
    const file = fileRef.current?.files?.[0];
    const boleto = boletoRef.current?.files?.[0];
    if (!file || !boleto) return;
    setUniao(null);
    startUnir(async () => {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("boleto", boleto);
      const r = await unificarFaturaSicoveAction(fd);
      setUniao(r);
      if (r.ok) await conferir(false);
    });
  }

  const faltantes = (res?.linhas ?? []).filter((l) => l.situacao === "FALTA");

  function lancar() {
    setFeito(null);
    setUniao(null);
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
          Anexe os dois arquivos que a prestadora manda: o{" "}
          <strong>relatório de detalhamento</strong> (um serviço por linha) e o{" "}
          <strong>boleto</strong> (o valor único que se paga). A leitura é local e instantânea —
          nada é gravado até você mandar lançar ou unificar.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600">
            Relatório de detalhamento
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Boleto <span className="font-normal text-slate-400">(para unificar num pagamento só)</span>
            <input
              ref={boletoRef}
              type="file"
              accept="application/pdf,.pdf"
              className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
            />
          </label>
        </div>
        <div className="mt-3">
          <Button type="button" onClick={() => conferir()} disabled={busy || lancando || unindo}>
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

          {/*
            O boleto: um valor só para os serviços todos. Com ele anexado, os
            títulos do mês podem virar um borderô agora — sem esperar o
            pagamento — e Contas a pagar passa a mostrar um pagamento único.
          */}
          {res.boleto ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-sm font-semibold text-emerald-900">
                🧾 Boleto de {brl(res.boleto.valor)}
                {res.boleto.vencimento ? ` · vence ${res.boleto.vencimento}` : ""}
              </p>
              <p className="mt-0.5 select-all font-mono text-xs text-slate-600">
                {res.boleto.linhaDigitavel}
              </p>
              {res.boleto.avisos.length ? (
                <ul className="mt-2 list-inside list-disc text-xs text-amber-800">
                  {res.boleto.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : null}

              {res.unificado ? (
                <p className="mt-3 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-900">
                  ✓ Esta fatura já está unificada em{" "}
                  <Link
                    href={`/financeiro/combos/${res.unificado.comboId}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {res.unificado.nome}
                  </Link>{" "}
                  · {res.unificado.titulos} título(s) ·{" "}
                  {res.unificado.status === "SOLICITADO" ? "esperando pagamento" : res.unificado.status.toLowerCase()}
                  .{" "}
                  <button type="button" onClick={unificar} disabled={unindo} className="underline">
                    {unindo ? "Atualizando…" : "Atualizar o borderô"}
                  </button>
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={unificar} disabled={unindo || lancando || busy}>
                    {unindo
                      ? "Unificando…"
                      : faltantes.length
                        ? `Lançar os que faltam e unificar num boleto só`
                        : `Unificar os ${res.linhas?.length ?? 0} títulos num boleto só`}
                  </Button>
                  <span className="text-xs text-slate-600">
                    Vira um borderô com os títulos do mês: cada carro continua com o seu custo, mas
                    em Contas a pagar aparece um pagamento único, com os dois PDFs anexados.
                  </span>
                </div>
              )}

              {uniao && !uniao.ok ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  ⚠️ {uniao.error}
                </p>
              ) : null}
              {uniao?.ok ? (
                <p className="mt-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-emerald-900">
                  ✓ {uniao.titulos} título(s) unificados — {brl(uniao.total ?? 0)}
                  {uniao.criados ? ` (${uniao.criados} lançado(s) agora)` : ""}.{" "}
                  <Link
                    href={`/financeiro/combos/${uniao.comboId}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    abrir o borderô →
                  </Link>
                  {uniao.avisos?.length ? ` · ${uniao.avisos.join(" · ")}` : ""}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Anexe também o <strong>boleto</strong> acima e confira de novo: com ele o sistema
              unifica os títulos do mês num pagamento só, já agora — sem esperar o dia de pagar.
            </p>
          )}

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
                        <>
                          <Badge tone="success">lançado</Badge>
                          {l.porPlaca ? (
                            <span className="block text-xs text-slate-500">
                              achado pela placa — o nº do registro entra nele ao unificar
                            </span>
                          ) : null}
                        </>
                      ) : l.situacao === "FALTA" ? (
                        <Badge tone="warning">falta lançar</Badge>
                      ) : (
                        <>
                          <Badge tone="danger">valor diferente</Badge>
                          <span className="block text-xs text-slate-500">
                            lançado: {brl(l.valorLancado ?? 0)}
                            {l.porPlaca ? " (título achado pela placa)" : ""}
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
                    {s.duplicado ? (
                      <span className="block pl-3 text-xs font-medium text-rose-700">
                        ⚠ a placa dele está na fatura e já tem título com o nº do registro: são dois
                        títulos para o mesmo serviço.{" "}
                        <Link href="/financeiro/a-pagar" className="underline">
                          abrir Contas a pagar
                        </Link>{" "}
                        e excluir o que sobrou.
                      </span>
                    ) : null}
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
