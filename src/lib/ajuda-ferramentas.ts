import "server-only";
import { prisma } from "@/lib/prisma";
import { can, hasModuleAccess } from "@/lib/permissions";
import { getPendencias } from "@/lib/pendencias";
import { getAccountsWithBalances } from "@/lib/accounts";
import { effectivePayableStatus, effectiveReceivableStatus } from "@/lib/status";
import { houseNameKeys, situacaoDocumental, seloCrlv, seloFotoCliente } from "@/lib/doc-owner";
import { formatDate } from "@/lib/format";

/**
 * Consultas que o assistente do chat de ajuda pode fazer nos dados da loja.
 *
 * SÓ LEITURA, e cada uma existe apenas para quem tem a permissão da tela de
 * onde ela vem: o assistente nunca mostra o que o usuário não veria no menu.
 * A ferramenta nem é oferecida à IA quando falta a permissão — e o executor
 * confere de novo (defesa dupla).
 */

type UserPerm = { role: "ADMIN" | "OPERADOR" | "SUPER_ADMIN"; permissions: string[] };

type Ferramenta = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Rótulo curto mostrado no chat enquanto consulta. */
  rotulo: string;
  pode: (u: UserPerm) => boolean;
  run: (u: UserPerm, input: Record<string, unknown>) => Promise<unknown>;
};

const DIA = 86_400_000;
const hoje0 = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};
const txt = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown, def: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def;
const dataIso = (v: unknown): Date | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;
const r2 = (n: number) => Math.round(n * 100) / 100;

const FERRAMENTAS: Ferramenta[] = [
  {
    name: "pendencias",
    rotulo: "pendências",
    description:
      "Lista as pendências da loja (as mesmas da tela Pendências): NF de retorno/seguro a emitir, financiamento/retorno/seguro a receber, contas vencidas, documentação de veículos vendidos, transferências, CRLV, vitrine, pré-vendas. Devolve por assunto a quantidade, o total e os itens mais antigos.",
    input_schema: { type: "object", properties: {} },
    pode: (u) => hasModuleAccess(u, "estoque") || hasModuleAccess(u, "financeiro"),
    run: async (u) => {
      const grupos = await getPendencias({
        estoque: hasModuleAccess(u, "estoque"),
        financeiro: hasModuleAccess(u, "financeiro"),
      });
      return grupos.map((g) => ({
        assunto: g.titulo,
        tela: g.href,
        quantidade: g.itens.length,
        total: r2(g.itens.reduce((s, i) => s + (i.valor ?? 0), 0)) || undefined,
        itens: g.itens.slice(0, 12).map((i) => ({
          item: i.titulo,
          detalhe: i.detalhe,
          valor: i.valor,
          dias: i.dias,
          situacao: i.selo?.texto,
        })),
      }));
    },
  },
  {
    name: "buscar_veiculos",
    rotulo: "estoque",
    description:
      "Procura veículos por placa, marca, modelo ou cor (texto livre) e devolve situação (estoque/reservado/vendido), preço de venda, dias em estoque, consignação, documentação (CRLV/transferência, comunicação de venda, foto do cliente) e, se vendido, a data e o comprador. Sem texto, lista os veículos em estoque.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Placa, marca, modelo ou cor. Vazio = todos." },
        situacao: { type: "string", enum: ["ESTOQUE", "VENDIDO", "TODOS"], description: "Padrão: TODOS." },
      },
    },
    pode: (u) => hasModuleAccess(u, "estoque"),
    run: async (u, input) => {
      const q = txt(input.texto, 40);
      const situacao = input.situacao === "ESTOQUE" || input.situacao === "VENDIDO" ? input.situacao : "TODOS";
      const verCusto = can(u, "estoque", "vercusto");
      const placa = q.replace(/[^a-z0-9]/gi, "").toUpperCase();
      const vs = await prisma.vehicle.findMany({
        where: {
          intermediation: false,
          ...(situacao === "ESTOQUE"
            ? { status: { in: ["ESTOQUE", "RESERVADO"] } }
            : situacao === "VENDIDO"
              ? { status: "VENDIDO" }
              : {}),
          ...(q
            ? {
                OR: [
                  ...(placa.length >= 3 ? [{ plate: { contains: placa, mode: "insensitive" as const } }] : []),
                  { brand: { contains: q, mode: "insensitive" } },
                  { model: { contains: q, mode: "insensitive" } },
                  { color: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: {
          costs: { select: { amount: true, description: true, createdAt: true, capitalBeneficiaryId: true } },
          payables: { select: { description: true, createdAt: true } },
          attachments: { select: { kind: true, description: true, createdAt: true } },
          sale: {
            select: {
              saleDate: true,
              totalAmount: true,
              transferDoneAt: true,
              transferCharged: true,
              transferAmount: true,
              ownerName: true,
              ownerDocument: true,
              customer: { select: { name: true, document: true } },
            },
          },
        },
      });
      const casa = await houseNameKeys();
      return vs.map((v) => {
        const s = situacaoDocumental(v, casa);
        const vendido = v.status === "VENDIDO";
        return {
          veiculo: `${v.brand} ${v.model}${v.version ? ` ${v.version}` : ""}`,
          placa: v.plate,
          ano: `${v.manufactureYear}/${v.modelYear}`,
          km: v.km,
          situacao: v.status,
          consignado: v.consigned || undefined,
          precoVenda: v.salePrice,
          entrada: formatDate(v.entryDate),
          diasEmEstoque: vendido ? undefined : Math.floor((Date.now() - v.entryDate.getTime()) / DIA),
          custoTotal: verCusto
            ? r2(v.purchasePrice + v.costs.filter((c) => !c.capitalBeneficiaryId).reduce((a, c) => a + c.amount, 0))
            : undefined,
          documento: seloCrlv(s).label,
          emNomeDe: s.donoAtual ?? undefined,
          comunicacaoDeVenda: vendido ? (s.hasComunicacao ? "anexada" : "pendente") : undefined,
          fotoDoCliente: vendido ? seloFotoCliente(s).label : undefined,
          venda: v.sale
            ? {
                data: formatDate(v.sale.saleDate),
                comprador: v.sale.customer.name,
                valor: v.sale.totalAmount,
                transferidoEm: v.sale.transferDoneAt ? formatDate(v.sale.transferDoneAt) : undefined,
              }
            : undefined,
          ficha: `/estoque/${v.id}`,
        };
      });
    },
  },
  ...(["pagar", "receber"] as const).map(
    (lado): Ferramenta => ({
      name: lado === "pagar" ? "contas_a_pagar" : "contas_a_receber",
      rotulo: lado === "pagar" ? "contas a pagar" : "contas a receber",
      description:
        lado === "pagar"
          ? "Contas a pagar em aberto: as vencidas ou as que vencem nos próximos N dias, com descrição, fornecedor, vencimento e valor. Aceita filtro por texto (descrição/fornecedor)."
          : "Contas a receber em aberto: as vencidas ou as que vencem nos próximos N dias, com descrição, cliente, vencimento e valor. Aceita filtro por texto (descrição/cliente).",
      input_schema: {
        type: "object",
        properties: {
          situacao: { type: "string", enum: ["vencidas", "a_vencer", "todas_em_aberto"] },
          dias: { type: "number", description: "Para a_vencer: quantos dias à frente (padrão 7, máx. 90)." },
          texto: { type: "string", description: "Filtro opcional por descrição ou nome." },
        },
        required: ["situacao"],
      },
      pode: (u) => hasModuleAccess(u, "financeiro"),
      run: async (_u, input) => {
        const hoje = hoje0();
        const situacao = input.situacao === "vencidas" || input.situacao === "a_vencer" ? input.situacao : "todas_em_aberto";
        const dias = num(input.dias, 7, 1, 90);
        const q = txt(input.texto, 60);
        const dueDate =
          situacao === "vencidas"
            ? { lt: hoje }
            : situacao === "a_vencer"
              ? { gte: hoje, lt: new Date(hoje.getTime() + (dias + 1) * DIA) }
              : undefined;
        const rows =
          lado === "pagar"
            ? (
                await prisma.payable.findMany({
                  where: {
                    status: { not: "PAGO" },
                    ...(dueDate ? { dueDate } : {}),
                    ...(q
                      ? {
                          OR: [
                            { description: { contains: q, mode: "insensitive" } },
                            { supplier: { name: { contains: q, mode: "insensitive" } } },
                          ],
                        }
                      : {}),
                  },
                  orderBy: { dueDate: "asc" },
                  take: 200,
                  select: { description: true, amount: true, dueDate: true, status: true, supplier: { select: { name: true } } },
                })
              ).map((p) => ({
                descricao: p.description,
                nome: p.supplier?.name,
                vencimento: p.dueDate,
                valor: p.amount,
                atrasada: effectivePayableStatus(p.status, p.dueDate) === "ATRASADO",
              }))
            : (
                await prisma.receivable.findMany({
                  where: {
                    status: { not: "RECEBIDO" },
                    ...(dueDate ? { dueDate } : {}),
                    ...(q
                      ? {
                          OR: [
                            { description: { contains: q, mode: "insensitive" } },
                            { customer: { name: { contains: q, mode: "insensitive" } } },
                          ],
                        }
                      : {}),
                  },
                  orderBy: { dueDate: "asc" },
                  take: 200,
                  select: { description: true, amount: true, dueDate: true, status: true, customer: { select: { name: true } } },
                })
              ).map((r) => ({
                descricao: r.description,
                nome: r.customer?.name,
                vencimento: r.dueDate,
                valor: r.amount,
                atrasada: effectiveReceivableStatus(r.status, r.dueDate) === "ATRASADO",
              }));
        return {
          quantidade: rows.length,
          total: r2(rows.reduce((s, r) => s + r.valor, 0)),
          tela: lado === "pagar" ? "/financeiro/a-pagar" : "/financeiro/a-receber",
          itens: rows.slice(0, 25).map((r) => ({ ...r, vencimento: formatDate(r.vencimento) })),
          observacao: rows.length > 25 ? `Mostrando 25 de ${rows.length}; o total considera todas.` : undefined,
        };
      },
    }),
  ),
  {
    name: "saldos_das_contas",
    rotulo: "saldos",
    description:
      "Saldo atual de cada conta financeira da loja (caixas, bancos, aplicações e contas das financeiras — o valor financiado a receber fica na conta da financeira).",
    input_schema: { type: "object", properties: {} },
    pode: (u) => hasModuleAccess(u, "financeiro"),
    run: async () => {
      const contas = (await getAccountsWithBalances()).filter((a) => a.active);
      return {
        tela: "/financeiro/contas",
        contas: contas.map((a) => ({ conta: a.name, tipo: a.type, saldo: r2(a.balance) })),
        totalCaixaEBancos: r2(contas.filter((a) => a.type !== "FINANCEIRA").reduce((s, a) => s + a.balance, 0)),
        totalNasFinanceiras: r2(contas.filter((a) => a.type === "FINANCEIRA").reduce((s, a) => s + a.balance, 0)),
      };
    },
  },
  {
    name: "buscar_vendas",
    rotulo: "vendas",
    description:
      "Vendas concluídas num período (datas AAAA-MM-DD) e/ou por texto (cliente, placa, modelo, vendedor). Devolve a quantidade, a soma e a lista (data, veículo, cliente, valor, forma de pagamento, vendedor).",
    input_schema: {
      type: "object",
      properties: {
        de: { type: "string", description: "Data inicial AAAA-MM-DD (opcional)." },
        ate: { type: "string", description: "Data final AAAA-MM-DD, inclusive (opcional)." },
        texto: { type: "string", description: "Cliente, placa, modelo ou vendedor (opcional)." },
      },
    },
    pode: (u) => hasModuleAccess(u, "vendas"),
    run: async (_u, input) => {
      const de = dataIso(input.de);
      const ateD = dataIso(input.ate);
      const q = txt(input.texto, 60);
      const vendas = await prisma.sale.findMany({
        where: {
          status: "CONCLUIDA",
          ...(de || ateD
            ? { saleDate: { ...(de ? { gte: de } : {}), ...(ateD ? { lt: new Date(ateD.getTime() + DIA) } : {}) } }
            : {}),
          ...(q
            ? {
                OR: [
                  { customer: { name: { contains: q, mode: "insensitive" } } },
                  { sellerName: { contains: q, mode: "insensitive" } },
                  { vehicle: { plate: { contains: q.replace(/[^a-z0-9]/gi, ""), mode: "insensitive" } } },
                  { vehicle: { model: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        orderBy: { saleDate: "desc" },
        take: 300,
        select: {
          saleDate: true,
          totalAmount: true,
          paymentMethod: true,
          sellerName: true,
          customer: { select: { name: true } },
          vehicle: { select: { brand: true, model: true, plate: true } },
        },
      });
      return {
        quantidade: vendas.length,
        total: r2(vendas.reduce((s, v) => s + v.totalAmount, 0)),
        tela: "/vendas",
        vendas: vendas.slice(0, 25).map((v) => ({
          data: formatDate(v.saleDate),
          veiculo: `${v.vehicle.brand} ${v.vehicle.model} · ${v.vehicle.plate}`,
          cliente: v.customer.name,
          valor: v.totalAmount,
          forma: v.paymentMethod,
          vendedor: v.sellerName ?? undefined,
        })),
        observacao: vendas.length > 25 ? `Mostrando 25 de ${vendas.length}; o total considera todas.` : undefined,
      };
    },
  },
];

/** As ferramentas que ESTE usuário pode usar, no formato da API. */
export function ferramentasDoUsuario(u: UserPerm) {
  return FERRAMENTAS.filter((f) => f.pode(u)).map((f) => ({
    name: f.name,
    description: f.description,
    input_schema: f.input_schema,
  }));
}

export function rotuloDaFerramenta(nome: string): string {
  return FERRAMENTAS.find((f) => f.name === nome)?.rotulo ?? nome;
}

/** Executa uma consulta (conferindo a permissão de novo). Devolve JSON em texto. */
export async function executarFerramenta(u: UserPerm, nome: string, input: unknown): Promise<string> {
  const f = FERRAMENTAS.find((x) => x.name === nome);
  if (!f || !f.pode(u)) return JSON.stringify({ erro: "Consulta não permitida para este usuário." });
  try {
    const out = await f.run(u, input && typeof input === "object" ? (input as Record<string, unknown>) : {});
    return JSON.stringify(out).slice(0, 30000);
  } catch (e) {
    console.error("[chat-ajuda] ferramenta", nome, e);
    return JSON.stringify({ erro: "Não foi possível consultar agora." });
  }
}
