import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";
import { isAdminRole } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import { RENAVE_NORMA, RENAVE_PRAZO_PADRAO, pendenciasRenave, prazoTexto } from "@/lib/renave";

export const dynamic = "force-dynamic";

/**
 * Roteiro de adequação ao Renave, para a equipe consultar e imprimir.
 *
 * Não é um texto solto: cada etapa mostra a SITUAÇÃO REAL da loja naquilo que o
 * sistema consegue enxergar (adesão, integradora, certificado, veículos com
 * dados faltando). O que depende de terceiros — contador, DETRAN, integradora —
 * fica marcado como conferência manual, sem fingir que o sistema sabe.
 */

type Situacao = "feito" | "pendente" | "manual";

function StatusBadge({ status }: { status: Situacao }) {
  if (status === "feito") return <Badge tone="success">✓ Feito</Badge>;
  if (status === "pendente") return <Badge tone="warning">Pendente</Badge>;
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
  const comPendencia = vehicles.filter((v) => pendenciasRenave(v).length > 0).length;

  const certOk = company.eCnpjValidUntil ? company.eCnpjValidUntil.getTime() > agora.getTime() : false;
  const etapa1: Situacao = certOk && company.renaveCnae ? "feito" : "pendente";
  const etapa2: Situacao = company.renaveIntegradora ? "feito" : "pendente";
  const etapa3: Situacao = company.renaveAderido ? "feito" : "pendente";
  const etapa5: Situacao = company.renaveAderido && company.renaveIntegradora && certOk ? "feito" : "pendente";
  const etapa6: Situacao = vehicles.length > 0 && comPendencia === 0 ? "feito" : "pendente";

  const feitas = [etapa1, etapa2, etapa3, etapa5, etapa6].filter((e) => e === "feito").length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Renave — passo a passo da adequação"
        description={`O que fazer, em que ordem, até ${prazoTexto(prazo)} (${RENAVE_NORMA})`}
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
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

      <Etapa numero={2} titulo="Escolher e contratar a integradora" status={etapa2} prazo="2 a 5 dias">
        <p>
          A loja <strong>precisa</strong> de uma integradora autorizada: é ela quem transmite os registros ao
          Renave (art. 5º, III). O sistema não faz e não pode fazer esse papel — provedores de sistema de
          gestão de lojas estão impedidos de atuar como integradoras (Anexo, item 1.3.2).
        </p>
        <p className="font-medium text-slate-900">Onde achar:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>pergunte ao DETRAN quais integradoras operam o Renave na sua circunscrição;</li>
          <li>pergunte ao contador e a duas ou três lojas conhecidas quem elas usam;</li>
          <li>
            se a loja já usa alguma, confirme se ela <strong>já regularizou o cadastro</strong> junto ao órgão
            federal (art. 33, § 2º) — passado o prazo sem isso, a autorização dela cai.
          </li>
        </ul>
        <p className="font-medium text-slate-900">Perguntas antes de assinar:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>quanto custa por registro (a norma fixa piso e teto — cobrar fora disso é proibido, art. 32, § 3º);</li>
          <li>se há cobrança amarrada a outros serviços (também proibido);</li>
          <li>
            se ela tem <strong>API</strong> — é isso que decide se, mais para a frente, o registro pode sair
            direto do sistema, sem redigitar;
          </li>
          <li>como ela trata a <strong>consignação</strong> (contrato eletrônico com assinatura digital das duas partes).</li>
        </ul>
        {company.renaveIntegradora ? (
          <p className="text-emerald-700">Integradora informada no sistema: {company.renaveIntegradora}.</p>
        ) : null}
      </Etapa>

      <Etapa
        numero={3}
        titulo="Aderir ao Renave no sistema Credencia"
        status={etapa3}
        prazo="1 dia para protocolar + até 30 dias de análise"
      >
        <ul className="list-disc space-y-1.5 pl-5">
          <li>A adesão é solicitada no <strong>Credencia</strong>, com o e-CNPJ. Pode ser feita direto pela loja ou pela integradora — o efeito é o mesmo (art. 8º).</li>
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
        {company.renaveAderido ? (
          <p className="text-emerald-700">
            Adesão marcada como concluída
            {company.renaveAderidoEm ? ` em ${formatDate(company.renaveAderidoEm)}` : ""}.
          </p>
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
          <li>integradora contratada;</li>
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
                <td className="px-3 py-2">O número que a integradora devolve ao registrar</td>
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
          <li>Registro de entrada pela integradora → anote o protocolo na ficha.</li>
        </ol>
        <p className="font-medium text-slate-900">Ao vender</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>NF-e de saída.</li>
          <li>ATPV-e assinada.</li>
          <li>Registro de saída pela integradora → protocolo na ficha.</li>
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
          <li>☐ Integradora contratada e testada com um registro real</li>
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
