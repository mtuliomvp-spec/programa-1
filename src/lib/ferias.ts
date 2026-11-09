/**
 * Férias e rescisão — regras da CLT usadas pela Folha de pagamento.
 *
 * Puro (sem banco): períodos aquisitivos, saldo de dias, quando as férias vencem
 * e ESTIMATIVAS de valores. O valor oficial (com INSS/IRRF, médias, faltas)
 * continua vindo da contabilidade — as estimativas servem para a loja se
 * planejar e conferir o recibo.
 *
 * - Período aquisitivo: 12 meses a partir da admissão (art. 130).
 * - Período concessivo: os 12 meses seguintes; as férias têm de ser gozadas
 *   nele, senão os dias que passarem do prazo são pagos em dobro (art. 134/137).
 * - Aviso de férias: 30 dias antes (art. 135); pagamento: 2 dias antes (art. 145).
 * - Rescisão: pagamento em até 10 dias do término (art. 477, § 6º).
 */

const DIA = 24 * 60 * 60 * 1000;

/** Data só com dia (meio-dia UTC), para comparar sem fuso. */
export function soDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
}

export function somaDias(d: Date, dias: number): Date {
  return soDia(new Date(soDia(d).getTime() + dias * DIA));
}

/** Mesmo dia `anos` depois (29/02 cai em 28/02 nos anos comuns). */
export function somaAnos(d: Date, anos: number): Date {
  const y = d.getUTCFullYear() + anos;
  const m = d.getUTCMonth();
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), ultimo), 12));
}

export function diasEntre(a: Date, b: Date): number {
  return Math.round((soDia(b).getTime() - soDia(a).getTime()) / DIA);
}

export const mesmoDia = (a: Date, b: Date) => soDia(a).getTime() === soDia(b).getTime();

/** Mesmo dia `meses` depois (dia que não existe cai no último do mês). */
export function somaMeses(d: Date, meses: number): Date {
  const total = d.getUTCMonth() + meses;
  const y = d.getUTCFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), ultimo), 12));
}

/**
 * "Avos": meses completos entre `inicio` e `fim` (inclusive), contando também a
 * fração final de 15 dias ou mais. No máximo 12.
 */
export function avos(inicio: Date, fim: Date): number {
  const a = soDia(inicio);
  const b = soDia(fim);
  if (b < a) return 0;
  let meses = 0;
  while (meses < 12) {
    if (somaDias(somaMeses(a, meses + 1), -1) <= b) {
      meses++;
      continue;
    }
    if (diasEntre(somaMeses(a, meses), b) + 1 >= 15) meses++;
    break;
  }
  return meses;
}

export type FeriasLancadas = {
  aquisitivoInicio: Date;
  dias: number;
  abonoDias: number;
  /** Início do gozo: férias agendadas para depois do desligamento não contam como gozadas. */
  gozoInicio?: Date;
};

export type SituacaoPeriodo = "EM_AQUISICAO" | "A_GOZAR" | "VENCE_LOGO" | "VENCIDA" | "GOZADA";

export type PeriodoAquisitivo = {
  inicio: Date;
  fim: Date;
  /** Fim do período concessivo: as férias têm de terminar até aqui. */
  concessivoFim: Date;
  /** Dias já usados (gozo + abono) e o que falta (direito de 30 dias). */
  usados: number;
  saldo: number;
  /** Último dia para COMEÇAR o gozo do saldo sem pagar dobra. */
  iniciarAte: Date;
  /** Data limite para avisar o funcionário (30 dias antes do início). */
  avisarAte: Date;
  situacao: SituacaoPeriodo;
};

/** Antecedência do alerta de "vence logo" (dias até o último dia para começar). */
export const ALERTA_FERIAS_DIAS = 60;

/**
 * Períodos aquisitivos do funcionário, da admissão até hoje (ou até o
 * desligamento), com o saldo e a situação de cada um.
 */
export function periodosAquisitivos(
  admissao: Date,
  ferias: FeriasLancadas[],
  hoje: Date,
  desligamento?: Date | null,
): PeriodoAquisitivo[] {
  const ate = soDia(desligamento && desligamento < hoje ? desligamento : hoje);
  const out: PeriodoAquisitivo[] = [];
  for (let k = 0; k < 60; k++) {
    const inicio = somaAnos(soDia(admissao), k);
    if (inicio > ate) break;
    const fim = somaDias(somaAnos(soDia(admissao), k + 1), -1);
    const concessivoFim = somaDias(somaAnos(soDia(admissao), k + 2), -1);
    const usados = ferias
      .filter((f) => mesmoDia(f.aquisitivoInicio, inicio))
      .reduce((s, f) => s + f.dias + f.abonoDias, 0);
    const saldo = Math.max(0, 30 - usados);
    const iniciarAte = somaDias(concessivoFim, -(Math.max(saldo, 1) - 1));
    let situacao: SituacaoPeriodo;
    if (saldo === 0) situacao = "GOZADA";
    else if (ate <= fim) situacao = "EM_AQUISICAO";
    else if (ate > iniciarAte) situacao = "VENCIDA";
    else if (diasEntre(ate, iniciarAte) <= ALERTA_FERIAS_DIAS) situacao = "VENCE_LOGO";
    else situacao = "A_GOZAR";
    out.push({ inicio, fim, concessivoFim, usados, saldo, iniciarAte, avisarAte: somaDias(iniciarAte, -30), situacao });
  }
  return out;
}

/** O período que pede atenção agora: o mais antigo com saldo já adquirido. */
export function periodoEmAberto(periodos: PeriodoAquisitivo[]): PeriodoAquisitivo | null {
  return periodos.find((p) => p.saldo > 0 && p.situacao !== "EM_AQUISICAO") ?? null;
}

export const ROTULO_SITUACAO: Record<SituacaoPeriodo, string> = {
  EM_AQUISICAO: "Em aquisição",
  A_GOZAR: "A gozar",
  VENCE_LOGO: "Vence logo",
  VENCIDA: "Vencida (dobro)",
  GOZADA: "Gozada",
};

export const TOM_SITUACAO: Record<SituacaoPeriodo, "default" | "info" | "warning" | "danger" | "success"> = {
  EM_AQUISICAO: "default",
  A_GOZAR: "info",
  VENCE_LOGO: "warning",
  VENCIDA: "danger",
  GOZADA: "success",
};

/** Fim do gozo: início + dias − 1. */
export function fimDoGozo(inicio: Date, dias: number): Date {
  return somaDias(inicio, Math.max(dias, 1) - 1);
}

/** Pagamento das férias: 2 dias antes do início do gozo (art. 145). */
export function pagamentoDasFerias(inicioGozo: Date): Date {
  return somaDias(inicioGozo, -2);
}

/** Pagamento da rescisão: 10 dias após o término (art. 477, § 6º). */
export function pagamentoDaRescisao(desligamento: Date): Date {
  return somaDias(desligamento, 10);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export type ItemEstimado = { rotulo: string; valor: number; nota?: string };

/** Estimativa das férias (sem INSS/IRRF): dias de gozo, 1/3 e abono. */
export function estimativaFerias(salario: number, dias: number, abonoDias: number): ItemEstimado[] {
  const ferias = r2((salario * dias) / 30);
  const itens: ItemEstimado[] = [
    { rotulo: `Férias (${dias} dias)`, valor: ferias },
    { rotulo: "1/3 constitucional", valor: r2(ferias / 3) },
  ];
  if (abonoDias > 0) {
    const abono = r2((salario * abonoDias) / 30);
    itens.push({ rotulo: `Abono pecuniário (${abonoDias} dias vendidos)`, valor: abono });
    itens.push({ rotulo: "1/3 sobre o abono", valor: r2(abono / 3) });
  }
  return itens;
}

export type TipoRescisao = "SEM_JUSTA_CAUSA" | "PEDIDO_DEMISSAO" | "JUSTA_CAUSA" | "ACORDO" | "FIM_CONTRATO";
export type AvisoPrevio = "TRABALHADO" | "INDENIZADO" | "DISPENSADO" | "NAO_SE_APLICA";

export const ROTULO_TIPO_RESCISAO: Record<TipoRescisao, string> = {
  SEM_JUSTA_CAUSA: "Dispensa sem justa causa",
  PEDIDO_DEMISSAO: "Pedido de demissão",
  JUSTA_CAUSA: "Dispensa por justa causa",
  ACORDO: "Acordo (art. 484-A)",
  FIM_CONTRATO: "Fim do contrato de experiência",
};

export const ROTULO_AVISO: Record<AvisoPrevio, string> = {
  TRABALHADO: "Trabalhado",
  INDENIZADO: "Indenizado",
  DISPENSADO: "Dispensado",
  NAO_SE_APLICA: "Não se aplica",
};

/** Dias de aviso prévio: 30 + 3 por ano completo, até 90 (Lei 12.506/2011). */
export function diasDeAviso(admissao: Date, desligamento: Date): number {
  let anos = 0;
  while (somaAnos(soDia(admissao), anos + 1) <= soDia(desligamento)) anos++;
  return Math.min(90, 30 + 3 * anos);
}

/**
 * Estimativa das verbas rescisórias (bruto, sem INSS/IRRF e sem médias de
 * variáveis). O aviso prévio indenizado projeta o fim do contrato para o 13º e
 * as férias proporcionais.
 */
export function estimativaRescisao(i: {
  salario: number;
  admissao: Date;
  desligamento: Date;
  tipo: TipoRescisao;
  aviso: AvisoPrevio;
  ferias: FeriasLancadas[];
}): { itens: ItemEstimado[]; total: number; multaFgts: number; diasAviso: number } {
  const { salario, tipo } = i;
  const deslig = soDia(i.desligamento);
  const itens: ItemEstimado[] = [];
  const justa = tipo === "JUSTA_CAUSA";

  const diaDoMes = Math.min(deslig.getUTCDate(), 30);
  itens.push({ rotulo: `Saldo de salário (${diaDoMes} dias)`, valor: r2((salario * diaDoMes) / 30) });

  const diasAviso = diasDeAviso(i.admissao, deslig);
  let projetado = deslig;
  if (i.aviso === "INDENIZADO" && (tipo === "SEM_JUSTA_CAUSA" || tipo === "ACORDO")) {
    const dias = tipo === "ACORDO" ? Math.round(diasAviso / 2) : diasAviso;
    itens.push({
      rotulo: `Aviso prévio indenizado (${dias} dias)`,
      valor: r2((salario * dias) / 30),
      nota: tipo === "ACORDO" ? "No acordo, metade do aviso." : `30 dias + 3 por ano completo (até 90).`,
    });
    projetado = somaDias(deslig, diasAviso);
  }

  if (!justa) {
    const inicioAno = new Date(Date.UTC(projetado.getUTCFullYear(), 0, 1, 12));
    const base = soDia(i.admissao) > inicioAno ? soDia(i.admissao) : inicioAno;
    const meses = avos(base, projetado);
    itens.push({
      rotulo: `13º proporcional (${meses}/12)`,
      valor: r2((salario * meses) / 12),
      nota: "Desconte a 1ª parcela, se já foi paga.",
    });
  }

  // Férias: períodos já completos com saldo (vencidas ou não) e o proporcional.
  // Férias marcadas para depois do desligamento não foram gozadas: viram verba.
  const gozadas = i.ferias.filter((f) => !f.gozoInicio || soDia(f.gozoInicio) <= deslig);
  const periodos = periodosAquisitivos(i.admissao, gozadas, deslig);
  for (const p of periodos) {
    if (p.saldo === 0 || p.fim >= deslig) continue;
    const dobro = deslig > p.iniciarAte;
    const valor = r2(((salario * p.saldo) / 30) * (4 / 3) * (dobro ? 2 : 1));
    itens.push({
      rotulo: `Férias ${dobro ? "vencidas em dobro" : "vencidas"} + 1/3 (${p.saldo} dias)`,
      valor,
      nota: `Período ${p.inicio.toISOString().slice(0, 10).split("-").reverse().join("/")}`,
    });
  }
  if (!justa) {
    const atual = periodos.at(-1);
    if (atual && atual.fim >= deslig) {
      const meses = avos(atual.inicio, projetado);
      if (meses > 0) {
        const valor = r2(((salario * meses) / 12) * (4 / 3));
        itens.push({ rotulo: `Férias proporcionais + 1/3 (${meses}/12)`, valor });
      }
    }
  }

  // Multa do FGTS sobre o saldo estimado (8% ao mês, com o 13º).
  let multaFgts = 0;
  if (tipo === "SEM_JUSTA_CAUSA" || tipo === "ACORDO") {
    const mesesTrabalhados = Math.max(1, Math.round(diasEntre(i.admissao, deslig) / 30.44));
    const saldoFgts = salario * 0.08 * mesesTrabalhados * (13 / 12);
    multaFgts = r2(saldoFgts * (tipo === "ACORDO" ? 0.2 : 0.4));
  }

  const total = r2(itens.reduce((s, it) => s + it.valor, 0));
  return { itens, total, multaFgts, diasAviso };
}
