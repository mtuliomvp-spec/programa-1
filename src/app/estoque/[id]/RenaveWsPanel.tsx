"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { formatDate } from "@/lib/format";
import {
  ROTULO_ESTADO_ESTOQUE,
  ROTULO_TIPO_CRV,
  TIPOS_CRV,
  type Aptidao,
  type DadosEntrada,
  type DadosSaida,
  type EstadoEstoque,
  type RenaveAmbiente,
} from "@/lib/renave-ws-dados";
import {
  anexarAtpveRenaveAction,
  buscarCodigoCrvRenaveAction,
  cancelarEntradaRenaveAction,
  cancelarSaidaRenaveAction,
  consultarAptidaoRenaveAction,
  criarVeiculoTesteRenaveAction,
  entradaProprioRenaveAction,
  entradaRenaveAction,
  enviarAssinaturaRenaveAction,
  enviarNotaRenaveAction,
  municipioRenaveAction,
  saidaRenaveAction,
  simularDetranRenaveAction,
  sincronizarRenaveAction,
  type RenaveWsResult,
} from "../renave-ws-actions";
import { guiaFeito } from "@/lib/guia/eventos";

export type RenaveWsRegistro = {
  idEstoque: number | null;
  estado: EstadoEstoque | null;
  sincronizadoEm: string | null;
  assinaturaEnviadaEm: string | null;
  atpveNumero: string | null;
  codigoCrvAtual: string | null;
  mock: { placa: string; renavam: string; numeroCrv: string; codigoSegurancaCrv: string; documentoProprietario: string; proprio: boolean } | null;
  cancelado: boolean;
  proprio: boolean;
  notaEntrada: string | null;
  notaSaida: string | null;
  termoEntrada: number | null;
  termoSaida: number | null;
  compradorNome: string | null;
  restricoes: string[];
} | null;

export type RenaveWsOperacao = {
  id: string;
  operacao: string;
  status: string;
  mensagem: string | null;
  userName: string | null;
  createdAt: string;
};

export type RenaveWsAnexo = { id: string; description: string; filename: string };

const ROTULO_OPERACAO: Record<string, string> = {
  MOCK_VEICULO: "Veículo de teste criado",
  MOCK_DETRAN: "Detran simulado",
  APTIDAO: "Consulta de aptidão",
  ENTRADA: "Entrada em estoque",
  ENTRADA_PROPRIO: "Entrada de veículo próprio",
  ASSINATURA_VENDEDOR: "Assinatura do vendedor",
  NF_ENTRADA: "NF-e de entrada",
  NF_SAIDA: "NF-e de venda",
  CODIGO_CRV: "Código do CRV atual",
  SAIDA: "Saída (venda)",
  CANCELAR_ENTRADA: "Cancelamento da entrada",
  CANCELAR_SAIDA: "Cancelamento da saída",
};

/**
 * Renave direto pelo sistema (API do SERPRO), na ordem que o Renave exige:
 * entrada → assinatura do vendedor → NF-e de entrada → confirmação do Detran
 * → saída (o Renave gera a ATPV-e) → NF-e de venda.
 */
export default function RenaveWsPanel(p: {
  vehicleId: string;
  ambiente: RenaveAmbiente;
  podeOperar: boolean;
  registro: RenaveWsRegistro;
  operacoes: RenaveWsOperacao[];
  entrada: DadosEntrada;
  proprioSugerido: boolean;
  /** Veículo já vendido no sistema: sem entrada no Renave, não há o que registrar. */
  vendido: boolean;
  /** UF da loja cujo DETRAN ainda não aderiu ao Renave de usados (null = opera). */
  ufSemRenave: string | null;
  saida: (DadosSaida & { cidade: string; uf: string }) | null;
  anexos: RenaveWsAnexo[];
  chaves: { entrada: string | null; saida: string | null };
  hoje: string;
}) {
  const router = useRouter();
  // Estado próprio (não useTransition): o refresh da ficha não pode prender o
  // aviso de “falando com o Renave” depois que a resposta já chegou.
  const [pendente, setPendente] = useState(false);
  const [msg, setMsg] = useState<RenaveWsResult | null>(null);
  const [aptidao, setAptidao] = useState<Aptidao | null>(null);
  const hom = p.ambiente === "HOMOLOGACAO";
  const reg = p.registro;
  const mock = hom ? reg?.mock ?? null : null;
  const aberto = !!reg?.idEstoque && !reg.cancelado;
  const estado = aberto ? reg!.estado : null;
  // A resposta aparece no topo do painel, longe do botão clicado (que costuma
  // ficar no fim do formulário): leva a tela até ela.
  const avisoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (msg && (msg.error || msg.faltas?.length || msg.message))
      avisoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [msg]);

  function rodar(fn: () => Promise<RenaveWsResult>, confirmar?: string, guia?: string) {
    if (confirmar && !hom && !window.confirm(confirmar)) return;
    setMsg(null);
    setPendente(true);
    fn()
      .then((r) => {
        setMsg(r);
        if (r.aptidao) setAptidao(r.aptidao);
        if (r.ok && guia) {
          guiaFeito(guia, [
            r.message || "Operação concluída no Renave.",
            hom ? "Ambiente de homologação: teste, sem custo e sem valor legal." : "Registrado no Renave (produção).",
          ]);
        }
        // Atualiza a ficha sempre (o histórico de chamadas registra também os
        // erros); só a aptidão bem-sucedida não precisa, o quadro já mostra.
        if (!(r.ok && r.aptidao)) router.refresh();
      })
      .catch(() => setMsg({ ok: false, error: "Falha de comunicação com o servidor." }))
      .finally(() => setPendente(false));
  }

  const cobrado = "Esta operação é registrada no Renave (produção), é cobrada pelo SERPRO e tem valor legal. Confirmar?";

  return (
    <div className="border-t border-slate-100 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">🔗 Renave direto (SERPRO)</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${hom ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
        >
          {hom ? "Homologação — teste, sem custo" : "Produção — cobrado"}
        </span>
      </div>
      {!hom && p.ufSemRenave !== null ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">
            🛑 O DETRAN{p.ufSemRenave ? ` do ${p.ufSemRenave}` : " do estado"} ainda não aderiu ao Renave de veículos usados
          </p>
          <p className="mt-0.5">
            Para carros registrados no estado, as operações (aptidão, entrada e saída) não funcionam até a adesão —
            confirmado pelo SERPRO. A escrituração continua pelo livro do DETRAN. A integração já está pronta: quando o
            estado aderir, atualize a situação em Parâmetros → Renave. Carro registrado em estado que já aderiu pode ser
            consultado normalmente.
          </p>
        </div>
      ) : null}
      {hom ? (
        <p className="mt-1 text-xs text-amber-800">
          Na homologação o SERPRO atende como “Estabelecimento padrão de teste” e o carro de verdade não existe lá: as
          operações usam um veículo de teste criado para este cadastro. Nada aqui altera a ficha.
        </p>
      ) : null}

      <div ref={avisoRef} className="scroll-mt-4">
        {pendente ? (
          <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            ⏳ Falando com o Renave… pode levar até 2 minutos. Não feche a tela.
          </p>
        ) : null}
        {msg?.error ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{msg.error}</p> : null}
        {msg?.faltas?.length ? (
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-semibold">Falta para enviar:</p>
            <ul className="ml-4 list-disc">
              {msg.faltas.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {msg?.ok && msg.message ? <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg.message}</p> : null}
      </div>

      {/* Situação */}
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        {aberto ? (
          <>
            <p className="font-semibold text-slate-900">
              {estado ? ROTULO_ESTADO_ESTOQUE[estado] : "Estoque no Renave"} · estoque {reg!.idEstoque}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
              <li>
                Termo de entrada: {reg!.termoEntrada ? `nº ${reg!.termoEntrada}` : "—"}
                {reg!.termoSaida ? ` · termo de saída nº ${reg!.termoSaida}` : ""}
              </li>
              {!reg!.proprio ? (
                <li>
                  Assinatura do vendedor:{" "}
                  {reg!.assinaturaEnviadaEm ? `enviada em ${formatDate(reg!.assinaturaEnviadaEm)}` : "não enviada"}
                </li>
              ) : null}
              <li>NF-e de entrada no Renave: {reg!.notaEntrada ? `…${reg!.notaEntrada.slice(-8)}` : "não enviada"}</li>
              {reg!.estado === "FINALIZADO" ? (
                <li>
                  Comprador: {reg!.compradorNome ?? "—"} · NF-e de venda: {reg!.notaSaida ? `…${reg!.notaSaida.slice(-8)}` : "não enviada"}
                </li>
              ) : null}
              {reg!.restricoes.length ? <li>Anotações no Renavam: {reg!.restricoes.join(", ")}</li> : null}
              {reg!.sincronizadoEm ? <li>Atualizado do Renave em {new Date(reg!.sincronizadoEm).toLocaleString("pt-BR")}</li> : null}
            </ul>
          </>
        ) : (
          <p className="text-slate-600">
            {reg?.cancelado ? "Entrada cancelada no Renave." : "Sem entrada deste veículo no Renave."}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Mini
            disabled={pendente || !p.podeOperar || (hom && !mock)}
            onClick={() => rodar(() => sincronizarRenaveAction(p.vehicleId), undefined, "renave.atualizar")}
            data-guia="renave.atualizar"
          >
            🔄 Atualizar do Renave
          </Mini>
          {aberto ? (
            <>
              <a className={linkCls} href={`/estoque/${p.vehicleId}/renave/termo-entrada`} target="_blank" rel="noreferrer">
                Termo de entrada
              </a>
              {reg!.estado === "SOLICITADO" && !reg!.proprio ? (
                <a className={linkCls} href={`/estoque/${p.vehicleId}/renave/atpv`} target="_blank" rel="noreferrer">
                  ATPV-e da compra (CRV digital)
                </a>
              ) : null}
              {reg!.estado === "FINALIZADO" ? (
                <>
                  <a className={linkCls} href={`/estoque/${p.vehicleId}/renave/atpv`} target="_blank" rel="noreferrer">
                    ATPV-e (gerada pelo Renave)
                  </a>
                  <a className={linkCls} href={`/estoque/${p.vehicleId}/renave/termo-saida`} target="_blank" rel="noreferrer">
                    Termo de saída
                  </a>
                </>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {!p.podeOperar ? (
        <p className="mt-2 text-xs text-slate-500">
          Registrar no Renave exige a permissão “Renave: registrar entrada/saída direto no SERPRO”.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {hom ? (
            <Etapa n={0} titulo="Veículo de teste (homologação)" feito={!!mock}>
              {mock ? (
                <p className="text-xs text-slate-600">
                  Placa {mock.placa} · Renavam {mock.renavam} · CRV {mock.numeroCrv} (verde) · código {mock.codigoSegurancaCrv} ·{" "}
                  {mock.proprio ? "no nome da loja de teste" : `proprietário ${mock.documentoProprietario}`}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <Mini disabled={pendente} onClick={() => rodar(() => criarVeiculoTesteRenaveAction(p.vehicleId, false))}>
                  {mock ? "Novo veículo de teste (comprado de terceiro)" : "Criar veículo de teste (comprado de terceiro)"}
                </Mini>
                <Mini disabled={pendente} onClick={() => rodar(() => criarVeiculoTesteRenaveAction(p.vehicleId, true))}>
                  …já no nome da loja
                </Mini>
              </div>
            </Etapa>
          ) : null}

          {(!aberto || reg?.cancelado) && p.vendido && !hom ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Veículo já vendido e sem entrada no Renave: não há entrada a registrar (o Renave diria que o carro ainda
              está com a loja). Os registros valem para os carros em estoque.
            </p>
          ) : !aberto || reg?.cancelado ? (
            <EntradaForm
              // Remonta quando a ficha muda o CRV (leitura do CRLV, código buscado
              // no Renave): o formulário mostra o que acabou de ser gravado.
              key={`${mock?.placa ?? "real"}|${p.entrada.tipoCrv}|${p.entrada.numeroCrv}|${p.entrada.codigoSegurancaCrv}`}
              base={
                mock
                  ? {
                      ...p.entrada,
                      placa: mock.placa,
                      renavam: mock.renavam,
                      tipoCrv: "VERDE",
                      numeroCrv: mock.numeroCrv,
                      codigoSegurancaCrv: mock.codigoSegurancaCrv,
                      documentoProprietario: mock.documentoProprietario,
                      // O CRV do teste é emitido na criação: a compra não pode ser antes dele.
                      dataCompra: p.hoje,
                      kmEm: `${p.hoje}T09:00`,
                    }
                  : p.entrada
              }
              proprioInicial={mock ? mock.proprio : p.proprioSugerido}
              bloqueado={pendente || (hom && !mock)}
              hoje={p.hoje}
              aptidao={aptidao}
              onAptidao={(d) => rodar(() => consultarAptidaoRenaveAction(p.vehicleId, d), undefined, "renave.aptidao")}
              onBuscarCodigo={(numeroCrv) => rodar(() => buscarCodigoCrvRenaveAction(p.vehicleId, numeroCrv))}
              codigoBuscado={msg?.codigo ?? null}
              onEntrada={(d, proprio) =>
                rodar(
                  () =>
                    proprio
                      ? entradaProprioRenaveAction(p.vehicleId, { ...d, dataEntrada: d.dataCompra })
                      : entradaRenaveAction(p.vehicleId, d),
                  cobrado,
                  "renave.entrada",
                )
              }
            />
          ) : null}

          {/* Depois que o Detran inicia a transferência o Renave não aceita reenvio da assinatura. */}
          {aberto && !reg!.proprio && reg!.estado === "SOLICITADO" ? (
            <Assinatura
              anexos={p.anexos}
              enviada={!!reg!.assinaturaEnviadaEm}
              bloqueado={pendente}
              onEnviar={(id) => rodar(() => enviarAssinaturaRenaveAction(p.vehicleId, id), undefined, "renave.assinatura")}
            />
          ) : null}

          {aberto && reg!.estado !== "FINALIZADO" ? (
            <Nota
              titulo="NF-e de entrada"
              n={3}
              feito={!!reg!.notaEntrada}
              chaveFicha={p.chaves.entrada}
              hom={hom}
              bloqueado={pendente}
              onEnviar={(c) => rodar(() => enviarNotaRenaveAction(p.vehicleId, "COMPRA", c), undefined, "renave.nota")}
            />
          ) : null}

          {aberto && reg!.estado === "SOLICITADO" ? (
            <Etapa n={4} titulo="Confirmação do Detran" feito={false}>
              <p className="text-xs text-slate-600">
                O Detran emite o CRV em nome da loja e o estoque passa a “confirmado”. Use “Atualizar do Renave” para conferir.
              </p>
              {hom ? (
                <div className="mt-2">
                  <Mini disabled={pendente} onClick={() => rodar(() => simularDetranRenaveAction(p.vehicleId))}>
                    Simular confirmação do Detran
                  </Mini>
                </div>
              ) : null}
            </Etapa>
          ) : null}

          {aberto && reg!.estado === "CONFIRMADO" ? (
            p.saida ? (
              <SaidaForm
                base={hom ? { ...p.saida, dataVenda: p.hoje } : p.saida}
                codigoAtual={reg!.codigoCrvAtual}
                bloqueado={pendente}
                hoje={p.hoje}
                onBuscarCodigo={(numeroCrv) => rodar(() => buscarCodigoCrvRenaveAction(p.vehicleId, numeroCrv))}
                onMunicipio={async (cidade, uf) => municipioRenaveAction(cidade, uf)}
                onSaida={(d) => rodar(() => saidaRenaveAction(p.vehicleId, d), cobrado, "renave.saida")}
                codigoBuscado={msg?.codigo ?? null}
              />
            ) : (
              <Etapa n={5} titulo="Saída (venda)" feito={false}>
                <p className="text-xs text-slate-600">Registre a venda no sistema para liberar a saída no Renave.</p>
              </Etapa>
            )
          ) : null}

          {aberto && reg!.estado === "FINALIZADO" ? (
            <>
              <Etapa n={6} titulo="ATPV-e gerada pelo Renave" feito={!!reg!.atpveNumero}>
                <p className="text-xs text-slate-600">
                  Traz “Documento gerado pelo RENAVE”: dispensa as assinaturas da loja e do comprador.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className={linkCls} href={`/estoque/${p.vehicleId}/renave/atpv`} target="_blank" rel="noreferrer">
                    Abrir ATPV-e
                  </a>
                  {!hom ? (
                    <Mini disabled={pendente} onClick={() => rodar(() => anexarAtpveRenaveAction(p.vehicleId))}>
                      Anexar aos documentos
                    </Mini>
                  ) : null}
                </div>
              </Etapa>
              <Nota
                titulo="NF-e de venda"
                n={7}
                feito={!!reg!.notaSaida}
                chaveFicha={p.chaves.saida}
                hom={hom}
                bloqueado={pendente}
                onEnviar={(c) => rodar(() => enviarNotaRenaveAction(p.vehicleId, "VENDA", c), undefined, "renave.nota")}
              />
            </>
          ) : null}

          {aberto ? (
            <Cancelamentos
              finalizado={reg!.estado === "FINALIZADO"}
              cpf={p.entrada.cpfOperador}
              hoje={p.hoje}
              bloqueado={pendente}
              onCancelarEntrada={(d) =>
                rodar(() => cancelarEntradaRenaveAction(p.vehicleId, d), "Cancelar a ENTRADA deste veículo no Renave?", "renave.cancelar")
              }
              onCancelarSaida={(d) =>
                rodar(() => cancelarSaidaRenaveAction(p.vehicleId, d), "Cancelar a SAÍDA (venda) deste veículo no Renave?", "renave.cancelar")
              }
            />
          ) : null}
        </div>
      )}

      {pendente ? <p className="mt-2 text-xs text-slate-500">Falando com o Renave… pode levar até 2 minutos. Não feche a tela.</p> : null}

      {p.operacoes.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-600">Histórico de chamadas ({p.operacoes.length})</summary>
          <ul className="mt-1 divide-y divide-slate-100 text-xs">
            {p.operacoes.map((o) => (
              <li key={o.id} className="py-1">
                <span className={o.status === "OK" ? "text-emerald-700" : o.status === "PENDENTE" ? "text-slate-500" : "text-rose-700"}>
                  {o.status === "OK" ? "✓" : o.status === "PENDENTE" ? "…" : "✗"}
                </span>{" "}
                {ROTULO_OPERACAO[o.operacao] ?? o.operacao} · {new Date(o.createdAt).toLocaleString("pt-BR")}
                {o.userName ? ` · ${o.userName}` : ""}
                {o.mensagem ? <span className="block text-slate-500">{o.mensagem}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

const linkCls =
  "inline-flex h-7 items-center rounded-lg border border-blue-200 bg-white px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50";

function Mini({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-7 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Etapa({ n, titulo, feito, children }: { n: number; titulo: string; feito: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-900">
        <span className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${feito ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700"}`}>
          {feito ? "✓" : n}
        </span>
        {titulo}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function EntradaForm({
  base,
  proprioInicial,
  bloqueado,
  hoje,
  aptidao,
  onAptidao,
  onEntrada,
  onBuscarCodigo,
  codigoBuscado,
}: {
  base: DadosEntrada;
  proprioInicial: boolean;
  bloqueado: boolean;
  hoje: string;
  aptidao: Aptidao | null;
  onAptidao: (d: { tipoCrv: string; numeroCrv: string }) => void;
  onEntrada: (d: DadosEntrada, proprio: boolean) => void;
  onBuscarCodigo: (numeroCrv: string) => void;
  codigoBuscado: string | null;
}) {
  const [d, setD] = useState(base);
  const [proprio, setProprio] = useState(proprioInicial);
  // Código do CRV atual buscado no Renave (carro já no nome da loja).
  const [ultimoBuscado, setUltimoBuscado] = useState<string | null>(null);
  if (codigoBuscado && codigoBuscado !== ultimoBuscado) {
    setUltimoBuscado(codigoBuscado);
    setD({ ...d, codigoSegurancaCrv: codigoBuscado });
  }
  const campo = (k: keyof DadosEntrada) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value }),
  });
  return (
    <Etapa n={1} titulo="Entrada no estoque" feito={false}>
      <label className="flex items-center gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={proprio} onChange={(e) => setProprio(e.target.checked)} />
        CRV já no nome da loja (entrada de veículo próprio — sem vendedor e sem assinatura)
      </label>
      {proprio ? (
        <p className="mt-1 text-xs text-amber-800">
          Use o CRV ATUAL, emitido em nome da loja (número no CRLV-e; o código dá para buscar no Renave) — não o da ATPV-e
          ou do CRV de papel do dono anterior.
        </p>
      ) : null}
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Placa">
          <Input value={d.placa} readOnly />
        </Field>
        <Field label="Renavam">
          <Input value={d.renavam} readOnly />
        </Field>
        <Field label="Tipo do CRV">
          <Select {...campo("tipoCrv")}>
            <option value="">Escolha…</option>
            {TIPOS_CRV.map((t) => (
              <option key={t} value={t}>
                {ROTULO_TIPO_CRV[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nº do CRV">
          <Input {...campo("numeroCrv")} inputMode="numeric" />
        </Field>
        <Field label="Código de segurança do CRV">
          <Input {...campo("codigoSegurancaCrv")} inputMode="numeric" />
        </Field>
        {proprio ? (
          <div className="flex items-end">
            <Button type="button" variant="secondary" disabled={bloqueado} onClick={() => onBuscarCodigo(d.numeroCrv)} data-guia="renave.codigo">
              Buscar código no Renave
            </Button>
          </div>
        ) : null}
        <Field label="Km no hodômetro">
          <Input {...campo("km")} inputMode="numeric" />
        </Field>
        <Field label="Leitura do hodômetro em">
          <Input type="datetime-local" {...campo("kmEm")} max={`${hoje}T23:59`} />
        </Field>
        <Field label={proprio ? "Data de entrada no estoque" : "Data da compra"}>
          <Input type="date" {...campo("dataCompra")} max={hoje} />
        </Field>
        {!proprio ? (
          <>
            <Field label="Valor da compra (R$)">
              <Input {...campo("valorCompra")} inputMode="decimal" />
            </Field>
            <Field label="CPF/CNPJ do proprietário no CRV">
              <Input {...campo("documentoProprietario")} inputMode="numeric" />
            </Field>
            <Field label="E-mail do vendedor">
              <Input type="email" {...campo("emailVendedor")} />
            </Field>
            <Field label="E-mail da loja">
              <Input type="email" {...campo("emailEstabelecimento")} />
            </Field>
          </>
        ) : null}
        <Field label="CPF do operador responsável">
          <Input {...campo("cpfOperador")} inputMode="numeric" />
        </Field>
      </div>
      {aptidao ? <AptidaoBox a={aptidao} /> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={bloqueado} onClick={() => onAptidao({ tipoCrv: d.tipoCrv, numeroCrv: d.numeroCrv })} data-guia="renave.aptidao">
          Consultar aptidão (grátis)
        </Button>
        <Button type="button" disabled={bloqueado} onClick={() => onEntrada(d, proprio)} data-guia="renave.entrada">
          Registrar entrada no Renave
        </Button>
      </div>
    </Etapa>
  );
}

function AptidaoBox({ a }: { a: Aptidao }) {
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${a.apto ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
      <p className="font-semibold">
        {a.apto === null ? "Aptidão não determinada" : a.apto ? "✓ Apto a entrar em estoque" : "✗ Não apto a entrar em estoque"}
      </p>
      {a.detranFalhou ? <p className="text-xs">O Renave não conseguiu falar com o Detran — tente de novo mais tarde.</p> : null}
      {a.motivos.length ? <p className="text-xs">Motivos: {a.motivos.join("; ")}</p> : null}
      {a.debitos.existe ? (
        <p className="text-xs">
          Débitos no Detran: {brl(a.debitos.total)}
          {a.debitos.boletos.length ? ` · ${a.debitos.boletos.length} boleto(s)` : ""}
        </p>
      ) : (
        <p className="text-xs">Sem débitos informados pelo Detran.</p>
      )}
    </div>
  );
}

function Assinatura({
  anexos,
  enviada,
  bloqueado,
  onEnviar,
}: {
  anexos: RenaveWsAnexo[];
  enviada: boolean;
  bloqueado: boolean;
  onEnviar: (id: string) => void;
}) {
  const [id, setId] = useState(anexos[0]?.id ?? "");
  return (
    <Etapa n={2} titulo="Assinatura do vendedor no ATPV" feito={enviada}>
      <p className="text-xs text-slate-600">
        Foto/PDF do ATPV-e impresso (ou do verso do CRV de papel) assinado pelo vendedor com firma reconhecida. Se o vendedor
        assinar pelo app Carteira Digital de Trânsito (assinatura avançada), não é preciso enviar nada.
      </p>
      {anexos.length ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label="Arquivo">
            <Select value={id} onChange={(e) => setId(e.target.value)}>
              {anexos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.description} — {a.filename}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="button" disabled={bloqueado || !id} onClick={() => onEnviar(id)} data-guia="renave.assinatura">
            {enviada ? "Reenviar assinatura" : "Enviar assinatura"}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-700">Anexe a ATPV-e assinada (card ATPV-e ou Documentos) para enviar.</p>
      )}
    </Etapa>
  );
}

function Nota({
  titulo,
  n,
  feito,
  chaveFicha,
  hom,
  bloqueado,
  onEnviar,
}: {
  titulo: string;
  n: number;
  feito: boolean;
  chaveFicha: string | null;
  hom: boolean;
  bloqueado: boolean;
  onEnviar: (chave: string) => void;
}) {
  const [chave, setChave] = useState(chaveFicha ?? "");
  return (
    <Etapa n={n} titulo={titulo} feito={feito}>
      <p className="text-xs text-slate-600">
        {chaveFicha ? "Chave da ficha do veículo." : "Sem chave na ficha — emita/leia a NF-e ou digite a chave."}
        {hom ? " Em homologação o SERPRO aceita qualquer chave válida." : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Chave de acesso (44 dígitos)">
            <Input value={chave} onChange={(e) => setChave(e.target.value)} inputMode="numeric" />
          </Field>
        </div>
        <Button type="button" disabled={bloqueado || chave.replace(/\D/g, "").length !== 44} onClick={() => onEnviar(chave)} data-guia="renave.nota">
          {feito ? "Reenviar" : "Enviar ao Renave"}
        </Button>
      </div>
    </Etapa>
  );
}

function SaidaForm({
  base,
  codigoAtual,
  codigoBuscado,
  bloqueado,
  hoje,
  onBuscarCodigo,
  onMunicipio,
  onSaida,
}: {
  base: DadosSaida & { cidade: string; uf: string };
  codigoAtual: string | null;
  codigoBuscado: string | null;
  bloqueado: boolean;
  hoje: string;
  onBuscarCodigo: (numeroCrv: string) => void;
  onMunicipio: (cidade: string, uf: string) => Promise<{ ok: boolean; codigo?: string; nome?: string; error?: string }>;
  onSaida: (d: DadosSaida) => void;
}) {
  const [d, setD] = useState({ ...base, codigoSegurancaCrv: codigoAtual || base.codigoSegurancaCrv });
  const [mun, setMun] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [ultimoBuscado, setUltimoBuscado] = useState<string | null>(null);
  if (codigoBuscado && codigoBuscado !== ultimoBuscado) {
    setUltimoBuscado(codigoBuscado);
    setD({ ...d, codigoSegurancaCrv: codigoBuscado });
  }
  const campo = (k: keyof typeof d) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value }),
  });
  async function buscarMunicipio() {
    setBuscando(true);
    const r = await onMunicipio(d.cidade, d.uf);
    setBuscando(false);
    if (r.ok && r.codigo) {
      setD({ ...d, codigoMunicipio: r.codigo });
      setMun(`${r.nome} — código Renave ${r.codigo}`);
    } else setMun(r.error ?? "Não encontrado.");
  }
  return (
    <Etapa n={5} titulo="Saída (venda)" feito={false}>
      <p className="text-xs text-slate-600">
        O CRV pedido aqui é o ATUAL, emitido em nome da loja quando o Detran confirmou a entrada — não o da compra.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Nº do CRV atual">
          <Input {...campo("numeroCrv")} inputMode="numeric" />
        </Field>
        <Field label="Código de segurança do CRV atual">
          <Input {...campo("codigoSegurancaCrv")} inputMode="numeric" />
        </Field>
        <div className="flex items-end">
          <Button type="button" variant="secondary" disabled={bloqueado} onClick={() => onBuscarCodigo(d.numeroCrv)} data-guia="renave.codigo">
            Buscar código no Renave
          </Button>
        </div>
        <Field label="Data da venda">
          <Input type="date" {...campo("dataVenda")} max={hoje} />
        </Field>
        <Field label="Valor da venda (R$)">
          <Input {...campo("valorVenda")} inputMode="decimal" />
        </Field>
        <Field label="CPF/CNPJ do comprador">
          <Input {...campo("compradorDocumento")} inputMode="numeric" />
        </Field>
        <Field label="Nome do comprador">
          <Input {...campo("compradorNome")} />
        </Field>
        <Field label="E-mail do comprador">
          <Input type="email" {...campo("compradorEmail")} />
        </Field>
        <Field label="CEP">
          <Input {...campo("cep")} inputMode="numeric" />
        </Field>
        <Field label="Logradouro">
          <Input {...campo("logradouro")} />
        </Field>
        <Field label="Número">
          <Input {...campo("numero")} />
        </Field>
        <Field label="Complemento">
          <Input {...campo("complemento")} />
        </Field>
        <Field label="Bairro">
          <Input {...campo("bairro")} />
        </Field>
        <Field label="Cidade / UF">
          <div className="flex gap-2">
            <Input {...campo("cidade")} />
            <Input {...campo("uf")} className="w-16" maxLength={2} />
          </div>
        </Field>
        <div className="flex items-end gap-2">
          <Button type="button" variant="secondary" disabled={bloqueado || buscando} onClick={buscarMunicipio}>
            {buscando ? "Buscando…" : "Achar município no Renave"}
          </Button>
        </div>
        <Field label="Código do município (Renave)">
          <Input {...campo("codigoMunicipio")} inputMode="numeric" />
        </Field>
        <Field label="E-mail da loja">
          <Input type="email" {...campo("emailEstabelecimento")} />
        </Field>
        <Field label="CPF do operador responsável">
          <Input {...campo("cpfOperador")} inputMode="numeric" />
        </Field>
      </div>
      {mun ? <p className="mt-1 text-xs text-slate-600">{mun}</p> : null}
      <div className="mt-3">
        <Button type="button" disabled={bloqueado} onClick={() => onSaida(d)} data-guia="renave.saida">
          Registrar saída no Renave
        </Button>
      </div>
    </Etapa>
  );
}

function Cancelamentos({
  finalizado,
  cpf,
  hoje,
  bloqueado,
  onCancelarEntrada,
  onCancelarSaida,
}: {
  finalizado: boolean;
  cpf: string;
  hoje: string;
  bloqueado: boolean;
  onCancelarEntrada: (d: { data: string; cpfOperador: string }) => void;
  onCancelarSaida: (d: { data: string; cpfOperador: string }) => void;
}) {
  const [data, setData] = useState(hoje);
  const [cpfOp, setCpfOp] = useState(cpf);
  return (
    <details className="rounded-lg border border-rose-100 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-rose-700">Cancelamentos</summary>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Data do cancelamento">
          <Input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
        </Field>
        <Field label="CPF do operador">
          <Input value={cpfOp} onChange={(e) => setCpfOp(e.target.value)} inputMode="numeric" />
        </Field>
        <div className="flex items-end gap-2">
          {finalizado ? (
            <Button type="button" variant="secondary" disabled={bloqueado} onClick={() => onCancelarSaida({ data, cpfOperador: cpfOp })} data-guia="renave.cancelar">
              Cancelar saída
            </Button>
          ) : (
            <Button type="button" variant="secondary" disabled={bloqueado} onClick={() => onCancelarEntrada({ data, cpfOperador: cpfOp })} data-guia="renave.cancelar">
              Cancelar entrada
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}
