import { formatCurrency, formatDate, numeroExtenso } from "@/lib/format";
import PrintButton from "@/components/PrintButton";
import { LinkButton } from "@/components/ui";
import CompanyDocHeader from "@/components/CompanyDocHeader";

type Company = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  uf: string | null;
  logoDataUrl: string | null;
};

type Party = {
  name: string;
  document: string | null;
  phone: string | null;
  address: string | null;
};

type ContractVehicle = {
  brand: string;
  model: string;
  version: string | null;
  manufactureYear: number;
  modelYear: number;
  plate: string;
  chassi: string | null;
  color: string | null;
  km: number;
  fuel: string | null;
  transmission: string | null;
  /** 0 km: sem placa/RENAVAM — identificado pelo chassi. */
  zeroKm?: boolean;
  /** Montadora/concessionária emitente da nota fiscal do 0 km. */
  manufacturerName?: string | null;
};

type BuyerBank = {
  name: string | null;
  agency: string | null;
  account: string | null;
  accountType: string | null;
  pixKey: string | null;
};

export type IntermediationContractData = {
  company: Company;
  seller: Party; // proprietário do documento (VENDEDOR)
  buyer: Party; // cliente que financia (COMPRADOR)
  buyerBank: BuyerBank;
  vehicle: ContractVehicle;
  number: number;
  date: Date;
  financingAmount: number;
  refundAmount: number;
  /**
   * "PROPRIETARIO" quando a devolução é paga ao vendedor; "TERCEIRO" quando vai
   * para a conta de outra pessoa autorizada pelas partes; vazio = comprador.
   */
  devolucaoPara?: string | null;
  /** Titular da conta quando a devolução vai a um TERCEIRO. */
  terceiro?: { nome: string | null; documento: string | null; vinculo: string | null } | null;
  // Refinanciamento: a financeira paga o valor financiado direto ao financiado
  // (o próprio proprietário); a intermediadora não faz devolução.
  refinancing?: boolean;
  financerName: string | null;
  // Parcelamento informado ao comprador (só informativo, preenchido na venda).
  installmentsInfo: { count: number; amount: number } | null;
  // Quitação do financiamento anterior do veículo com parte do valor financiado.
  payoff?: { bank: string | null; amount: number; barcode: string | null; dueDate: Date | null } | null;
  /** Débitos do veículo (IPVA, multas, licenciamento) quitados na operação. */
  debts?: {
    orgao: string | null;
    descricao: string | null;
    amount: number;
    barcode: string | null;
    dueDate: Date | null;
  } | null;
  backHref: string;
};

function Clausula({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 text-sm leading-relaxed text-slate-800">
      <h2 className="mb-1 font-bold">
        CLÁUSULA {n}ª — {titulo}
      </h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

/**
 * Contrato de intermediação de financiamento de terceiros. A empresa
 * (INTERMEDIADORA) apenas viabiliza o financiamento entre o VENDEDOR
 * (proprietário do documento) e o COMPRADOR (cliente), sem assumir
 * responsabilidade civil ou criminal e sem obrigação de transferir o veículo.
 */
export default function IntermediationContractDocument(d: IntermediationContractData) {
  const { company, seller, buyer, buyerBank, vehicle } = d;
  // Quem recebe a devolução (fora do refinanciamento, em que é o financiado).
  const aoTerceiro = !d.refinancing && d.devolucaoPara === "TERCEIRO";
  const aoProprietario = !d.refinancing && d.devolucaoPara === "PROPRIETARIO";
  const titular = d.refinancing || aoProprietario
    ? { nome: seller.name, documento: seller.document ?? null }
    : aoTerceiro
      ? { nome: d.terceiro?.nome || "—", documento: d.terceiro?.documento ?? null }
      : { nome: buyer.name, documento: buyer.document ?? null };
  const recebedor = aoTerceiro
    ? "TERCEIRO(A) AUTORIZADO(A)"
    : aoProprietario
      ? "PROPRIETÁRIO(A)/VENDEDOR(A)"
      : "COMPRADOR(A)";
  const hasBank =
    !!(buyerBank.name || buyerBank.agency || buyerBank.account || buyerBank.pixKey);
  const cidadeData = company.city
    ? `${company.city}${company.uf ? `/${company.uf}` : ""}, ${formatDate(d.date)}`
    : formatDate(d.date);
  let n = 0;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <LinkButton variant="secondary" href={d.backHref}>
          ← Voltar
        </LinkButton>
        <PrintButton />
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        <CompanyDocHeader
          company={company}
          right={
            <>
              <p className="font-bold">CONTRATO DE INTERMEDIAÇÃO</p>
              <p className="text-slate-500">Nº {String(d.number).padStart(4, "0")}</p>
              <p className="text-slate-500">{formatDate(d.date)}</p>
            </>
          }
        />

        <h1 className="mb-5 text-center text-base font-bold uppercase tracking-wide">
          Contrato de intermediação de {d.refinancing ? "refinanciamento" : "financiamento"} de veículo
        </h1>

        <section className="mb-5 space-y-2 text-sm leading-relaxed text-slate-800">
          {d.refinancing ? (
            <p>
              <strong>FINANCIADO(A) (proprietário do veículo):</strong> {seller.name}
              {seller.document ? `, portador(a) do CPF/CNPJ nº ${seller.document}` : ""}
              {seller.phone ? `, telefone ${seller.phone}` : ""}
              {seller.address ? `, residente em ${seller.address}` : ""}.
            </p>
          ) : (
            <>
              <p>
                <strong>VENDEDOR(A) (proprietário do documento):</strong> {seller.name}
                {seller.document ? `, portador(a) do CPF/CNPJ nº ${seller.document}` : ""}
                {seller.phone ? `, telefone ${seller.phone}` : ""}
                {seller.address ? `, residente em ${seller.address}` : ""}.
              </p>
              <p>
                <strong>COMPRADOR(A) (cliente financiado):</strong> {buyer.name}
                {buyer.document ? `, portador(a) do CPF/CNPJ nº ${buyer.document}` : ""}
                {buyer.phone ? `, telefone ${buyer.phone}` : ""}
                {buyer.address ? `, residente em ${buyer.address}` : ""}.
              </p>
            </>
          )}
          <p>
            <strong>INTERMEDIADORA:</strong> {company.razaoSocial}
            {company.cnpj ? `, inscrita no CNPJ sob o nº ${company.cnpj}` : ""}
            {company.address ? `, com endereço em ${company.address}` : ""}
            {company.city ? ` — ${company.city}${company.uf ? `/${company.uf}` : ""}` : ""}.
          </p>
        </section>

        <Clausula n={++n} titulo="Do objeto">
          {d.refinancing ? (
            <p>
              O presente contrato tem por objeto a <strong>intermediação</strong>, pela INTERMEDIADORA, do
              <strong> refinanciamento</strong> do veículo abaixo, de propriedade do(a) FINANCIADO(A):
            </p>
          ) : (
            <p>
              O presente contrato tem por objeto a <strong>intermediação</strong>, pela INTERMEDIADORA, do
              financiamento do veículo abaixo, negociado diretamente entre o(a) VENDEDOR(A) e o(a)
              COMPRADOR(A):
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-slate-50 p-3 sm:grid-cols-3">
            <p><span className="text-slate-500">Marca/Modelo:</span> <strong>{vehicle.brand} {vehicle.model}</strong></p>
            <p><span className="text-slate-500">Versão:</span> {vehicle.version || "—"}</p>
            <p><span className="text-slate-500">Ano fab./mod.:</span> {vehicle.manufactureYear}/{vehicle.modelYear}</p>
            {vehicle.zeroKm ? (
              <>
                <p>
                  <span className="text-slate-500">Placa:</span>{" "}
                  <strong>0 km — sem emplacamento</strong>
                </p>
                <p><span className="text-slate-500">Chassi:</span> <strong>{vehicle.chassi || "—"}</strong></p>
                <p className="col-span-2 sm:col-span-3">
                  <span className="text-slate-500">Montadora/concessionária (nota fiscal):</span>{" "}
                  <strong>{vehicle.manufacturerName || "—"}</strong>
                </p>
              </>
            ) : (
              <>
                <p><span className="text-slate-500">Placa:</span> <strong>{vehicle.plate}</strong></p>
                <p><span className="text-slate-500">Chassi:</span> {vehicle.chassi || "—"}</p>
              </>
            )}
            <p><span className="text-slate-500">Cor:</span> {vehicle.color || "—"}</p>
            <p><span className="text-slate-500">KM:</span> {vehicle.km.toLocaleString("pt-BR")}</p>
            <p><span className="text-slate-500">Combustível:</span> {vehicle.fuel || "—"}</p>
            <p><span className="text-slate-500">Câmbio:</span> {vehicle.transmission || "—"}</p>
          </div>
          {vehicle.zeroKm ? (
            <p className="mt-2 text-xs">
              Trata-se de veículo <strong>0 km</strong>, ainda <strong>não emplacado</strong> — sem placa e
              sem RENAVAM na data deste contrato. A identificação do bem se dá pelo <strong>chassi</strong>{" "}
              acima e pela nota fiscal emitida por{" "}
              <strong>{vehicle.manufacturerName || "montadora/concessionária"}</strong>. O emplacamento e o
              registro no órgão de trânsito correm por conta{" "}
              {d.refinancing ? "do(a) FINANCIADO(A)" : "do(a) COMPRADOR(A)"}.
            </p>
          ) : null}
        </Clausula>

        <Clausula n={++n} titulo="Do papel da intermediadora">
          {d.refinancing ? (
            <p>
              A INTERMEDIADORA atua <strong>exclusivamente</strong> na viabilização do
              <strong> refinanciamento</strong> do veículo junto à instituição financeira
              {d.financerName ? <> <strong>{d.financerName}</strong></> : null}, <strong>não sendo
              proprietária nem credora</strong> do bem. A contratação do financiamento ocorre direta e
              exclusivamente entre o(a) FINANCIADO(A) e a instituição financeira.
            </p>
          ) : (
            <p>
              A INTERMEDIADORA atua <strong>exclusivamente</strong> na viabilização do financiamento do
              veículo junto à instituição financeira
              {d.financerName ? <> <strong>{d.financerName}</strong></> : null}, <strong>não sendo
              proprietária, vendedora nem compradora</strong> do bem. A negociação de compra e venda do
              veículo ocorre direta e exclusivamente entre o(a) VENDEDOR(A) e o(a) COMPRADOR(A).
            </p>
          )}
        </Clausula>

        <Clausula n={++n} titulo="Da isenção de responsabilidade">
          <p>
            A INTERMEDIADORA <strong>não assume qualquer responsabilidade civil ou criminal</strong>
            decorrente do veículo, de sua procedência, estado de conservação, vícios aparentes ou
            ocultos, débitos, multas, gravames ou de qualquer obrigação relativa à propriedade,
            respondendo por tais fatos exclusivamente{" "}
            {d.refinancing ? "o(a) FINANCIADO(A)" : "as partes VENDEDOR(A) e COMPRADOR(A)"}.
          </p>
        </Clausula>

        {d.refinancing ? (
          <Clausula n={++n} titulo="Do gravame e da regularização">
            <p>
              Por se tratar de <strong>refinanciamento do próprio veículo</strong>, não há
              transferência de propriedade entre partes. A regularização do gravame/alienação
              fiduciária junto à instituição financeira e ao órgão de trânsito (DETRAN), bem como dos
              débitos do veículo, é de responsabilidade <strong>exclusiva do(a) FINANCIADO(A)</strong>,
              no prazo legal. A INTERMEDIADORA não se obriga a tais providências.
            </p>
          </Clausula>
        ) : (
          <Clausula n={++n} titulo="Da transferência no DETRAN">
            <p>
              A INTERMEDIADORA <strong>não se obriga e não tem a responsabilidade de transferir o
              veículo</strong> junto ao órgão de trânsito (DETRAN), por ter atuado apenas como
              intermediadora do financiamento. A transferência da propriedade e a regularização dos
              débitos são de responsabilidade exclusiva do(a) COMPRADOR(A) e do(a) VENDEDOR(A), no prazo
              legal.
            </p>
          </Clausula>
        )}

        <Clausula n={++n} titulo="Dos valores">
          <table className="mt-1 w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-1">Valor do financiamento{d.financerName ? ` — ${d.financerName}` : ""}</td>
                <td className="py-1 text-right tabular-nums font-medium">{formatCurrency(d.financingAmount)}</td>
              </tr>
              {!d.refinancing ? (
                <tr>
                  <td className="py-1">(−) Valor devolvido ao(à) {recebedor}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(d.refundAmount)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {d.refinancing ? (
            <p className="mt-2">
              A instituição financeira{d.financerName ? <> <strong>{d.financerName}</strong></> : null}{" "}
              efetuará o <strong>pagamento do valor financiado</strong> de{" "}
              <strong>{formatCurrency(d.financingAmount)}</strong> <strong>diretamente</strong> ao(à)
              FINANCIADO(A) (proprietário do veículo), na conta bancária abaixo indicada. A INTERMEDIADORA
              atua apenas na viabilização do refinanciamento.
            </p>
          ) : (
            <p className="mt-2">
              A INTERMEDIADORA efetuará a <strong>transferência bancária</strong> do valor de{" "}
              <strong>{formatCurrency(d.refundAmount)}</strong>{" "}
              {aoTerceiro ? (
                <>
                  ao(à) <strong>TERCEIRO(A) AUTORIZADO(A)</strong> <strong>{titular.nome}</strong>
                  {titular.documento ? <>, CPF/CNPJ {titular.documento}</> : null}
                  {d.terceiro?.vinculo ? <> ({d.terceiro.vinculo})</> : null}, indicado(a) de comum acordo
                  pelo(a) VENDEDOR(A) e pelo(a) COMPRADOR(A)
                </>
              ) : aoProprietario ? (
                <>
                  ao(à) <strong>PROPRIETÁRIO(A)/VENDEDOR(A)</strong>, a título de pagamento pela venda do
                  veículo
                </>
              ) : (
                <>ao(à) COMPRADOR(A), a título de devolução do financiamento</>
              )}
              , <strong>tão logo receba</strong> o valor do financiamento da instituição financeira
              {d.financerName ? <> <strong>{d.financerName}</strong></> : null}, na conta bancária abaixo
              indicada:
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <p>
              <span className="text-slate-500">Titular:</span>{" "}
              <strong>{titular.nome}</strong>
            </p>
            <p>
              <span className="text-slate-500">CPF/CNPJ:</span> {titular.documento || "—"}
            </p>
            <p><span className="text-slate-500">Banco:</span> {buyerBank.name || "—"}</p>
            <p><span className="text-slate-500">Agência:</span> {buyerBank.agency || "—"}</p>
            <p><span className="text-slate-500">Conta:</span> {buyerBank.account || "—"}</p>
            <p><span className="text-slate-500">Tipo:</span> {buyerBank.accountType || "—"}</p>
            <p><span className="text-slate-500">PIX:</span> {buyerBank.pixKey || "—"}</p>
          </div>
          {!hasBank ? (
            <p className="mt-1 text-xs text-slate-400">
              (Preencha os dados bancários do{" "}
              {d.refinancing
                ? "financiado"
                : aoTerceiro
                  ? "terceiro autorizado"
                  : aoProprietario
                    ? "proprietário"
                    : "comprador"}{" "}
              na operação para constarem aqui.)
            </p>
          ) : null}
          {aoTerceiro ? (
            <div className="mt-2 space-y-1 rounded-md border border-slate-300 p-3">
              <p>
                <strong>Autorização expressa das partes.</strong> O(A) VENDEDOR(A) e o(a) COMPRADOR(A), de comum
                acordo, <strong>autorizam e determinam</strong> que a INTERMEDIADORA deposite o valor acima na
                conta de titularidade do(a) TERCEIRO(A) AUTORIZADO(A) <strong>{titular.nome}</strong>
                {titular.documento ? <>, CPF/CNPJ {titular.documento}</> : null}, que não é parte da compra e
                venda do veículo.
              </p>
              <p>
                O crédito nessa conta <strong>quita integralmente</strong> a obrigação da INTERMEDIADORA quanto a
                esse valor: as partes dão plena, geral e irrevogável quitação, nada mais tendo a reclamar a esse
                título, e <strong>isentam a INTERMEDIADORA</strong> de qualquer responsabilidade pela relação entre
                elas e o(a) terceiro(a), pelo destino do dinheiro depois do depósito e por eventual divergência
                entre elas sobre essa indicação.
              </p>
              <p>
                Eventual erro nos dados bancários informados é de responsabilidade de quem os indicou; a
                INTERMEDIADORA só responde por creditar a conta exatamente como informada acima.
              </p>
            </div>
          ) : null}
          {d.installmentsInfo && d.installmentsInfo.count > 0 ? (
            <p className="mt-2 rounded-md bg-amber-50 p-2">
              O(A) COMPRADOR(A) declara ciência de que o financiamento será pago em{" "}
              <strong>
                {d.installmentsInfo.count} ({numeroExtenso(d.installmentsInfo.count)})
              </strong>{" "}
              parcela(s) de <strong>{formatCurrency(d.installmentsInfo.amount)}</strong> cada.
            </p>
          ) : null}
        </Clausula>

        {d.payoff && d.payoff.amount > 0 ? (
          <Clausula n={++n} titulo="Da quitação do financiamento anterior">
            <p>
              As partes declaram que o veículo objeto deste contrato encontra-se{" "}
              <strong>financiado junto a {d.payoff.bank || "instituição financeira credora"}</strong> e que, do
              valor {d.refinancing ? "financiado" : "devolvido ao(à) COMPRADOR(A)"}, a importância de{" "}
              <strong>{formatCurrency(d.payoff.amount)}</strong> será destinada à{" "}
              <strong>quitação desse financiamento anterior</strong>, mediante pagamento do boleto emitido
              pelo banco credor
              {d.payoff.dueDate ? <>, com vencimento em <strong>{formatDate(d.payoff.dueDate)}</strong></> : null}
              {d.refinancing
                ? ", a cargo do(a) FINANCIADO(A)."
                : ", efetuado pela INTERMEDIADORA por conta e ordem do(a) COMPRADOR(A), abatendo-se esse valor da devolução prevista na cláusula anterior."}
            </p>
            {d.payoff.barcode ? (
              <p className="rounded-md bg-slate-50 p-2 text-xs">
                <span className="text-slate-500">Código de barras / linha digitável do boleto:</span>{" "}
                <strong className="break-all font-mono">{d.payoff.barcode}</strong>
              </p>
            ) : null}
            <p>
              A baixa do gravame e a regularização do veículo junto ao banco credor e ao órgão de trânsito
              permanecem de responsabilidade{" "}
              {d.refinancing ? "do(a) FINANCIADO(A)" : "do(a) VENDEDOR(A) e do(a) COMPRADOR(A)"}, não
              respondendo a INTERMEDIADORA por eventual saldo residual, encargos ou diferença de valor
              apurada pelo banco credor após a data do boleto.
            </p>
          </Clausula>
        ) : null}

        {d.debts && d.debts.amount > 0 ? (
          <Clausula n={++n} titulo="Da quitação de débitos do veículo">
            <p>
              As partes declaram que o veículo objeto deste contrato possui{" "}
              <strong>débitos anteriores{d.debts.descricao ? ` (${d.debts.descricao})` : " (IPVA, multas e licenciamento)"}</strong>
              {d.debts.orgao ? <> junto a <strong>{d.debts.orgao}</strong></> : null} e que, do valor{" "}
              {d.refinancing ? "financiado" : "devolvido ao(à) COMPRADOR(A)"}, a importância de{" "}
              <strong>{formatCurrency(d.debts.amount)}</strong> será destinada à{" "}
              <strong>quitação desses débitos</strong>, mediante pagamento da guia emitida pelo órgão
              {d.debts.dueDate ? <>, com vencimento em <strong>{formatDate(d.debts.dueDate)}</strong></> : null}
              {d.refinancing
                ? ", a cargo do(a) FINANCIADO(A)."
                : ", efetuado pela INTERMEDIADORA por conta e ordem do(a) COMPRADOR(A), abatendo-se esse valor da devolução prevista na cláusula anterior."}
            </p>
            {d.debts.barcode ? (
              <p className="rounded-md bg-slate-50 p-2 text-xs">
                <span className="text-slate-500">Código de barras / linha digitável da guia:</span>{" "}
                <strong className="break-all font-mono">{d.debts.barcode}</strong>
              </p>
            ) : null}
            <p>
              Os valores acima são os apurados na data da guia. Débitos que venham a ser lançados,
              atualizados ou apurados depois dela — inclusive juros, multa e correção — são de
              responsabilidade{" "}
              {d.refinancing ? "do(a) FINANCIADO(A)" : "do(a) VENDEDOR(A) e do(a) COMPRADOR(A)"}, não
              respondendo a INTERMEDIADORA por diferença apurada pelo órgão após aquela data.
            </p>
          </Clausula>
        ) : null}

        <Clausula n={++n} titulo="Do foro">
          <p>
            As partes elegem o foro da comarca de{" "}
            {company.city ? `${company.city}${company.uf ? `/${company.uf}` : ""}` : "___________________"} para
            dirimir quaisquer dúvidas oriundas deste contrato, renunciando a qualquer outro, por mais
            privilegiado que seja.
          </p>
        </Clausula>

        <p className="mb-8 mt-6 text-sm">
          E, por estarem assim justas e contratadas, as partes assinam o presente instrumento.
        </p>

        <p className="mb-10 text-sm">{cidadeData}.</p>

        {d.refinancing ? (
          <div className="grid grid-cols-2 gap-6 text-center text-sm">
            <div>
              <div className="border-t border-slate-400 pt-2">{seller.name}</div>
              <p className="text-xs text-slate-500">FINANCIADO(A)</p>
            </div>
            <div>
              <div className="border-t border-slate-400 pt-2">{company.razaoSocial}</div>
              <p className="text-xs text-slate-500">INTERMEDIADORA</p>
            </div>
          </div>
        ) : (
          <div
            className={`grid gap-6 text-center text-sm ${aoTerceiro ? "grid-cols-2 gap-y-12" : "grid-cols-3"}`}
          >
            <div>
              <div className="border-t border-slate-400 pt-2">{seller.name}</div>
              <p className="text-xs text-slate-500">VENDEDOR(A)</p>
            </div>
            <div>
              <div className="border-t border-slate-400 pt-2">{buyer.name}</div>
              <p className="text-xs text-slate-500">COMPRADOR(A)</p>
            </div>
            <div>
              <div className="border-t border-slate-400 pt-2">{company.razaoSocial}</div>
              <p className="text-xs text-slate-500">INTERMEDIADORA</p>
            </div>
            {aoTerceiro ? (
              // O terceiro assina como ciente: confirma que a conta é dele e
              // que o crédito ali quita o que a loja devia repassar.
              <div>
                <div className="border-t border-slate-400 pt-2">{titular.nome}</div>
                <p className="text-xs text-slate-500">TERCEIRO(A) AUTORIZADO(A) — ciente e de acordo</p>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-slate-500">
          <div className="border-t border-slate-400 pt-1">Testemunha 1 — Nome / CPF</div>
          <div className="border-t border-slate-400 pt-1">Testemunha 2 — Nome / CPF</div>
        </div>
      </div>
    </div>
  );
}
