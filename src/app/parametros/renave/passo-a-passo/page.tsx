import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import {
  RENAVE_CRONOGRAMA_FONTE,
  RENAVE_NORMA,
  RENAVE_PRAZO_PADRAO,
  RENAVE_PRODUCAO_ASSISTIDA,
  avisoDetranParado,
  detranOperando,
  detranStatusLabel,
  detranStatusOf,
  pendenciasCobraveis,
  prazoTexto,
} from "@/lib/renave";
import { acessoDiretoRenave } from "@/lib/renave-ws";

export const dynamic = "force-dynamic";

/**
 * Roteiro de adequação ao Renave, para a equipe consultar e imprimir.
 *
 * Não é um texto solto: cada etapa mostra a SITUAÇÃO REAL da loja naquilo que o
 * sistema consegue enxergar (adesão, acesso ao Renave, certificado, veículos
 * com dados faltando). O que depende de terceiros — contador, DETRAN, SERPRO —
 * fica marcado como conferência manual, sem fingir que o sistema sabe.
 */

type Situacao = "feito" | "pendente" | "manual" | "aguardando" | "analise";

function StatusBadge({ status }: { status: Situacao }) {
  if (status === "feito") return <Badge tone="success">✓ Feito</Badge>;
  if (status === "pendente") return <Badge tone="warning">Pendente</Badge>;
  if (status === "analise") return <Badge tone="info">Protocolada — em análise</Badge>;
  if (status === "aguardando") return <Badge tone="info">Aguardando o DETRAN</Badge>;
  return <Badge tone="default">Conferir fora do sistema</Badge>;
}

function Etapa({
  numero,
  titulo,
  status,
  prazo,
  children,
}: {
  numero: number;
  titulo: string;
  status: Situacao;
  prazo?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={`mt-4 ${status === "pendente" ? "border-amber-300" : ""}`}>
      <CardHeader
        title={`${numero}. ${titulo}`}
        description={prazo}
        action={<StatusBadge status={status} />}
      />
      <div className="space-y-3 p-5 text-sm text-slate-700">{children}</div>
    </Card>
  );
}

export default async function RenavePassoAPassoPage() {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) redirect("/");

  const company = await getCompany();
  const prazo = company.renaveObrigatorioEm ?? RENAVE_PRAZO_PADRAO;
  const agora = new Date();
  const diasParaPrazo = Math.ceil((prazo.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));

  const vehicles = await prisma.vehicle.findMany({
    where: { intermediation: false, status: { not: "VENDIDO" } },
    select: {
      status: true,
      consigned: true,
      intermediation: true,
      chassi: true,
      renavam: true,
      renaveSituacao: true,
      renaveEntradaTitulo: true,
      renaveEntradaProtocolo: true,
      renaveEntradaEm: true,
      entryNfeKey: true,
      renavePreviaTipo: true,
      renaveAssinaturaTipo: true,
      crvNumber: true,
      crvSecurityCode: true,
      consignContractId: true,
      consignContractAt: true,
      renaveSaidaTitulo: true,
      renaveSaidaProtocolo: true,
      exitNfeKey: true,
    },
  });
  const comPendencia = vehicles.filter(
    (v) => pendenciasCobraveis(v, detranOperando(company.detranRenaveStatus)).length > 0,
  ).length;

  const certOk = company.eCnpjValidUntil ? company.eCnpjValidUntil.getTime() > agora.getTime() : false;
  // Estado que ainda não opera: as etapas que dependem dele saem da cobrança —
  // aderir não está ao alcance da loja agora.
  const detran = detranStatusOf(company.detranRenaveStatus);
  const operando = detranOperando(company.detranRenaveStatus);
  const dependeDoEstado = (concluida: boolean): Situacao =>
    concluida ? "feito" : operando ? "pendente" : "aguardando";

  const etapa1: Situacao = certOk && company.renaveCnae ? "feito" : "pendente";
  // Acesso ao Renave: o caminho da loja é o DIRETO (contrato SERPRO +
  // certificado), que dá para deixar pronto antes de o estado aderir. Quem usa
  // integradora no lugar também conclui a etapa.
  const acesso = acessoDiretoRenave(company);
  const integradoraContratada =
    Boolean(company.renaveIntegradora) && company.renaveIntegradoraStatus === "CONTRATADA";
  const etapa2: Situacao = acesso.pronto || integradoraContratada ? "feito" : "pendente";
  // Adesão protocolada e ainda em análise não é pendência da loja: o pedido já
  // saiu, o que resta é acompanhar (e correr atrás se aparecer pendência).
  const diasEmAnalise = company.renaveAdesaoSolicitadaEm
    ? Math.floor((agora.getTime() - company.renaveAdesaoSolicitadaEm.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const etapa3: Situacao = company.renaveAderido
    ? "feito"
    : diasEmAnalise != null
      ? "analise"
      : dependeDoEstado(false);
  const etapa5: Situacao =
    company.renaveAderido && (acesso.pronto || integradoraContratada) && certOk ? "feito" : "pendente";
  const etapa6: Situacao = vehicles.length > 0 && comPendencia === 0 ? "feito" : "pendente";

  const feitas = [etapa1, etapa2, etapa3, etapa5, etapa6].filter((e) => e === "feito").length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Renave — passo a passo da adequação"
        description={`O que fazer, em que ordem, até ${prazoTexto(prazo)} (${RENAVE_NORMA})`}
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <LinkButton href="/parametros/renave/assistente">🪄 Preencher com o assistente</LinkButton>
            <PrintButton mode="document" title="Renave — passo a passo da adequação" />
            <LinkButton href="/parametros/renave" variant="secondary">
              ← Renave
            </LinkButton>
          </div>
        }
      />

      <Card className={diasParaPrazo <= 30 ? "border-amber-300" : ""}>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Prazo</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{prazoTexto(prazo)}</p>
            <p className="text-xs text-slate-500">
              {diasParaPrazo >= 0
                ? `faltam ${diasParaPrazo} dia(s)`
                : `vencido há ${Math.abs(diasParaPrazo)} dia(s)`}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Etapas concluídas</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{feitas} de 5</p>
            <p className="text-xs text-slate-500">as que o sistema consegue conferir</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Veículos a acertar</p>
            <p className={`mt-1 text-lg font-semibold ${comPendencia > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {comPendencia}
            </p>
            <p className="text-xs text-slate-500">em estoque, com dados faltando</p>
          </div>
        </div>
      </Card>

      {company.renaveObservacoes ? (
        <Card className="mt-4">
          <CardHeader
            title="Anotações da loja"
            description="O que já foi apurado com o SERPRO e com o DETRAN"
          />
          <p className="whitespace-pre-line p-5 text-sm text-slate-700">{company.renaveObservacoes}</p>
        </Card>
      ) : null}

      {detran && detran !== "ADERIDO" ? (
        <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-900">
            🛑 O Renave de usados ainda não opera {company.uf ? `no ${company.uf}` : "no seu estado"} —{" "}
            {detranStatusLabel[detran].toLowerCase()}
          </p>
          <p className="mt-0.5 text-xs text-rose-800">{avisoDetranParado(company.uf, detran)}</p>
          <p className="mt-1.5 text-xs font-medium text-rose-900">O que fazer enquanto isso:</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-xs text-rose-800">
            <li>
              <strong>Não contratar integradora</strong> nem comprar crédito para operar aqui — o serviço não
              existe no estado ainda. O acesso direto pelo SERPRO fica pronto e passa a funcionar quando o
              DETRAN aderir.
            </li>
            <li>
              <strong>Protocolar consulta no DETRAN</strong>: previsão de adesão e como escriturar até lá
              (livro de modelo aprovado, art. 4º, V).
              {company.detranProtocolo ? (
                <> Protocolo registrado: <strong>{company.detranProtocolo}</strong>.</>
              ) : (
                <> Nenhum protocolo registrado ainda em Parâmetros → Renave.</>
              )}
            </li>
            <li>
              <strong>Guardar as provas</strong>: print do mapa oficial, protocolo do DETRAN e os chamados e
              respostas do SERPRO. É a defesa da loja se houver fiscalização.
            </li>
            <li>
              <strong>Seguir com as etapas 1, 2, 4 e 6</strong> — certificado, CNAE, acesso ao Renave, NF-e e
              os dados dos veículos não dependem do estado e adiantam todo o resto.
            </li>
          </ul>
        </div>
      ) : null}

      {/* Cronograma em duas etapas: é o que os bancos estão comunicando às
          lojas, e muda o que fazer agora — a produção assistida é a janela para
          ensaiar pelo próprio sistema antes de valer para valer. */}
      <Card className="mt-4">
        <CardHeader
          title="Cronograma da implantação"
          description={RENAVE_CRONOGRAMA_FONTE}
        />
        <ul className="space-y-2 p-5 text-sm text-slate-700">
          <li>
            <strong>A partir de {prazoTexto(RENAVE_PRODUCAO_ASSISTIDA)} — produção assistida.</strong>{" "}
            Dá para registrar entrada, saída, transferência e consignação pelo próprio sistema (acesso
            direto ao Renave), sem a cobrança valendo. É a janela para ensaiar: registre <strong>um</strong> carro de cada
            tipo (comprado, consignado) e veja onde trava.
          </li>
          <li>
            <strong>Início de novembro — operações já adequadas.</strong> A partir daí não se opera
            veículo fora do Renave. Confirme a data exata com o DETRAN do estado e informe-a em{" "}
            <Link href="/parametros/renave" className="font-medium text-blue-700 hover:underline">
              Parâmetros → Renave
            </Link>
            : é ela que o sistema usa nos avisos (hoje: {prazoTexto(prazo)}).
          </li>
          <li>
            <strong>Financiamento:</strong> a instituição financeira só aponta o gravame de veículo já
            registrado no estoque da loja no Renave, e o apontamento vem <strong>antes</strong> da
            liberação. Na prática, é a primeira exigência que chega ao balcão — venda financiada de
            carro sem entrada registrada não fecha.
          </li>
          <li>
            <strong>Consignação:</strong> também entra no Renave, por contrato eletrônico assinado
            digitalmente pelas duas partes (art. 20, §§ 1º a 3º).
          </li>
        </ul>
      </Card>

      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="font-semibold">Nada está bloqueado no sistema</p>
        <p className="text-xs">
          Comprar, vender, consignar e intermediar seguem funcionando como sempre. Este roteiro é para a loja
          chegar preparada na data em que a escrituração eletrônica passa a ser exigida.
        </p>
      </div>

      <Etapa numero={1} titulo="Conferir certificado, CNAE e objeto social" status={etapa1} prazo="1 dia — comece por aqui">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong>Certificado e-CNPJ (ICP-Brasil):</strong> tem de estar válido e continuar válido depois do
            prazo. Certificado vencido bloqueia o acesso ao Renave automaticamente (art. 30).
            {company.eCnpjValidUntil ? (
              <span className={certOk ? " text-emerald-700" : " text-rose-700"}>
                {" "}
                Cadastrado no sistema: válido até {formatDate(company.eCnpjValidUntil)}
                {certOk ? "." : " — vencido."}
              </span>
            ) : (
              <span className="text-amber-700"> Validade ainda não informada em Parâmetros → Renave.</span>
            )}
          </li>
          <li>
            <strong>CNAE principal:</strong> precisa ser compatível com compra e venda de veículos automotores
            (art. 7º, I). Se a atividade principal for outra, fale com o contador <strong>agora</strong> —
            alterar CNAE leva dias e a adesão trava nisso.
            {company.renaveCnae ? (
              <span className="text-emerald-700"> Informado: {company.renaveCnae}.</span>
            ) : (
              <span className="text-amber-700"> Ainda não informado no sistema.</span>
            )}
          </li>
          <li>
            <strong>Objeto social:</strong> o contrato social precisa refletir a mesma atividade. Mesma conversa
            com o contador.
          </li>
        </ul>
      </Etapa>

      <Etapa numero={2} titulo="Acesso direto ao Renave (SERPRO)" status={etapa2} prazo="1 a 3 dias">
        <p>
          A loja transmite os registros <strong>direto ao Renave</strong>, sem integradora: o contrato é da
          própria loja com o SERPRO, e a autenticação é o <strong>certificado e-CNPJ</strong> da loja — o
          sistema só leva os dados, com o certificado dela. O SERPRO confirmou que o contrato da loja permite
          esse acesso direto (Renave-WS). O custo é o do SERPRO, por registro.
        </p>
        <p className="font-medium text-slate-900">O que precisa estar pronto:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>contrato com o SERPRO ativo (é ele que libera o acesso ao Renave-WS);</li>
          <li>
            certificado e-CNPJ A1 (arquivo .pfx) instalado nas variáveis de ambiente da hospedagem — nunca
            enviado por e-mail, chat ou tela;
          </li>
          <li>
            em{" "}
            <Link href="/parametros/renave" className="font-medium text-blue-700 hover:underline">
              Parâmetros → Renave
            </Link>{" "}
            › <strong>Integração direta com o SERPRO</strong>: ambiente <strong>Produção</strong>, e-mail do
            vendedor e CPF do operador, e o botão <strong>Testar conexão</strong>.
          </li>
        </ul>
        {acesso.pronto ? (
          <p className="text-emerald-700">Acesso direto configurado em produção.</p>
        ) : (
          <p className="text-amber-700">Falta: {acesso.falta.join(", ")}.</p>
        )}
        <p className="text-xs text-slate-500">
          Integradora é opcional — só para quem preferir terceirizar o registro. Se for o caso, informe-a em
          Parâmetros → Renave.
          {company.renaveIntegradora
            ? ` Informada: ${company.renaveIntegradora}${company.renaveIntegradoraStatus === "CONTRATADA" ? " (contratada)" : " (em avaliação)"}.`
            : ""}
        </p>
      </Etapa>

      <Etapa
        numero={3}
        titulo="Aderir ao Renave no sistema Credencia"
        status={etapa3}
        prazo="1 dia para protocolar + até 30 dias de análise"
      >
        <ul className="list-disc space-y-1.5 pl-5">
          <li>A adesão é solicitada no <strong>Credencia (SERPRO)</strong>, com o e-CNPJ, pela própria loja (art. 8º).</li>
          <li>
            O órgão tem <strong>até 30 dias</strong> para analisar, prorrogáveis uma vez. Por isso esta etapa não
            pode esperar: protocole com folga.
          </li>
          <li>
            Havendo pendência, você é avisado eletronicamente e o prazo <strong>para de contar</strong> até
            resolver. Não deixe pendência dormindo: passando de 30 dias, o pedido é indeferido e recomeça do zero.
          </li>
          <li>Acompanhe pelo próprio Credencia e pelo SEI do Ministério dos Transportes (art. 10, § 4º).</li>
        </ul>
        <p>
          Acompanhar em{" "}
          <a
            href="https://credencia.serpro.gov.br/credencia-web/#/solicitacao/consultar"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-700 hover:underline"
          >
            credencia.serpro.gov.br → Consultar solicitação
          </a>
          .
        </p>
        {company.renaveAderido ? (
          <p className="text-emerald-700">
            Adesão marcada como concluída
            {company.renaveAderidoEm ? ` em ${formatDate(company.renaveAderidoEm)}` : ""}.
          </p>
        ) : diasEmAnalise != null ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <p className="font-semibold">
              Solicitação protocolada em {formatDate(company.renaveAdesaoSolicitadaEm!)} — em análise há{" "}
              {diasEmAnalise} dia(s)
              {company.renaveAdesaoProtocolo ? ` · nº ${company.renaveAdesaoProtocolo}` : ""}
              {company.renaveAdesaoSei ? ` · processo SEI ${company.renaveAdesaoSei}` : ""}.
            </p>
            <p className="mt-0.5">
              {diasEmAnalise > 30
                ? "Passou dos 30 dias: entre no Credencia e veja se há pendência aberta — com pendência o prazo fica parado, e pendência não resolvida em 30 dias leva ao indeferimento (o pedido recomeça do zero)."
                : "Confira o Credencia a cada poucos dias: se aparecer pendência, o prazo para de contar até você resolver."}
            </p>
            <p className="mt-0.5">
              Enquanto espera, siga com as etapas 1, 2, 4 e 6 — a adesão deferida não adianta nada sem o
              acesso ao Renave configurado e sem os dados dos veículos em ordem.
            </p>
            <p className="mt-0.5">
              Quando sair o deferimento, marque <strong>Adesão concluída</strong> em Parâmetros → Renave.
            </p>
          </div>
        ) : null}
      </Etapa>

      <Etapa numero={4} titulo="Acertar a NF-e com o contador" status="manual" prazo="em paralelo com a etapa 3">
        <p>Este costuma ser o gargalo real. Leve esta lista ao contador e pergunte o que já é emitido hoje:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Compra de usado:</strong> NF-e de entrada + ATPV-e assinada (art. 14).</li>
          <li><strong>Venda:</strong> NF-e de saída, emitida de forma casada com o registro no Renave (art. 18, VII).</li>
          <li><strong>Os dados têm de bater</strong> entre nota e registro — valor, CPF/CNPJ, data (art. 5º, VI).</li>
          <li><strong>Consignação cancelada:</strong> NF-e de devolução de mercadoria em consignação (art. 20, § 10).</li>
        </ul>
      </Etapa>

      <Etapa numero={5} titulo="Configurar no sistema" status={etapa5} prazo="10 minutos">
        <p>
          Em{" "}
          <Link href="/parametros/renave" className="font-medium text-blue-700 hover:underline">
            Parâmetros → Renave
          </Link>
          , preencha:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>situação da adesão e a data;</li>
          <li>
            acesso direto ao Renave: ambiente Produção, e-mail do vendedor e CPF do operador — e{" "}
            <strong>Testar conexão</strong>;
          </li>
          <li>CNAE principal;</li>
          <li>validade do e-CNPJ (o sistema avisa quando estiver perto de vencer);</li>
          <li>data da obrigatoriedade (já vem preenchida; ajuste se o órgão prorrogar);</li>
          <li>deixe em <strong>&quot;Em implantação&quot;</strong> até tudo estar rodando.</li>
        </ol>
      </Etapa>

      <Etapa numero={6} titulo="Colocar o estoque em dia" status={etapa6} prazo="o trabalho maior — reserve setembro">
        <p>
          Abra{" "}
          <Link href="/estoque/renave" className="font-medium text-blue-700 hover:underline">
            Renave → livro de entradas e saídas
          </Link>{" "}
          e filtre <strong>&quot;Só os que têm dados faltando&quot;</strong>. Ali está a lista, veículo por veículo.
          {comPendencia > 0 ? (
            <span className="text-amber-700"> Hoje são {comPendencia} veículo(s) em estoque a acertar.</span>
          ) : (
            <span className="text-emerald-700"> Hoje não há veículo em estoque com dados faltando.</span>
          )}
        </p>
        <p>
          Em cada carro: ficha do veículo → card <strong>&quot;Renave — escrituração eletrônica&quot;</strong> →{" "}
          <strong>Preencher dados do Renave</strong>.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="border-b border-slate-200 px-3 py-2">Campo</th>
                <th className="border-b border-slate-200 px-3 py-2">De onde tirar</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-b border-slate-100 px-3 py-2 font-medium">Título do negócio jurídico</td>
                <td className="border-b border-slate-100 px-3 py-2">Compra, Consignação, Veículo próprio, Retomado…</td>
              </tr>
              <tr>
                <td className="border-b border-slate-100 px-3 py-2 font-medium">Chave da NF-e de entrada</td>
                <td className="border-b border-slate-100 px-3 py-2">
                  Copie do DANFE — o número e a série o sistema tira sozinho
                </td>
              </tr>
              <tr>
                <td className="border-b border-slate-100 px-3 py-2 font-medium">Identificação prévia de entrada</td>
                <td className="border-b border-slate-100 px-3 py-2">Número e data (ou marque Vistoria, se foi vistoria)</td>
              </tr>
              <tr>
                <td className="border-b border-slate-100 px-3 py-2 font-medium">Assinatura do vendedor</td>
                <td className="border-b border-slate-100 px-3 py-2">
                  Reconhecimento de firma, eletrônica avançada ou qualificada + data
                </td>
              </tr>
              <tr>
                <td className="border-b border-slate-100 px-3 py-2 font-medium">CRV: número e código de segurança</td>
                <td className="border-b border-slate-100 px-3 py-2">Do documento do veículo</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">Protocolo de entrada</td>
                <td className="px-3 py-2">Preenchido sozinho quando a entrada é registrada pelo sistema</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <strong>Ordem sugerida:</strong> comece pelos carros mais perto de vender (anunciados, com pré-venda).
          Um carro sem entrada registrada não pode ter a saída registrada depois.
          <br />
          <strong>Antes de registrar:</strong> confira os débitos pela placa na própria ficha. Carro com débito em
          aberto ou restrição impeditiva não aceita registro (art. 11, § 2º).
        </p>
      </Etapa>

      <Etapa numero={7} titulo="A rotina nova, do dia a dia" status="manual" prazo="treinar a equipe antes do prazo">
        <p className="font-medium text-slate-900">Ao comprar um carro</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Consulta de débitos pela placa — tem de estar limpo.</li>
          <li>Identificação prévia de entrada (ou vistoria).</li>
          <li>NF-e de entrada.</li>
          <li>ATPV-e assinada.</li>
          <li>
            Registro de entrada pelo próprio sistema: ficha do veículo → card Renave → registrar a entrada
            (o protocolo e o termo ficam guardados na ficha).
          </li>
        </ol>
        <p className="font-medium text-slate-900">Ao vender</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>NF-e de saída.</li>
          <li>ATPV-e assinada.</li>
          <li>Registro de saída pelo próprio sistema, no mesmo card — a ATPV-e sai de lá.</li>
          <li>O Renave avisa quando o novo CRV sair no nome do comprador (art. 18, § 4º).</li>
        </ol>
        <p className="font-medium text-slate-900">Consignação — o que muda</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Contrato <strong>eletrônico</strong>, registrado no Renave, assinado digitalmente pelos dois. O
            contrato impresso do sistema passa a ser registro interno.
          </li>
          <li>
            Anote na ficha o número e a data do contrato: o sistema passa a contar os <strong>30 dias</strong> que
            o consignante tem para assinar a ATPV-e (art. 20, § 7º). Vencido o prazo, a venda é cancelada e o
            carro volta ao dono.
          </li>
          <li>Vender ou anunciar consignado sem esse registro prévio passa a ser vedado (art. 20, § 1º).</li>
        </ul>
        <p className="font-medium text-slate-900">Financiamento de terceiros — decidir com o contador</p>
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          É a rotina que mais muda. Hoje o carro fica fora do estoque de propósito; pela resolução, intermediar a
          venda de veículo de terceiro exige registro prévio — como <strong>consignação</strong> ou como{" "}
          <strong>entrada em estoque</strong>. E se a loja for a beneficiária do financiamento, o gravame só é
          apontado com o carro no estoque Renave dela (art. 34). Leve isso ao contador e à financeira e defina
          qual caminho a loja vai adotar.
        </p>
      </Etapa>

      <Etapa numero={8} titulo="Checagem final" status="manual" prazo="uma semana antes do prazo">
        <ul className="space-y-1.5">
          <li>☐ Adesão deferida no Credencia</li>
          <li>☐ Acesso direto ao Renave (SERPRO) testado com um registro real</li>
          <li>☐ NF-e de entrada e de saída funcionando</li>
          <li>☐ Painel do Renave com zero veículos pendentes</li>
          <li>☐ Equipe treinada na rotina da etapa 7</li>
          <li>☐ Livro exportado (PDF/CSV) e guardado</li>
        </ul>
        <p className="text-xs text-slate-500">
          A falta de escrituração, o atraso, a fraude ou a recusa de exibir à autoridade é infração{" "}
          <strong>gravíssima</strong> (art. 25), aplicada pelo DETRAN do estado. A reincidência pode cancelar a
          adesão da loja ao Renave (art. 26).
        </p>
      </Etapa>

      <p className="mt-4 text-xs text-slate-400">
        Resumo preparado a partir do texto da {RENAVE_NORMA}, publicada no DOU de 30/06/2026. Não substitui a
        orientação do contador ou do advogado da loja, nem a consulta ao DETRAN sobre procedimentos locais.
      </p>
    </div>
  );
}
