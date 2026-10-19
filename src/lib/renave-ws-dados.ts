/**
 * Renave-WS (API do SERPRO) — montagem dos pedidos, sem falar com a rede.
 *
 * Cada operação recebe o que a tela preencheu (tudo texto, como veio do
 * formulário) e devolve o corpo pronto para o Renave OU a lista do que falta,
 * em português e dizendo onde corrigir. Nada é enviado com falta: o Renave
 * cobra por movimentação e responde erro de um campo por vez.
 *
 * Regras tiradas do manual (renave.estaleiro.serpro.gov.br/renave-ws/manual) e
 * do que a homologação respondeu na prática — o Swagger não marca como
 * obrigatórios o e-mail do vendedor e o CPF do operador, mas a API recusa sem
 * eles.
 */

export type RenaveAmbiente = "HOMOLOGACAO" | "PRODUCAO";

export const AMBIENTES_RENAVE: readonly RenaveAmbiente[] = ["HOMOLOGACAO", "PRODUCAO"];

export const ROTULO_AMBIENTE_RENAVE: Record<RenaveAmbiente, string> = {
  HOMOLOGACAO: "Homologação (testes)",
  PRODUCAO: "Produção",
};

/** Lê o ambiente gravado em Parâmetros (null = integração desligada). */
export function lerAmbienteRenave(v: string | null | undefined): RenaveAmbiente | null {
  return v === "HOMOLOGACAO" || v === "PRODUCAO" ? v : null;
}

export type TipoCrv = "AZUL" | "VERDE" | "BRANCO" | "DIGITAL";
export const TIPOS_CRV: readonly TipoCrv[] = ["DIGITAL", "BRANCO", "VERDE", "AZUL"];
export const ROTULO_TIPO_CRV: Record<TipoCrv, string> = {
  DIGITAL: "Digital (CRV-e / ATPV-e)",
  BRANCO: "Branco (papel)",
  VERDE: "Verde (papel moeda)",
  AZUL: "Azul (papel moeda)",
};

export function lerTipoCrv(v: string | null | undefined): TipoCrv | null {
  const s = (v ?? "").trim().toUpperCase();
  return (TIPOS_CRV as readonly string[]).includes(s) ? (s as TipoCrv) : null;
}

/** CRV em papel moeda: a assinatura do vendedor vai pela foto do verso do CRV. */
export function crvPapelMoeda(t: TipoCrv | null): boolean {
  return t === "AZUL" || t === "VERDE";
}

/** Estados de um estoque no Renave. */
export type EstadoEstoque = "SOLICITADO" | "TRANSFERIDO" | "CONFIRMADO" | "FINALIZADO";

export const ROTULO_ESTADO_ESTOQUE: Record<EstadoEstoque, string> = {
  SOLICITADO: "Entrada solicitada — aguardando o Detran",
  TRANSFERIDO: "Transferido para outro estabelecimento",
  CONFIRMADO: "Em estoque (confirmado pelo Detran)",
  FINALIZADO: "Saída registrada",
};

export function lerEstadoEstoque(v: unknown): EstadoEstoque | null {
  return v === "SOLICITADO" || v === "TRANSFERIDO" || v === "CONFIRMADO" || v === "FINALIZADO" ? v : null;
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

export const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function cpfValido(v: string | null | undefined): boolean {
  const c = digitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(c[n])) return false;
  }
  return true;
}

export function cnpjValido(v: string | null | undefined): boolean {
  const c = digitos(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(c[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

/** "CPF"/"CNPJ" pelo tamanho, se o número for válido. */
export function tipoDocumento(v: string | null | undefined): "CPF" | "CNPJ" | null {
  if (cpfValido(v)) return "CPF";
  if (cnpjValido(v)) return "CNPJ";
  return null;
}

export function placaValida(v: string | null | undefined): boolean {
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test((v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase());
}

export const normalizarPlaca = (v: string | null | undefined) => (v ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Nº do CRV: o Renave exige 12 dígitos (os mais curtos levam zeros à esquerda). */
export function normalizarNumeroCrv(v: string | null | undefined): string {
  const d = digitos(v);
  return d.length >= 9 && d.length < 12 ? d.padStart(12, "0") : d;
}

/** Renavam tem 11 dígitos; os antigos de 9 levam zeros à esquerda. */
export function normalizarRenavam(v: string | null | undefined): string {
  const d = digitos(v);
  return d && d.length < 11 ? d.padStart(11, "0") : d;
}

const emailValido = (v: string | null | undefined) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v ?? "").trim());
const dataValida = (v: string | null | undefined) => /^\d{4}-\d{2}-\d{2}$/.test(v ?? "") && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

/** "1.234,56" / "1234.56" → número; vazio ou inválido → NaN. */
export function lerValor(v: string | null | undefined): number {
  const s = (v ?? "").trim();
  if (!s) return NaN;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Hoje em America/Sao_Paulo (aaaa-mm-dd), para barrar data no futuro. */
export function hojeSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

// ---------------------------------------------------------------------------
// Entrada em estoque (compra de usado)
// ---------------------------------------------------------------------------

/** O que a tela manda para a entrada; tudo texto. */
export type DadosEntrada = {
  placa: string;
  renavam: string;
  tipoCrv: string;
  numeroCrv: string;
  codigoSegurancaCrv: string;
  km: string;
  /** aaaa-mm-ddThh:mm (datetime-local) */
  kmEm: string;
  documentoProprietario: string;
  dataCompra: string;
  valorCompra: string;
  emailVendedor: string;
  emailEstabelecimento: string;
  cpfOperador: string;
};

export type Montagem<T> = { ok: true; payload: T } | { ok: false; faltas: string[] };

function veiculoComum(d: Pick<DadosEntrada, "placa" | "renavam" | "tipoCrv" | "numeroCrv" | "codigoSegurancaCrv" | "km" | "kmEm">, hoje: string, faltas: string[]) {
  const placa = normalizarPlaca(d.placa);
  if (!placaValida(placa)) faltas.push("Placa inválida (ex.: ABC1D23) — Editar veículo.");
  const renavam = normalizarRenavam(d.renavam);
  if (renavam.length !== 11) faltas.push("Renavam deve ter 11 dígitos — Editar veículo ou leia o CRLV.");
  const tipoCrv = lerTipoCrv(d.tipoCrv);
  if (!tipoCrv) faltas.push("Escolha o tipo do CRV (digital, branco, verde ou azul).");
  const numeroCrv = normalizarNumeroCrv(d.numeroCrv);
  if (numeroCrv.length !== 12) faltas.push("Nº do CRV (12 dígitos) — está na ATPV-e/CRV (o Renave confere com o último CRV).");
  const codigo = digitos(d.codigoSegurancaCrv);
  if (codigo.length !== 11) faltas.push("Código de segurança do CRV deve ter 11 dígitos — está na ATPV-e/CRV.");
  const km = Number(digitos(d.km));
  if (!digitos(d.km) || !Number.isInteger(km) || km < 0 || km > 2_000_000) faltas.push("Informe a quilometragem do hodômetro.");
  const kmEm = (d.kmEm ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(kmEm)) faltas.push("Informe a data e a hora em que o hodômetro foi lido.");
  else if (kmEm.slice(0, 10) > hoje) faltas.push("A leitura do hodômetro não pode ser no futuro.");
  return {
    placa,
    renavam,
    tipoCrv: tipoCrv ?? "DIGITAL",
    numeroCrv,
    codigoSegurancaCrv: codigo,
    quilometragemHodometro: km,
    dataHoraMedicaoHodometro: kmEm.length === 16 ? `${kmEm}:00` : kmEm.slice(0, 19),
  };
}

export type PayloadEntrada = {
  cpfOperadorResponsavel: string;
  dataCompra: string;
  valorCompra: number;
  emailEstabelecimento: string;
  emailVendedor: string;
  veiculo: ReturnType<typeof veiculoComum> & {
    documentoProprietarioAtual: string;
    tipoDocumentoProprietarioAtual: "CPF" | "CNPJ";
  };
};

export function montarEntrada(d: DadosEntrada, opts: { cnpjLoja?: string | null; hoje?: string } = {}): Montagem<PayloadEntrada> {
  const hoje = opts.hoje ?? hojeSaoPaulo();
  const faltas: string[] = [];
  const veiculo = veiculoComum(d, hoje, faltas);
  const doc = digitos(d.documentoProprietario);
  const tipoDoc = tipoDocumento(doc);
  if (!tipoDoc) faltas.push("CPF/CNPJ do proprietário atual (quem está no CRV) inválido — cadastro do fornecedor.");
  else if (opts.cnpjLoja && doc === digitos(opts.cnpjLoja))
    faltas.push("O CRV já está no nome da loja: use “Entrada de veículo próprio”.");
  if (!dataValida(d.dataCompra)) faltas.push("Informe a data da compra.");
  else if (d.dataCompra > hoje) faltas.push("A data da compra não pode ser no futuro.");
  const valor = lerValor(d.valorCompra);
  if (!(valor > 0)) faltas.push("Informe o valor da compra.");
  if (!emailValido(d.emailVendedor)) faltas.push("E-mail do vendedor obrigatório no Renave — cadastro do fornecedor.");
  if (!emailValido(d.emailEstabelecimento)) faltas.push("E-mail da loja — Parâmetros → Renave (integração).");
  if (!cpfValido(d.cpfOperador)) faltas.push("CPF do operador responsável — seu cadastro de usuário ou Parâmetros → Renave.");
  if (faltas.length) return { ok: false, faltas };
  return {
    ok: true,
    payload: {
      cpfOperadorResponsavel: digitos(d.cpfOperador),
      dataCompra: d.dataCompra,
      valorCompra: valor,
      emailEstabelecimento: d.emailEstabelecimento.trim(),
      emailVendedor: d.emailVendedor.trim(),
      veiculo: { ...veiculo, documentoProprietarioAtual: doc, tipoDocumentoProprietarioAtual: tipoDoc! },
    },
  };
}

// ---------------------------------------------------------------------------
// Entrada de veículo próprio (CRV já no nome da loja)
// ---------------------------------------------------------------------------

export type DadosEntradaProprio = Pick<
  DadosEntrada,
  "placa" | "renavam" | "tipoCrv" | "numeroCrv" | "codigoSegurancaCrv" | "km" | "kmEm" | "cpfOperador"
> & { dataEntrada: string };

export type PayloadEntradaProprio = {
  cpfOperadorResponsavel: string;
  dataEntradaEstoque: string;
  veiculo: ReturnType<typeof veiculoComum>;
};

export function montarEntradaProprio(d: DadosEntradaProprio, opts: { hoje?: string } = {}): Montagem<PayloadEntradaProprio> {
  const hoje = opts.hoje ?? hojeSaoPaulo();
  const faltas: string[] = [];
  const veiculo = veiculoComum(d, hoje, faltas);
  if (!dataValida(d.dataEntrada)) faltas.push("Informe a data de entrada no estoque.");
  else if (d.dataEntrada > hoje) faltas.push("A data de entrada não pode ser no futuro.");
  if (!cpfValido(d.cpfOperador)) faltas.push("CPF do operador responsável — seu cadastro de usuário ou Parâmetros → Renave.");
  if (faltas.length) return { ok: false, faltas };
  return { ok: true, payload: { cpfOperadorResponsavel: digitos(d.cpfOperador), dataEntradaEstoque: d.dataEntrada, veiculo } };
}

// ---------------------------------------------------------------------------
// Saída de estoque (venda)
// ---------------------------------------------------------------------------

export type DadosSaida = {
  placa: string;
  renavam: string;
  numeroCrv: string;
  codigoSegurancaCrv: string;
  dataVenda: string;
  valorVenda: string;
  compradorDocumento: string;
  compradorNome: string;
  compradorEmail: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  /** Código do município NO RENAVE (não é o IBGE) — vem de /api/municipios. */
  codigoMunicipio: string;
  emailEstabelecimento: string;
  cpfOperador: string;
};

export type PayloadSaida = {
  cpfOperadorResponsavel: string;
  dataVenda: string;
  valorVenda: number;
  emailEstabelecimento: string;
  comprador: {
    tipoDocumento: "CPF" | "CNPJ";
    numeroDocumento: string;
    nome: string;
    email?: string;
    endereco: {
      codigoMunicipio: number;
      cep: string;
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
    };
  };
  veiculo: { placa: string; renavam: string; numeroCrv: string; codigoSegurancaCrv: string };
};

export function montarSaida(d: DadosSaida, opts: { hoje?: string } = {}): Montagem<PayloadSaida> {
  const hoje = opts.hoje ?? hojeSaoPaulo();
  const faltas: string[] = [];
  const placa = normalizarPlaca(d.placa);
  if (!placaValida(placa)) faltas.push("Placa inválida — Editar veículo.");
  const renavam = normalizarRenavam(d.renavam);
  if (renavam.length !== 11) faltas.push("Renavam deve ter 11 dígitos — Editar veículo.");
  const codigo = digitos(d.codigoSegurancaCrv);
  if (codigo.length !== 11)
    faltas.push("Código de segurança do CRV ATUAL (o emitido em nome da loja) — use “Buscar no Renave” ou digite.");
  const numeroCrv = normalizarNumeroCrv(d.numeroCrv);
  if (numeroCrv.length !== 12)
    faltas.push("Nº do CRV ATUAL, 12 dígitos (o emitido em nome da loja) — está no CRV/ATPV-e novo; leia o documento ou digite.");
  if (!dataValida(d.dataVenda)) faltas.push("Informe a data da venda.");
  else if (d.dataVenda > hoje) faltas.push("A data da venda não pode ser no futuro.");
  const valor = lerValor(d.valorVenda);
  if (!(valor > 0)) faltas.push("Informe o valor da venda.");
  const doc = digitos(d.compradorDocumento);
  const tipoDoc = tipoDocumento(doc);
  if (!tipoDoc) faltas.push("CPF/CNPJ do comprador inválido — cadastro do cliente.");
  const nome = d.compradorNome.trim();
  if (nome.length < 3) faltas.push("Nome do comprador — cadastro do cliente.");
  if (d.compradorEmail.trim() && !emailValido(d.compradorEmail)) faltas.push("E-mail do comprador inválido — cadastro do cliente.");
  const codMun = Number(digitos(d.codigoMunicipio));
  if (!digitos(d.codigoMunicipio) || !Number.isInteger(codMun))
    faltas.push("Município do comprador não encontrado no Renave — confira cidade/UF no cadastro do cliente.");
  // O Renave recusa o endereço sem logradouro, número, bairro e CEP.
  if (digitos(d.cep).length !== 8) faltas.push("CEP do comprador — cadastro do cliente.");
  if (!d.logradouro.trim()) faltas.push("Logradouro do comprador — cadastro do cliente.");
  if (!d.numero.trim()) faltas.push("Número do endereço do comprador (ou S/N) — cadastro do cliente.");
  if (!d.bairro.trim()) faltas.push("Bairro do comprador — cadastro do cliente.");
  if (!emailValido(d.emailEstabelecimento)) faltas.push("E-mail da loja — Parâmetros → Renave (integração).");
  if (!cpfValido(d.cpfOperador)) faltas.push("CPF do operador responsável — seu cadastro de usuário ou Parâmetros → Renave.");
  if (faltas.length) return { ok: false, faltas };
  return {
    ok: true,
    payload: {
      cpfOperadorResponsavel: digitos(d.cpfOperador),
      dataVenda: d.dataVenda,
      valorVenda: valor,
      emailEstabelecimento: d.emailEstabelecimento.trim(),
      comprador: {
        tipoDocumento: tipoDoc!,
        numeroDocumento: doc,
        nome: nome.slice(0, 100),
        ...(d.compradorEmail.trim() ? { email: d.compradorEmail.trim() } : {}),
        endereco: {
          codigoMunicipio: codMun,
          cep: digitos(d.cep),
          logradouro: d.logradouro.trim().slice(0, 100),
          numero: d.numero.trim().slice(0, 10),
          ...(d.complemento.trim() ? { complemento: d.complemento.trim().slice(0, 60) } : {}),
          bairro: d.bairro.trim().slice(0, 60),
        },
      },
      veiculo: { placa, renavam, numeroCrv, codigoSegurancaCrv: codigo },
    },
  };
}

// ---------------------------------------------------------------------------
// Respostas
// ---------------------------------------------------------------------------

/** Nome do município como o Renave grava: maiúsculas, sem acento. */
export function nomeMunicipioRenave(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Código de segurança do CRV no texto do PDF que o Renave devolve
 * ("pdf-codigo-seguranca-crv", rótulo "NÚMERO DE SEGURANÇA DO CRV"): 11
 * dígitos logo depois do rótulo.
 */
export function codigoSegurancaDoTexto(texto: string, renavam?: string | null): string | null {
  const t = texto.replace(/\s+/g, " ");
  const m = t.match(/(?:c[oó]d(?:igo|\.)?|n[uú]mero)\s*(?:de\s*)?seguran[cç]a(?:\s*(?:do|\(?CRV\)?|CRV))*\s*[:\-]?\s*(\d[\d .]{9,16}\d)/i);
  if (m) {
    const d = digitos(m[1]);
    if (d.length === 11) return d;
  }
  // Sem o rótulo legível (fonte sem mapa de caracteres): no documento só há
  // dois números de 11 dígitos — o Renavam e o código.
  const ren = normalizarRenavam(renavam);
  const soltos = [...new Set(t.match(/(?<!\d)\d{11}(?!\d)/g) ?? [])].filter((n) => n !== ren);
  return soltos.length === 1 ? soltos[0] : null;
}

/** O que mostrar das restrições/diagnóstico da aptidão, em português. */
export const MOTIVO_APTIDAO: Record<string, string> = {
  veiculoBaixado: "veículo baixado",
  veiculoComAlarme: "veículo com alarme",
  veiculoComLicenciamentoProvisorio: "licenciamento provisório",
  veiculoComPendenciaDeEmissaoCrv: "pendência de emissão de CRV",
  veiculoComRestricaoExtrajudicial: "restrição extrajudicial",
  veiculoComRestricaoImpeditivaNoDetran: "restrição impeditiva no Detran",
  veiculoComRestricaoJudicial: "restrição judicial",
  veiculoComRestricaoNaReceitaFederal: "restrição na Receita Federal",
  veiculoComRestricaoPgfn: "restrição na PGFN",
  veiculoComRouboFurto: "roubo/furto",
  veiculoSemAtpv: "sem ATPV",
  veiculoTemAutorizacaoTransferenciaParaEstabelecimentoDiferenteDoEstabelecimentoConsultante:
    "autorizado para outro estabelecimento",
  veiculoTemComunicacaoDeVendaParaCompradorDiferenteDoEstabelecimentoConsultante:
    "comunicação de venda para outro comprador",
  veiculoTemIntencaoDeVendaParaCompradorDiferenteDoEstabelecimentoConsultante: "intenção de venda para outro comprador",
};

export type Aptidao = {
  apto: boolean | null;
  motivos: string[];
  detranFalhou: boolean;
  debitos: { existe: boolean; total: number; boletos: { vencimento: string; valor: number; codigoBarras: string }[] };
};

/** Resume a resposta de /api/aptidao-veiculo-estoque. */
export function resumirAptidao(body: unknown): Aptidao {
  const b = (body ?? {}) as Record<string, unknown>;
  const diag = (b.diagnostico ?? {}) as Record<string, unknown>;
  const motivos = new Set<string>();
  for (const [k, rotulo] of Object.entries(MOTIVO_APTIDAO)) if (diag[k] === true) motivos.add(rotulo);
  for (const m of Array.isArray(diag.motivosParaNaoAptidao) ? diag.motivosParaNaoAptidao : [])
    if (typeof m === "string" && m.trim()) motivos.add(m.trim());
  const deb = (b.informacoesDebitos ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const total =
    num(deb.valorDebitoIpva) +
    num(deb.valorDebitoLicenciamento) +
    num(deb.valorDebitoMultas) +
    num(deb.valorDebitoDpvat) +
    num(deb.valorTaxasEDebitosDiversos);
  const boletos = (Array.isArray(deb.boletos) ? deb.boletos : []).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      vencimento: String(o.dataVencimentoBoleto ?? ""),
      valor: num(o.valorBoleto),
      codigoBarras: String(o.numeroCodigoBarras ?? ""),
    };
  });
  return {
    apto: typeof diag.veiculoApto === "boolean" ? diag.veiculoApto : null,
    motivos: [...motivos],
    detranFalhou: b.comunicacaoComDetranFalhou === true,
    debitos: { existe: deb.existemDebitos === true || total > 0, total: Math.round(total * 100) / 100, boletos },
  };
}

/** Retira do que vai para o log os campos grandes (fotos/PDF em base64). */
export function semAnexos(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(semAnexos);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>))
      o[k] = typeof x === "string" && x.length > 500 && /base64/i.test(k) ? `[${Math.round((x.length * 3) / 4 / 1024)} KB]` : semAnexos(x);
    return o;
  }
  return v;
}
