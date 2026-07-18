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

type TradeIn = {
  label: string;
  negotiated: number;
  payoff: number;
  payoffTo: string | null;
  debts: number;
  liquido: number;
} | null;

export type SaleContractData = {
  company: Company;
  buyer: Party;
  vehicle: ContractVehicle;
  number: number;
  date: Date;
  paymentMethod: "A_VISTA" | "PARCELADO" | "FINANCIADO";
  total: number;
  tiLiquido: number;
  sinal: number;
  entrada: number;
  financiado: number;
  financerName: string | null;
  saldo: number;
  installmentsCount: number;
  parcelaValor: number;
  tradeIn: TradeIn;
  notes: string | null;
  backHref: string;
};

const paymentLabel = { A_VISTA: "à vista", PARCELADO: "parcelado", FINANCIADO: "financiado" } as const;

/** Cláusula numerada do contrato. */
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
 * Contrato particular de compra e venda de veículo. Usado tanto pela pré-venda
 * quanto pela venda já concluída — cada tela monta os valores e passa aqui.
 */
export default function SaleContractDocument(d: SaleContractData) {
  const { company, buyer, vehicle, tradeIn } = d;
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
              <p className="font-bold">CONTRATO DE COMPRA E VENDA</p>
              <p className="text-slate-500">Nº {String(d.number).padStart(4, "0")}</p>
              <p className="text-slate-500">{formatDate(d.date)}</p>
            </>
          }
        />

        <h1 className="mb-5 text-center text-base font-bold uppercase tracking-wide">
          Contrato particular de compra e venda de veículo automotor
        </h1>

        <section className="mb-5 space-y-2 text-sm leading-relaxed text-slate-800">
          <p>
            <strong>VENDEDORA:</strong> {company.razaoSocial}
            {company.cnpj ? `, inscrita no CNPJ sob o nº ${company.cnpj}` : ""}
            {company.address ? `, com endereço em ${company.address}` : ""}
            {company.city ? ` — ${company.city}${company.uf ? `/${company.uf}` : ""}` : ""}.
          </p>
          <p>
            <strong>COMPRADOR(A):</strong> {buyer.name}
            {buyer.document ? `, portador(a) do CPF/CNPJ nº ${buyer.document}` : ""}
            {buyer.phone ? `, telefone ${buyer.phone}` : ""}
            {buyer.address ? `, residente em ${buyer.address}` : ""}.
          </p>
          <p>
            As partes acima qualificadas têm, entre si, justo e contratado o presente Contrato de
            Compra e Venda de Veículo Automotor, que se regerá pelas cláusulas seguintes.
          </p>
        </section>

        <Clausula n={++n} titulo="Do objeto">
          <p>
            O presente contrato tem por objeto a venda do veículo abaixo descrito, de propriedade da
            VENDEDORA:
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

        <Clausula n={++n} titulo="Do preço e da forma de pagamento">
          <p>
            O preço total, certo e ajustado para a presente venda é de{" "}
            <strong>{formatCurrency(d.total)}</strong>, pago da forma{" "}
            <strong>{paymentLabel[d.paymentMethod]}</strong>, conforme a composição abaixo:
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-1">Valor total da venda</td>
                <td className="py-1 text-right tabular-nums font-medium">{formatCurrency(d.total)}</td>
              </tr>
              {d.tiLiquido > 0 ? (
                <tr className="border-b border-slate-100">
                  <td className="py-1">(−) Entrada com veículo em troca{tradeIn ? ` (${tradeIn.label})` : ""}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(d.tiLiquido)}</td>
                </tr>
              ) : null}
              {d.sinal > 0 ? (
                <tr className="border-b border-slate-100">
                  <td className="py-1">(−) Sinal já pago</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(d.sinal)}</td>
                </tr>
              ) : null}
              {d.entrada > 0 ? (
                <tr className="border-b border-slate-100">
                  <td className="py-1">(−) Entrada</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(d.entrada)}</td>
                </tr>
              ) : null}
              {d.financiado > 0 ? (
                <tr className="border-b border-slate-100">
                  <td className="py-1">(−) Financiamento{d.financerName ? ` — ${d.financerName}` : ""}</td>
                  <td className="py-1 text-right tabular-nums">{formatCurrency(d.financiado)}</td>
                </tr>
              ) : null}
              <tr className="border-t border-slate-300">
                <td className="py-1 font-bold">= Saldo a pagar</td>
                <td className="py-1 text-right tabular-nums font-bold">{formatCurrency(d.saldo)}</td>
              </tr>
            </tbody>
          </table>
          {d.paymentMethod === "PARCELADO" && d.installmentsCount > 0 ? (
            <p className="mt-2">
              O saldo será pago em <strong>{d.installmentsCount}</strong> parcela(s) de{" "}
              <strong>{formatCurrency(d.parcelaValor)}</strong>.
            </p>
          ) : null}
        </Clausula>

        {tradeIn ? (
          <Clausula n={++n} titulo="Do veículo recebido em troca">
            <p>
              A VENDEDORA recebe, como parte do pagamento, o veículo <strong>{tradeIn.label}</strong>,
              avaliado em {formatCurrency(tradeIn.negotiated)}
              {tradeIn.payoff > 0 ? `, com quitação de ${formatCurrency(tradeIn.payoff)}${tradeIn.payoffTo ? ` junto a ${tradeIn.payoffTo}` : ""}` : ""}
              {tradeIn.debts > 0 ? ` e débitos de ${formatCurrency(tradeIn.debts)}` : ""}, resultando no valor
              líquido de <strong>{formatCurrency(tradeIn.liquido)}</strong> aproveitado como entrada desta venda.
              O(A) COMPRADOR(A) declara que o veículo dado em troca é de sua legítima propriedade e está livre
              de quaisquer ônus além dos aqui declarados.
            </p>
          </Clausula>
        ) : null}

        <Clausula n={++n} titulo="Do estado do veículo">
          <p>
            O veículo é vendido no estado em que se encontra, tendo o(a) COMPRADOR(A) examinado e
            aceito suas condições de funcionamento, lataria, pintura e demais itens, nada tendo a
            reclamar posteriormente quanto ao seu estado aparente e de conservação.
          </p>
        </Clausula>

        <Clausula n={++n} titulo="Da garantia legal">
          <p>
            Nos termos do art. 26, inciso II, do Código de Defesa do Consumidor (Lei nº 8.078/1990),
            fica assegurada ao(à) COMPRADOR(A) a <strong>garantia legal de 90 (noventa) dias</strong>,
            contados da data de entrega do veículo, contra vícios ocultos que o tornem impróprio ou
            inadequado ao uso a que se destina ou lhe diminuam o valor.
          </p>
          <p>
            A garantia legal não abrange os itens de desgaste natural decorrentes do uso (tais como
            pneus, palhetas, pastilhas e lonas de freio, embreagem, óleos e filtros), tampouco os
            defeitos causados por mau uso, acidente, adulteração ou falta de manutenção após a entrega.
          </p>
        </Clausula>

        <Clausula n={++n} titulo="Da transferência e dos débitos">
          <p>
            A transferência da propriedade junto ao órgão de trânsito (DETRAN) será providenciada pelo(a)
            COMPRADOR(A) no prazo legal de 30 (trinta) dias, correndo por sua conta as despesas de
            transferência. Os débitos (IPVA, licenciamento, multas) até a data deste contrato são de
            responsabilidade da VENDEDORA; a partir desta data, do(a) COMPRADOR(A).
          </p>
        </Clausula>

        <Clausula n={++n} titulo="Do foro">
          <p>
            As partes elegem o foro da comarca de{" "}
            {company.city ? `${company.city}${company.uf ? `/${company.uf}` : ""}` : "___________________"} para
            dirimir quaisquer dúvidas oriundas deste contrato, renunciando a qualquer outro, por mais
            privilegiado que seja.
          </p>
        </Clausula>

        {d.notes ? (
          <Clausula n={++n} titulo="Das observações">
            <p className="whitespace-pre-wrap">{d.notes}</p>
          </Clausula>
        ) : null}

        <p className="mb-8 mt-6 text-sm">
          E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em duas
          vias de igual teor.
        </p>

        <p className="mb-10 text-sm">{cidadeData}.</p>

        <div className="grid grid-cols-2 gap-10 text-center text-sm">
          <div>
            <div className="border-t border-slate-400 pt-2">{company.razaoSocial}</div>
            <p className="text-xs text-slate-500">VENDEDORA</p>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2">{buyer.name}</div>
            <p className="text-xs text-slate-500">COMPRADOR(A)</p>
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
