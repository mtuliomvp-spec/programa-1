/**
 * Controle de acesso por usuário — granular por AÇÃO dentro de cada módulo
 * (no estilo Agrasty). Administradores acessam tudo; operadores só o que
 * estiver marcado nas permissões (tela Usuários).
 *
 * As permissões são guardadas como strings "modulo.acao" (ex.: "estoque.criar").
 * Para compatibilidade, uma permissão com só o nome do módulo (ex.: "estoque")
 * concede TODAS as ações daquele módulo (formato antigo).
 */

export type ModuleAction = { acao: string; label: string };
export type ModuleConfig = { key: string; label: string; acoes: ModuleAction[] };

const VER: ModuleAction = { acao: "visualizar", label: "Visualizar" };
const CRIAR: ModuleAction = { acao: "criar", label: "Criar" };
const EDITAR: ModuleAction = { acao: "editar", label: "Editar" };
const EXCLUIR: ModuleAction = { acao: "excluir", label: "Excluir" };

export const MODULES: ModuleConfig[] = [
  {
    key: "dashboard",
    label: "Painel inicial (Dashboard)",
    acoes: [{ acao: "visualizar", label: "Ver o painel inicial" }],
  },
  {
    key: "estoque",
    label: "Estoque de veículos",
    acoes: [
      VER,
      { acao: "criar", label: "Cadastrar veículo" },
      EDITAR,
      EXCLUIR,
      { acao: "custos", label: "Lançar custos" },
      { acao: "sinal", label: "Registrar sinal / entrada antecipada" },
      { acao: "debitos", label: "Consultar/importar débitos" },
      { acao: "publicar", label: "Postar na vitrine" },
      { acao: "comunicacao", label: "Anexar comunicação de venda / documentos" },
      { acao: "crlv", label: "Anexar CRLV" },
      // Preço de compra, custo total, margem e o resultado da venda na ficha.
      { acao: "lucro", label: "Ver resultado (lucro/prejuízo) do veículo" },
      // Separado do "lucro" de propósito: dá para liberar o custo na lista sem
      // mostrar o lucro da venda na ficha do carro, e vice-versa.
      { acao: "vercusto", label: "Ver o custo dos veículos na lista do estoque" },
      // Levar o custo para fora (papel/arquivo) é decisão à parte de vê-lo na tela.
      { acao: "pdfcusto", label: "Gerar o PDF do estoque com o custo" },
    ],
  },
  {
    key: "avaliacoes",
    label: "Veículos avaliados",
    acoes: [
      { acao: "visualizar", label: "Ver avaliações" },
      { acao: "criar", label: "Fazer avaliação" },
      { acao: "editar", label: "Editar avaliação" },
      { acao: "excluir", label: "Excluir avaliação" },
      { acao: "conferir", label: "Conferência de entrega" },
    ],
  },
  {
    key: "vendas",
    label: "Vendas",
    acoes: [
      VER,
      { acao: "prevenda", label: "Criar/editar pré-venda" },
      { acao: "registrar", label: "Registrar venda (efetivar)" },
      { acao: "cancelar", label: "Cancelar venda" },
      { acao: "foto", label: "Foto do cliente (antifraude)" },
    ],
  },
  {
    key: "pecas",
    label: "Peças",
    acoes: [
      VER,
      CRIAR,
      EDITAR,
      EXCLUIR,
      { acao: "vender", label: "Vender peça" },
      { acao: "repor", label: "Repor estoque" },
    ],
  },
  {
    key: "compras",
    label: "Solicitações de compra",
    acoes: [
      VER,
      { acao: "criar", label: "Criar solicitação" },
      { acao: "aprovar", label: "Aprovar / concluir" },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro (contas, caixa, conciliação)",
    acoes: [
      VER,
      { acao: "criar", label: "Lançar conta a pagar/receber" },
      { acao: "editar", label: "Editar títulos lançados" },
      { acao: "pagar", label: "Registrar pagamento (baixa)" },
      { acao: "receber", label: "Registrar recebimento (baixa)" },
      // Perdoar valor é diferente de receber: o que sobra vira custo/perda.
      { acao: "desconto", label: "Dar desconto (baixar diferença como perda)" },
      // Mexer na data de uma baixa já feita é correção contábil, não operação.
      { acao: "corrigirdata", label: "Corrigir data de um pagamento/recebimento já feito" },
      { acao: "contas", label: "Gerenciar contas/transferências" },
      { acao: "conciliar", label: "Conciliação bancária" },
      { acao: "fechar", label: "Fechamento mensal (fechar mês)" },
      { acao: "reabrir", label: "Fechamento mensal (reabrir mês)" },
    ],
  },
  {
    key: "combos",
    label: "Combos de pagamento",
    acoes: [
      { acao: "visualizar", label: "Ver combos" },
      { acao: "criar", label: "Montar combo (adicionar títulos / solicitar)" },
      { acao: "aprovar", label: "Aprovar e pagar combo" },
    ],
  },
  {
    key: "administrativo",
    label: "Administrativo (folha, capital, combustíveis)",
    acoes: [
      VER,
      { acao: "folha", label: "Folha de pagamento" },
      { acao: "capital", label: "Capital dos sócios" },
      { acao: "combustiveis", label: "Combustíveis" },
      { acao: "consorcios", label: "Consórcios" },
      { acao: "centros", label: "Centros de custo" },
    ],
  },
  {
    key: "relatorios",
    label: "Relatórios",
    acoes: [VER],
  },
  {
    key: "cadastros",
    label: "Cadastros (clientes e fornecedores)",
    acoes: [
      VER,
      CRIAR,
      EDITAR,
      EXCLUIR,
      // Faxina de duplicados: junta cadastros e apaga os repetidos. Separado do
      // "excluir" comum, que é largo demais para essa operação em lote.
      { acao: "unificar", label: "Unificar cadastros repetidos" },
    ],
  },
  {
    key: "documentos_empresa",
    label: "Documentos da empresa",
    acoes: [VER, CRIAR, EXCLUIR],
  },
];

export type ModuleKey = (typeof MODULES)[number]["key"];

export const ALL_MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

/** Todas as permissões granulares possíveis ("modulo.acao"). */
export const ALL_PERMISSIONS: string[] = MODULES.flatMap((m) =>
  m.acoes.map((a) => `${m.key}.${a.acao}`),
);

/** Permissões padrão de um novo operador: só visualizar cada módulo. */
export const DEFAULT_OPERATOR_PERMISSIONS: string[] = MODULES.map((m) => `${m.key}.visualizar`);

/** Acesso ao módulo (ver o item no menu / entrar): precisa de "visualizar". */
export function hasModuleAccess(
  user: { role: "ADMIN" | "OPERADOR" | "SUPER_ADMIN"; permissions: string[] },
  moduleKey: ModuleKey,
): boolean {
  // Super Admin (dono do sistema) enxerga tudo, como o administrador.
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  return (
    user.permissions.includes(`${moduleKey}.visualizar`) ||
    user.permissions.includes(moduleKey) // formato antigo: módulo inteiro
  );
}

/** Pode executar uma ação específica dentro de um módulo. */
export function can(
  user: { role: "ADMIN" | "OPERADOR" | "SUPER_ADMIN"; permissions: string[] },
  moduleKey: ModuleKey,
  action: string,
): boolean {
  // Super Admin (dono do sistema) enxerga tudo, como o administrador.
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  return (
    user.permissions.includes(`${moduleKey}.${action}`) ||
    user.permissions.includes(moduleKey) // formato antigo concede tudo
  );
}
