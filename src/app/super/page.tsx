import Link from "next/link";
import { notFound } from "next/navigation";
import { getSystemLock, PAYMENT_BLOCK_MESSAGE } from "@/lib/system-lock";
import { formatDate } from "@/lib/format";
import {
  bootstrapAllowed,
  currentSuperAdmin,
  listPromotableUsers,
  listSuperAdmins,
  superGateOpen,
  superPassword,
} from "@/lib/super-admin";
import { listOnlineUsers, listRecentLogins, loginSummary } from "@/lib/presence";
import { Badge, Card, CardHeader } from "@/components/ui";
import OnlineUsers from "./OnlineUsers";
import {
  DemoteButton,
  GateForm,
  MaintenanceButton,
  MyAccountForm,
  NewSuperAdminForm,
  PaymentBlockForm,
  PromoteUserForm,
} from "./SuperForms";
import { closeSuperGateAction, openSuperGateAction } from "./actions";

export const dynamic = "force-dynamic";

/** Data e hora do acesso no fuso da loja. */
const dataHora = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/**
 * Painel do dono do sistema (Super Admin) — tela OCULTA. É daqui que se
 * suspende o acesso da loja por falta de pagamento.
 *
 * Quem entra, nesta ordem:
 *  1. quem já está logado como Super Admin;
 *  2. quem digitou a senha mestra da instalação (`SUPER_ADMIN_PASSWORD`),
 *     quando ela estiver configurada — porta de emergência, opcional;
 *  3. o administrador logado, ENQUANTO a instalação não tiver nenhum Super
 *     Admin: é o primeiro cadastro, feito pelo próprio sistema. Criado o
 *     primeiro, essa porta fecha para sempre.
 *
 * Fora desses casos a rota devolve 404 — nem para quem descobrir o endereço.
 */
export default async function SuperPage() {
  const aberto = await superGateOpen();
  // Instalação ainda sem nenhum Super Admin: o administrador logado cadastra o
  // primeiro aqui mesmo. Depois disso a porta fecha para sempre.
  const primeiroCadastro = !aberto && (await bootstrapAllowed());

  if (!aberto && !primeiroCadastro) {
    // Sem senha mestra configurada e sem primeiro cadastro pendente, a tela
    // não existe — nem para quem descobrir o endereço.
    if (!superPassword()) notFound();
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
        <Card className="w-full p-8">
          <p className="text-3xl">🛡️</p>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Área restrita</h1>
          <p className="mt-1 mb-5 text-sm text-slate-500">
            Informe a senha mestra da instalação para continuar.
          </p>
          <GateForm action={openSuperGateAction} />
        </Card>
      </div>
    );
  }

  // Primeiro cadastro: só o formulário de criação, nada de bloqueio.
  if (primeiroCadastro) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900">🛡️ Cadastrar o Super Admin</h1>
        <p className="mt-1 text-sm text-slate-500">
          Esta instalação ainda não tem o perfil do dono do sistema.
        </p>

        <Card className="mt-5 border-amber-300">
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <p className="font-semibold">Faça isto agora, antes de entregar o sistema ao cliente.</p>
            <p className="mt-1">
              Enquanto não existir nenhum Super Admin, qualquer administrador desta instalação pode criar
              o primeiro por esta tela. <strong>Assim que você criar o seu, esta porta se fecha</strong> — daí
              em diante só entra quem já é Super Admin (ou quem tiver a senha mestra da instalação).
            </p>
          </div>
          <div className="space-y-5 p-5">
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-800">
                Promover um usuário já cadastrado
              </p>
              <PromoteUserForm usuarios={await listPromotableUsers()} />
            </div>

            <div className="border-t border-slate-200 pt-5">
              <p className="mb-3 text-sm font-semibold text-slate-800">Ou criar um login novo</p>
              <NewSuperAdminForm />
            </div>
          </div>
        </Card>

        <p className="mt-4 text-xs text-slate-500">
          Promovendo a sua própria conta de administrador, o menu do dono do sistema — Painel Super Admin,
          Assinatura, Uso de IA e o bloqueio — aparece assim que a página recarregar.
        </p>
      </div>
    );
  }

  const [logado, lock, supers, promoveis, online, acessos, resumo] = await Promise.all([
    currentSuperAdmin(),
    getSystemLock(),
    listSuperAdmins(),
    listPromotableUsers(),
    listOnlineUsers(),
    listRecentLogins(12),
    loginSummary(),
  ]);
  const euNaLista = supers.find((s) => s.id === logado?.id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🛡️ Painel Super Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Área do dono do sistema. Invisível para a loja — nem o administrador enxerga.
          </p>
        </div>
        <form action={closeSuperGateAction}>
          <button type="submit" className="text-sm text-slate-500 hover:text-slate-800">
            Sair da área restrita
          </button>
        </form>
      </div>

      <Card className="border-rose-200">
        <CardHeader
          title="Acesso da loja"
          description="Suspensão por falta de pagamento: para todos, inclusive o administrador."
          action={
            lock.paymentBlocked ? (
              <Badge tone="danger">Suspenso</Badge>
            ) : (
              <Badge tone="success">Liberado</Badge>
            )
          }
        />
        <div className="space-y-4 p-5">
          {lock.paymentBlocked && lock.paymentBlockedAt ? (
            <p className="text-xs text-slate-500">
              Suspenso em {formatDate(lock.paymentBlockedAt)}
              {lock.paymentBlockedMessage ? ` · Mensagem: "${lock.paymentBlockedMessage}"` : ""}
            </p>
          ) : null}
          <PaymentBlockForm
            bloqueado={lock.paymentBlocked}
            mensagem={lock.paymentBlockedMessage || PAYMENT_BLOCK_MESSAGE}
          />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Manutenção"
          description="Diferente da suspensão: o administrador da loja continua trabalhando; os demais veem o aviso."
          action={lock.locked ? <Badge tone="warning">Em manutenção</Badge> : null}
        />
        <div className="p-5">
          <MaintenanceButton locked={lock.locked} />
        </div>
      </Card>

      {logado ? (
        <Card className="mt-4">
          <CardHeader
            title="Minha conta"
            description="Seus dados de acesso — a conta do dono do sistema não aparece na tela de Usuários."
            action={<Badge tone="info">Super Admin</Badge>}
          />
          <div className="space-y-4 p-5">
            <p className="text-xs text-slate-500">
              Entrando agora como <strong>{logado.name}</strong> ({logado.email})
              {euNaLista?.createdAt ? ` · Super Admin desde ${formatDate(euNaLista.createdAt)}` : ""}
            </p>
            <MyAccountForm conta={{ name: logado.name, email: logado.email }} />
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Este perfil tem <strong>acesso total</strong> ao sistema: não usa lista de permissões nem
              perfil de acesso, e a senha mestra do administrador da loja não abre a sua conta.
            </p>
          </div>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Quem está no sistema"
          description="Atualiza sozinho. Quem fecha a aba sai da lista em até 2 minutos; quem clica em Sair, na hora."
          action={
            online.length > 0 ? (
              <Badge tone="success">{online.length} online</Badge>
            ) : (
              <Badge tone="default">Ninguém online</Badge>
            )
          }
        />
        <div className="space-y-5 p-5">
          <OnlineUsers
            eu={logado?.id ?? null}
            users={online.map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email,
              role: u.role,
              profileName: u.profileName,
              lastSeenAt: u.lastSeenAt.toISOString(),
            }))}
          />

          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">Últimos acessos</p>
              <Link href="/super/acessos" className="text-xs font-medium text-blue-700 hover:underline">
                Ver o histórico completo →
              </Link>
            </div>
            {acessos.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Nenhum acesso registrado ainda. O histórico começa a partir de agora — entradas
                anteriores a esta atualização não foram gravadas.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {acessos.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {a.name}
                          {a.online ? (
                            <span className="ml-2 text-xs font-normal text-emerald-700">· online</span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {a.email}
                          {a.device ? ` · ${a.device}` : ""}
                          {a.ip ? ` · ${a.ip}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">
                        {dataHora(a.at)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500">
                  {resumo.semana} acesso(s) nos últimos 7 dias · {resumo.pessoasSemana} pessoa(s)
                  distinta(s) · {resumo.total} no total
                </p>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Super Admins" description="Contas que enxergam esta área." />
        <div className="space-y-4 p-5">
          {supers.length === 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Nenhum Super Admin cadastrado ainda. Crie o primeiro abaixo — enquanto não houver nenhum,
              esta área só abre pela senha mestra.
            </p>
          ) : (
            <ul className="space-y-2">
              {supers.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">
                      {s.name}
                      {logado?.id === s.id ? (
                        <span className="ml-2 text-xs font-normal text-slate-500">(você)</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.email} · desde {formatDate(s.createdAt)}
                      {s.active ? "" : " · inativo"}
                    </p>
                  </div>
                  <DemoteButton id={s.id} nome={s.name} />
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-dashed border-slate-300 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Promover um usuário já cadastrado</p>
            <PromoteUserForm usuarios={promoveis} />
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Criar um login novo</p>
            <NewSuperAdminForm />
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Telas do dono do sistema" />
        <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2">
          {[
            { href: "/super/acessos", label: "🔑 Histórico de acessos" },
            { href: "/sistema/assinatura", label: "💳 Assinatura e contrato" },
            { href: "/sistema/uso", label: "📶 Uso da plataforma" },
            { href: "/sistema/uso-ia", label: "🤖 Uso de IA" },
            { href: "/sistema", label: "🖥️ Backup / zerar sistema" },
            { href: "/sistema/desempenho", label: "⚡ Desempenho" },
            { href: "/parametros", label: "⚙️ Parâmetros da empresa" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <p className="px-5 pb-5 text-xs text-slate-500">
          As telas de sistema só abrem para quem estiver <strong>logado</strong> como Super Admin — a senha
          mestra abre apenas este painel e o histórico de acessos.
        </p>
      </Card>
    </div>
  );
}
