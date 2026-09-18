"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { DETRAN_STATUS_VALUES, detranStatusLabel } from "@/lib/renave";
import { salvarPassoRenaveAction } from "../actions";

export type AssistenteDados = {
  renaveAderido: boolean;
  renaveAderidoEm: string | null;
  renaveAdesaoSolicitadaEm: string | null;
  renaveAdesaoProtocolo: string | null;
  renaveAdesaoSei: string | null;
  renaveIntegradora: string | null;
  renaveIntegradoraStatus: string | null;
  renaveCnae: string | null;
  eCnpjValidUntil: string | null;
  detranRenaveStatus: string | null;
  detranRenaveCheckedAt: string | null;
  detranProtocolo: string | null;
  renaveObrigatorioEm: string | null;
  renaveImplantacao: boolean;
  renaveObservacoes: string | null;
  /** UF da loja, para o texto do passo do DETRAN. */
  uf: string | null;
  /** Veículos em estoque com dados faltando (o passo final não tem campo). */
  veiculosComPendencia: number;
  veiculosEmEstoque: number;
  /** Datas do cronograma, em dd/mm/aaaa, para os textos. */
  producaoAssistida: string;
  hoje: string;
};

const dia = (v: string | null) => (v ? v.slice(0, 10) : "");

/** dd/mm/aaaa a partir de yyyy-mm-dd, sem passar pelo fuso. */
function br(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/**
 * Assistente de preenchimento do Renave.
 *
 * O roteiro (passo a passo) diz o que fazer FORA do sistema; este assistente
 * cuida do que é para preencher DENTRO dele, na ordem, com o porquê de cada
 * campo ao lado e salvando passo a passo — quem tem só metade dos dados em mãos
 * grava o que tem e volta depois, sem apagar o resto.
 */
export default function Assistente({ dados }: { dados: AssistenteDados }) {
  const router = useRouter();
  const [salvando, start] = useTransition();
  const [passoSalvo, setPassoSalvo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoModelo, setConfirmandoModelo] = useState(false);

  // Estado local de cada campo (o servidor é a fonte da verdade no recarregar).
  const [v, setV] = useState({
    renaveAdesaoSolicitadaEm: dia(dados.renaveAdesaoSolicitadaEm),
    renaveAdesaoProtocolo: dados.renaveAdesaoProtocolo ?? "",
    renaveAdesaoSei: dados.renaveAdesaoSei ?? "",
    renaveAderido: String(dados.renaveAderido),
    renaveAderidoEm: dia(dados.renaveAderidoEm),
    renaveCnae: dados.renaveCnae ?? "",
    eCnpjValidUntil: dia(dados.eCnpjValidUntil),
    renaveIntegradora: dados.renaveIntegradora ?? "",
    renaveIntegradoraStatus: dados.renaveIntegradoraStatus ?? "",
    detranRenaveStatus: dados.detranRenaveStatus ?? "",
    detranRenaveCheckedAt: dia(dados.detranRenaveCheckedAt),
    detranProtocolo: dados.detranProtocolo ?? "",
    renaveObrigatorioEm: dia(dados.renaveObrigatorioEm),
    renaveImplantacao: String(dados.renaveImplantacao),
    renaveObservacoes: dados.renaveObservacoes ?? "",
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));

  function salvar(passo: string, campos: (keyof typeof v)[]) {
    setErro(null);
    setPassoSalvo(null);
    // Salvou: a pergunta do "refazer o texto" não tem mais o que confirmar e
    // não pode ficar pendurada na tela como se ainda esperasse resposta.
    setConfirmandoModelo(false);
    start(async () => {
      const payload: Record<string, string> = {};
      for (const c of campos) payload[c] = v[c];
      const r = await salvarPassoRenaveAction(payload);
      if (!r.ok) {
        setErro(r.error || "Não foi possível salvar.");
        return;
      }
      setPassoSalvo(passo);
      router.refresh();
    });
  }

  /**
   * Modelo das anotações montado com o que JÁ está preenchido — nada inventado:
   * se o número da solicitação não foi informado, ele não aparece no texto.
   */
  function modeloDeAnotacoes(): string {
    const linhas: string[] = [];
    if (v.renaveAdesaoSolicitadaEm) {
      const partes = [`${br(v.renaveAdesaoSolicitadaEm)} — Adesão solicitada no Credencia (SERPRO)`];
      if (v.renaveAdesaoProtocolo) partes.push(`solicitação nº ${v.renaveAdesaoProtocolo}`);
      if (v.renaveAdesaoSei) partes.push(`processo SEI ${v.renaveAdesaoSei}`);
      linhas.push(
        partes.join(", ") +
          `. Prazo de análise de até 30 dias (art. 10), prorrogáveis uma vez; pendência aberta congela a contagem.`,
      );
    }
    if (v.renaveIntegradora) {
      linhas.push(
        `Integradora: ${v.renaveIntegradora}` +
          (v.renaveIntegradoraStatus === "CONTRATADA" ? " — contratada." : " — em avaliação, sem contrato assinado.") +
          " Confirmar: preço por registro, se tem API e como trata a consignação.",
      );
    }
    if (v.detranRenaveStatus) {
      linhas.push(
        `DETRAN${dados.uf ? ` do ${dados.uf}` : ""}: ${detranStatusLabel[v.detranRenaveStatus as never] ?? v.detranRenaveStatus}` +
          (v.detranRenaveCheckedAt ? ` (conferido em ${br(v.detranRenaveCheckedAt)})` : "") +
          (v.detranProtocolo ? ` · consulta protocolada sob nº ${v.detranProtocolo}` : "") +
          ".",
      );
    }
    // A data configurada NÃO entra no texto: ela muda (e deve mudar) conforme a
    // integradora confirma, e a anotação viraria mentira no dia seguinte. A data
    // em vigor está viva no passo 5 e no cabeçalho das telas.
    linhas.push(
      `${dados.hoje} — Cronograma da implantação: produção assistida a partir de ${dados.producaoAssistida} e ` +
        `operações adequadas no início de novembro. Gravame só é apontado em veículo já registrado no ` +
        `estoque do Renave, antes da liberação do financiamento.`,
    );
    return linhas.join("\n");
  }

  const feito = (...campos: (keyof typeof v)[]) => campos.every((c) => v[c].trim() !== "");
  const passos: { id: string; ok: boolean }[] = [
    { id: "adesao", ok: feito("renaveAdesaoSolicitadaEm") },
    { id: "documentos", ok: feito("renaveCnae", "eCnpjValidUntil") },
    { id: "integradora", ok: feito("renaveIntegradora", "renaveIntegradoraStatus") },
    { id: "detran", ok: feito("detranRenaveStatus", "detranRenaveCheckedAt") },
    { id: "datas", ok: feito("renaveObrigatorioEm") },
    { id: "anotacoes", ok: feito("renaveObservacoes") },
  ];
  const prontos = passos.filter((p) => p.ok).length;

  const Status = ({ ok }: { ok: boolean }) =>
    ok ? <Badge tone="success">✓ Preenchido</Badge> : <Badge tone="warning">Falta preencher</Badge>;

  const BotaoSalvar = ({ passo, campos }: { passo: string; campos: (keyof typeof v)[] }) => (
    <div className="mt-3 flex items-center gap-3">
      <Button type="button" onClick={() => salvar(passo, campos)} disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar este passo"}
      </Button>
      {passoSalvo === passo ? <span className="text-sm font-medium text-emerald-700">✓ Salvo</span> : null}
    </div>
  );

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Passos preenchidos</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{prontos} de {passos.length}</p>
          </div>
          <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${(prontos / passos.length) * 100}%` }}
            />
          </div>
        </div>
      </Card>

      {erro ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>
      ) : null}

      <Card className="mb-4">
        <CardHeader
          title="1. Adesão no Credencia (SERPRO)"
          description="Onde a loja pediu autorização para operar o Renave"
          action={<Status ok={passos[0].ok} />}
        />
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600">
            Enquanto o pedido está em análise, guarde a data e os números: é o que faz o sistema mostrar
            “em análise há N dias” em vez de tratar a loja como quem não fez nada. O órgão tem até 30
            dias (art. 10) e{" "}
            <a
              href="https://credencia.serpro.gov.br/credencia-web/#/solicitacao/consultar"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-700 hover:underline"
            >
              Consultar solicitação
            </a>{" "}
            mostra a situação atual.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Solicitação protocolada em">
              <Input type="date" value={v.renaveAdesaoSolicitadaEm} onChange={set("renaveAdesaoSolicitadaEm")} />
            </Field>
            <Field label="Nº da solicitação (Credencia)">
              <Input
                value={v.renaveAdesaoProtocolo}
                onChange={set("renaveAdesaoProtocolo")}
                placeholder="Ex.: 12748/2026"
              />
            </Field>
            <Field label="Processo SEI (Ministério dos Transportes)">
              <Input
                value={v.renaveAdesaoSei}
                onChange={set("renaveAdesaoSei")}
                placeholder="Ex.: 50000.041207/2026-50"
              />
            </Field>
            <Field label="Situação da adesão">
              <Select value={v.renaveAderido} onChange={set("renaveAderido")}>
                <option value="false">Ainda não aderiu (em análise)</option>
                <option value="true">Adesão concluída</option>
              </Select>
              <span className="mt-1 block text-xs text-slate-500">
                Troque para “concluída” só quando sair o deferimento.
              </span>
            </Field>
            {v.renaveAderido === "true" ? (
              <Field label="Data da adesão">
                <Input type="date" value={v.renaveAderidoEm} onChange={set("renaveAderidoEm")} />
              </Field>
            ) : null}
          </div>
          <BotaoSalvar
            passo="adesao"
            campos={["renaveAdesaoSolicitadaEm", "renaveAdesaoProtocolo", "renaveAdesaoSei", "renaveAderido", "renaveAderidoEm"]}
          />
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="2. Documentos da loja"
          description="O que trava a adesão se estiver errado"
          action={<Status ok={passos[1].ok} />}
        />
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600">
            O CNAE principal tem de ser compatível com compra e venda de veículos (art. 7º, I) — se não
            for, é conversa com o contador <strong>agora</strong>, porque a alteração leva dias. E
            certificado e-CNPJ vencido <strong>bloqueia</strong> o acesso ao Renave (art. 30).
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="CNAE principal">
              <Input value={v.renaveCnae} onChange={set("renaveCnae")} placeholder="Ex.: 45.11-1-04" />
            </Field>
            <Field label="Validade do certificado e-CNPJ">
              <Input type="date" value={v.eCnpjValidUntil} onChange={set("eCnpjValidUntil")} />
            </Field>
          </div>
          <BotaoSalvar passo="documentos" campos={["renaveCnae", "eCnpjValidUntil"]} />
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="3. Integradora"
          description="Quem transmite os registros ao Renave"
          action={<Status ok={passos[2].ok} />}
        />
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600">
            A loja precisa de uma integradora autorizada (art. 5º, III) — este sistema não faz e não pode
            fazer esse papel. Enquanto a situação for “em avaliação”, o roteiro mantém a etapa como
            pendente.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Integradora">
              <Input
                value={v.renaveIntegradora}
                onChange={set("renaveIntegradora")}
                placeholder="Nome da integradora autorizada"
              />
            </Field>
            <Field label="Situação da integradora">
              <Select value={v.renaveIntegradoraStatus} onChange={set("renaveIntegradoraStatus")}>
                <option value="">— não definida —</option>
                <option value="AVALIACAO">Em avaliação (ainda sem contrato)</option>
                <option value="CONTRATADA">Contratada</option>
              </Select>
            </Field>
          </div>
          <BotaoSalvar passo="integradora" campos={["renaveIntegradora", "renaveIntegradoraStatus"]} />
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title={`4. DETRAN${dados.uf ? ` do ${dados.uf}` : " do estado"}`}
          description="O Renave de usados só opera onde o estado aderiu"
          action={<Status ok={passos[3].ok} />}
        />
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600">
            Enquanto o estado não opera, o sistema cobra só o que está ao alcance da loja (chassi,
            RENAVAM, NF-e, CRV) e deixa de cobrar protocolo e identificação prévia — que não existem sem
            o Renave no ar. Confira no portal do Renave (gov.br); o mapa muda com frequência.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Situação no Renave de usados">
              <Select value={v.detranRenaveStatus} onChange={set("detranRenaveStatus")}>
                <option value="">— não conferida —</option>
                {DETRAN_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {detranStatusLabel[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Conferido em">
              <Input type="date" value={v.detranRenaveCheckedAt} onChange={set("detranRenaveCheckedAt")} />
            </Field>
            <Field label="Protocolo da consulta ao DETRAN">
              <Input
                value={v.detranProtocolo}
                onChange={set("detranProtocolo")}
                placeholder="Nº do protocolo / processo"
              />
              <span className="mt-1 block text-xs text-slate-500">
                A prova de que a loja perguntou a previsão e como escriturar até lá.
              </span>
            </Field>
          </div>
          <BotaoSalvar passo="detran" campos={["detranRenaveStatus", "detranRenaveCheckedAt", "detranProtocolo"]} />
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="5. Data da obrigatoriedade"
          description="É ela que governa todos os avisos do sistema"
          action={<Status ok={passos[4].ok} />}
        />
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600">
            A produção assistida começa em <strong>{dados.producaoAssistida}</strong> e as operações
            precisam estar adequadas no <strong>início de novembro</strong>. Confirme a data exata com a
            sua integradora e coloque aqui — é a partir dela que as telas avisam.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Obrigatoriedade a partir de">
              <Input type="date" value={v.renaveObrigatorioEm} onChange={set("renaveObrigatorioEm")} />
            </Field>
            <Field label="Avisos do Renave">
              <Select value={v.renaveImplantacao} onChange={set("renaveImplantacao")}>
                <option value="true">Ligados (avisam, não bloqueiam)</option>
                <option value="false">Desligados</option>
              </Select>
            </Field>
          </div>
          <BotaoSalvar passo="datas" campos={["renaveObrigatorioEm", "renaveImplantacao"]} />
        </div>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="6. Anotações da implantação"
          description="A linha do tempo da loja — vale como defesa numa fiscalização"
          action={<Status ok={passos[5].ok} />}
        />
        <div className="space-y-3 p-5">
          <p className="text-sm text-slate-600">
            O botão abaixo monta um texto com o que já está preenchido aqui — datas, números, cronograma.
            Nada é inventado: o que estiver em branco não aparece. Complete com o que a integradora
            respondeu e o que o DETRAN disse. O texto é uma <strong>foto do momento</strong>: mudou algum
            passo e quer atualizá-lo, refaça o texto e salve de novo.
          </p>
          <Field label="O que já foi apurado (aparece no passo a passo)">
            <Textarea
              rows={8}
              value={v.renaveObservacoes}
              onChange={set("renaveObservacoes")}
              placeholder="Datas, números, preços da integradora, respostas do DETRAN…"
            />
          </Field>
          {confirmandoModelo ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-700">
                Isto <strong>substitui</strong> o texto acima pelo modelo montado a partir dos campos
                preenchidos. O que você escreveu à mão se perde — copie antes, se quiser guardar.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setV((prev) => ({ ...prev, renaveObservacoes: modeloDeAnotacoes() }));
                    setConfirmandoModelo(false);
                  }}
                  className="h-8 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Refazer o texto
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoModelo(false)}
                  className="h-8 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-white"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                // Texto já escrito é histórico da loja: refazer é substituir, e
                // isso se pergunta antes.
                if (v.renaveObservacoes.trim()) {
                  setConfirmandoModelo(true);
                  return;
                }
                setV((prev) => ({ ...prev, renaveObservacoes: modeloDeAnotacoes() }));
              }}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              ✨ {v.renaveObservacoes.trim() ? "Refazer" : "Montar"} o texto com o que já está preenchido
            </button>
          )}
          <BotaoSalvar passo="anotacoes" campos={["renaveObservacoes"]} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="7. Dados dos veículos"
          description="O que falta carro a carro para escriturar"
          action={
            dados.veiculosComPendencia === 0 && dados.veiculosEmEstoque > 0 ? (
              <Badge tone="success">✓ Em dia</Badge>
            ) : (
              <Badge tone="warning">{dados.veiculosComPendencia} veículo(s)</Badge>
            )
          }
        />
        <div className="space-y-3 p-5 text-sm text-slate-600">
          <p>
            Cada carro em estoque precisa de <strong>chassi</strong>, <strong>RENAVAM</strong>,{" "}
            <strong>título do negócio da entrada</strong>, <strong>chave da NF-e de entrada</strong>,{" "}
            <strong>assinatura do vendedor</strong> (compra de usado) ou{" "}
            <strong>contrato eletrônico</strong> (consignado), e <strong>CRV + código de segurança</strong>{" "}
            para a saída. Tudo isso já dá para preencher hoje, sem depender do Renave estar no ar.
          </p>
          <p>
            Preencha na <strong>ficha do veículo → aba Renave</strong>. Para achar quem está incompleto,
            use o filtro <strong>“Renave: dados faltando”</strong> no estoque.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="/estoque?doc=RENAVE_PENDENTE"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Ver os veículos a acertar
            </a>
            <a
              href="/estoque/renave"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              📒 Livro de entradas e saídas
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
