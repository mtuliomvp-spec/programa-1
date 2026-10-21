import "server-only";
import { Prisma } from "@prisma/client";

/**
 * O mapa das tabelas para o backup, lido do próprio Prisma (DMMF).
 *
 * Antes a lista de tabelas era escrita à mão e ficou para trás: 27 das 57
 * tabelas (combos, anexos dos títulos, notas fiscais, devoluções, Renave…) não
 * iam no arquivo, e a restauração quebrava porque títulos apontavam para combos
 * que não existiam. Lendo do schema, toda tabela nova entra sozinha.
 */

export type CampoBackup = {
  nome: string;
  coluna: string;
  tipo: string;
  obrigatorio: boolean;
  lista: boolean;
};

export type ModeloBackup = {
  nome: string;
  /** Nome do delegate no client (`prisma.vehicleCost`). */
  delegate: string;
  /** Nome da tabela no banco (o @@map). */
  tabela: string;
  campos: CampoBackup[];
  /** Campos de arquivo (Bytes): vão à parte, um por um. */
  bytes: string[];
  json: string[];
  /** Chaves estrangeiras para a própria tabela (sócio dentro de sócio). */
  autoRef: string[];
  /** Tabelas de que esta depende (precisam entrar antes). */
  deps: string[];
};

const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const TODOS: ModeloBackup[] = Prisma.dmmf.datamodel.models.map((m) => {
  const campos = m.fields
    .filter((f) => f.kind === "scalar" || f.kind === "enum")
    .map((f) => ({
      nome: f.name,
      coluna: (f as { dbName?: string | null }).dbName || f.name,
      tipo: f.type,
      obrigatorio: f.isRequired,
      lista: f.isList,
    }));
  const rel = m.fields.filter((f) => f.kind === "object" && (f.relationFromFields?.length ?? 0) > 0);
  return {
    nome: m.name,
    delegate: minuscula(m.name),
    tabela: m.dbName || m.name,
    campos,
    bytes: campos.filter((c) => c.tipo === "Bytes").map((c) => c.nome),
    json: campos.filter((c) => c.tipo === "Json").map((c) => c.nome),
    autoRef: rel.filter((f) => f.type === m.name).flatMap((f) => f.relationFromFields ?? []),
    deps: [...new Set(rel.map((f) => f.type).filter((t) => t !== m.name))],
  };
});

/**
 * Ordem de gravação: pais antes dos filhos. Perfis e usuários vêm primeiro —
 * restaurando o backup completo, é o usuário que volta a existir logo.
 */
function ordenar(modelos: ModeloBackup[]): ModeloBackup[] {
  const prioridade = ["Profile", "User"];
  const pendentes = [...modelos].sort((a, b) => {
    const pa = prioridade.indexOf(a.nome);
    const pb = prioridade.indexOf(b.nome);
    if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return a.nome.localeCompare(b.nome);
  });
  const feitos = new Set<string>();
  const saida: ModeloBackup[] = [];
  while (pendentes.length) {
    const i = pendentes.findIndex((m) => m.deps.every((d) => feitos.has(d)));
    // Ciclo entre tabelas (não existe hoje): segue na ordem para não travar.
    const [m] = pendentes.splice(i === -1 ? 0 : i, 1);
    feitos.add(m.nome);
    saida.push(m);
  }
  return saida;
}

export const MODELOS_BACKUP = ordenar(TODOS);

export const modeloBackup = (nome: string) => MODELOS_BACKUP.find((m) => m.nome === nome) ?? null;

/**
 * Na DEMONSTRAÇÃO, estas tabelas são da instalação e não da loja: a
 * restauração não mexe nelas (usuários, parâmetros, assinatura, acessos). O
 * backup disfarçado nem as leva — exceto os usuários, que vão disfarçados e
 * desativados só porque vendas e títulos apontam para eles.
 */
export const DEMO_PRESERVADAS = new Set([
  "CompanySettings",
  "Profile",
  "User",
  "LoginEvent",
  "LoginThrottle",
  "AccessCode",
  "AiUsage",
  "Subscription",
  "SubscriptionPayment",
  "SubscriptionContract",
]);

export { DOMINIO_IMPORTADO } from "./disfarce";
