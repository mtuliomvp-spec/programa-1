import Link from "next/link";
import { notFound } from "next/navigation";
import { getSystemLock, PAYMENT_BLOCK_MESSAGE } from "@/lib/system-lock";
import { formatDate } from "@/lib/format";
import {
  currentSuperAdmin,
  listSuperAdmins,
  superGateOpen,
  superPassword,
} from "@/lib/super-admin";
import { Badge, Card, CardHeader } from "@/components/ui";
import {
  DemoteButton,
  GateForm,
  MaintenanceButton,
  NewSuperAdminForm,
  PaymentBlockForm,
} from "./SuperForms";
import { closeSuperGateAction, openSuperGateAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Painel do dono do sistema (Super Admin) — tela OCULTA.
 *
 * Não aparece no menu de ninguém da loja e, sem a variável de ambiente
 * `SUPER_ADMIN_PASSWORD` configurada na instalação, a rota nem existe (404).
 * É daqui que se suspende o acesso por falta de pagamento.
 */
export default async function SuperPage() {
  // Sem senha mestra configurada, a tela não existe — nem para quem descobrir
  // o endereço.
  if (!superPassword()) notFound();

  const aberto = await superGateOpen();
  if (!aberto) {
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

  const [logado, lock, supers] = await Promise.all([
    currentSuperAdmin(),
    getSystemLock(),
    listSuperAdmins(),
  ]);

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
            <p className="mb-3 text-sm font-semibold text-slate-800">Novo Super Admin</p>
            <NewSuperAdminForm />
          </div>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Telas do dono do sistema" />
        <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2">
          {[
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
          Essas telas só abrem para quem estiver <strong>logado</strong> como Super Admin — a senha mestra
          abre apenas este painel.
        </p>
      </Card>
    </div>
  );
}
