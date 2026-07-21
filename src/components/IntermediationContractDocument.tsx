import { formatCurrency, formatDate } from "@/lib/format";
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
  financerName: string | null;
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
          Contrato de intermediação de financiamento de veículo
        </h1>

        <section className="mb-5 space-y-2 text-sm leading-relaxed text-slate-800">
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
          <p>
            <strong>INTERMEDIADORA:</strong> {company.razaoSocial}
            {company.cnpj ? `, inscrita no CNPJ sob o nº ${company.cnpj}` : ""}
            {company.address ? `, com endereço em ${company.address}` : ""}
            {company.city ? ` — ${company.city}${company.uf ? `/${company.uf}` : ""}` : ""}.
          </p>
        </section>

        <Clausula n={++n} titulo="Do objeto">
          <p>
            O presente contrato tem por objeto a <strong>intermediação</strong>, pela INTERMEDIADORA, do
            financiamento do veículo abaixo, negociado diretamente entre o(a) VENDEDOR(A) e o(a)
            COMPRADOR(A):
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-slate-50 p-3 sm:grid-cols-3">
            <p><span className="text-slate-500">Marca/Modelo:</span> <strong>{vehicle.brand} {vehicle.model}</strong></p>
            <p><span className="text-slate-500">Versão:</span> {vehicle.version || "—"}</p>
            <p><span className="text-slate-500">Ano fab./mod.:</span> {vehicle.manufactureYear}/{vehicle.modelYear}</p>
            <p><span className="text-slate-500">Placa:</span> <strong>{vehicle.plate}</strong></p>
            <p><span className="text-slate-500">Chassi:</span> {vehicle.chassi || "—"}</p>
            <p><span className="text-slate-500">Cor:</span> {vehicle.color || "—"}</p>
            <p><span className="text-slate-500">KM:</span> {vehicle.km.toLocaleString("pt-BR")}</p>
            <p><span className="text-slate-500">Combustível:</span> {vehicle.fuel || "—"}</p>
            <p><span className="text-slate-500">Câmbio:</span> {vehicle.transmission || "—"}</p>
          </div>
        </Clausula>

        <Clausula n={++n} titulo="Do papel da intermediadora">
          <p>
            A INTERMEDIADORA atua <strong>exclusivamente</strong> na viabilização do financiamento do
            veículo junto à instituição financeira
            {d.financerName ? <> <strong>{d.financerName}</strong></> : null}, <strong>não sendo
            proprietária, vendedora nem compradora</strong> do bem. A negociação de compra e venda do
            veículo ocorre direta e exclusivamente entre o(a) VENDEDOR(A) e o(a) COMPRADOR(A).
          </p>
        </Clausula>

        <Clausula n={++n} titulo="Da isenção de responsabilidade">
          <p>
            A INTERMEDIADORA <strong>não assume qualquer responsabilidade civil ou criminal</strong>
            decorrente do veículo, de sua procedência, estado de conservação, vícios aparentes ou
            ocultos, débitos, multas, gravames ou de qualquer obrigação relativa à propriedade,
            respondendo por tais fatos exclusivamente as partes VENDEDOR(A) e COMPRADOR(A).
          </p>
        </Clausula>

        <Clausula n={++n} titulo="Da transferência no DETRAN">
          <p>
            A INTERMEDIADORA <strong>não se obriga e não tem a responsabilidade de transferir o
            veículo</strong> junto ao órgão de trânsito (DETRAN), por ter atuado apenas como
            intermediadora do financiamento. A transferência da propriedade e a regularização dos
            débitos são de responsabilidade exclusiva do(a) COMPRADOR(A) e do(a) VENDEDOR(A), no prazo
            legal.
          </p>
        </Clausula>

        <Clausula n={++n} titulo="Dos valores">
          <table className="mt-1 w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-1">Valor do financiamento{d.financerName ? ` — ${d.financerName}` : ""}</td>
                <td className="py-1 text-right tabular-nums font-medium">{formatCurrency(d.financingAmount)}</td>
              </tr>
              <tr>
                <td className="py-1">(−) Valor devolvido ao(à) COMPRADOR(A)</td>
                <td className="py-1 text-right tabular-nums">{formatCurrency(d.refundAmount)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2">
            A INTERMEDIADORA efetuará a <strong>transferência bancária</strong> do valor de{" "}
            <strong>{formatCurrency(d.refundAmount)}</strong> ao(à) COMPRADOR(A), a título de devolução
            do financiamento, <strong>tão logo receba</strong> o valor do financiamento da instituição
            financeira{d.financerName ? <> <strong>{d.financerName}</strong></> : null}, na conta
            bancária abaixo indicada:
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <p><span className="text-slate-500">Titular:</span> <strong>{buyer.name}</strong></p>
            <p><span className="text-slate-500">CPF/CNPJ:</span> {buyer.document || "—"}</p>
            <p><span className="text-slate-500">Banco:</span> {buyerBank.name || "—"}</p>
            <p><span className="text-slate-500">Agência:</span> {buyerBank.agency || "—"}</p>
            <p><span className="text-slate-500">Conta:</span> {buyerBank.account || "—"}</p>
            <p><span className="text-slate-500">Tipo:</span> {buyerBank.accountType || "—"}</p>
            <p><span className="text-slate-500">PIX:</span> {buyerBank.pixKey || "—"}</p>
          </div>
          {!hasBank ? (
            <p className="mt-1 text-xs text-slate-400">
              (Preencha os dados bancários do comprador na operação para constarem aqui.)
            </p>
          ) : null}
        </Clausula>

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

        <div className="grid grid-cols-3 gap-6 text-center text-sm">
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
        </div>

        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-slate-500">
          <div className="border-t border-slate-400 pt-1">Testemunha 1 — Nome / CPF</div>
          <div className="border-t border-slate-400 pt-1">Testemunha 2 — Nome / CPF</div>
        </div>
      </div>
    </div>
  );
}
