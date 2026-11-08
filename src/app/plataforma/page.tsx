import Link from "next/link";
import { listarLojas } from "@/lib/catalogo";
import { acessoAoPainel, servidorDeBancos } from "@/lib/plataforma";
import { hostDoPainel } from "@/lib/tenant";
import { Badge, Card, Field, Input } from "@/components/ui";
import FormPlataforma from "./FormPlataforma";
import { criarLojaAction, publicarDeNovoAction } from "./actions";

export const dynamic = "force-dynamic";

const TOM = { ATIVA: "success", SUSPENSA: "danger", PREPARANDO: "warning" } as const;
const ROTULO = { ATIVA: "Ativa", SUSPENSA: "Suspensa", PREPARANDO: "Em preparo" } as const;

/** Painel da plataforma: lojas assinantes do Fincore360. */
export default async function PlataformaPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  if (!(await acessoAoPainel())) {
    const { erro } = await searchParams;
    return (
      <div className="mx-auto max-w-sm py-24">
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Fincore360 — Plataforma</h1>
          <p className="mt-1 text-sm text-slate-500">Acesso do dono do sistema.</p>
          <div className="mt-4">
            {/* Formulário HTML comum: a rota grava o cookie e volta para cá. */}
            <form method="post" action="/plataforma/entrar" className="space-y-3">
              <Field label="Senha da plataforma">
                <Input name="senha" type="password" autoComplete="current-password" required autoFocus />
              </Field>
              {erro ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">Senha incorreta.</p> : null}
              <button
                type="submit"
                className="inline-flex items-center rounded-lg bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                Entrar
              </button>
            </form>
          </div>
        </Card>
      </div>
    );
  }

  const lojas = await listarLojas();
  const dominio = hostDoPainel()?.replace(/^admin\./, "") ?? "";
  const temServidor = !!servidorDeBancos();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fincore360 — Lojas</h1>
          <p className="text-sm text-slate-500">
            {lojas.length} loja(s). Cada uma tem o próprio banco e o endereço <code>loja.{dominio}</code>.
          </p>
        </div>
        <form method="post" action="/plataforma/sair">
          <button className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Sair</button>
        </form>
      </div>

      <Card>
        <div className="divide-y divide-slate-100">
          {lojas.map((l) => (
            <Link
              key={l.slug}
              href={`/plataforma/${l.slug}`}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block font-medium">{l.nome}</span>
                <span className="block text-xs text-slate-500">
                  {l.slug}.{dominio}
                  {l.hosts.length ? ` · ${l.hosts.join(", ")}` : ""}
                  {l.usaAmbiente ? " · usa as variáveis do projeto" : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {Object.keys(l.segredos).length ? (
                  <span className="text-xs text-slate-500">{Object.keys(l.segredos).length} segredo(s)</span>
                ) : null}
                <Badge tone={TOM[l.status]}>{ROTULO[l.status]}</Badge>
              </span>
            </Link>
          ))}
          {lojas.length === 0 ? <p className="px-5 py-6 text-sm text-slate-500">Nenhuma loja ainda.</p> : null}
        </div>
      </Card>

      {lojas.some((l) => l.status === "PREPARANDO") ? (
        <Card className="p-5">
          <p className="text-sm text-slate-600">
            Lojas em preparo ficam prontas na próxima publicação (ela monta as tabelas e cria o administrador).
          </p>
          <div className="mt-3">
            <FormPlataforma acao={publicarDeNovoAction} botao="Publicar agora" enviando="Pedindo…" variante="secondary" />
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="font-semibold">Nova loja</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          {temServidor
            ? "O banco da loja é criado agora no servidor da plataforma; a próxima publicação monta o sistema e o administrador."
            : "Servidor de bancos não configurado (PLATAFORMA_BANCO_URL): informe a URL de um banco vazio já criado."}
        </p>
        <FormPlataforma acao={criarLojaAction} botao="Criar loja" enviando="Criando…">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome da loja (nome fantasia)" required>
              <Input name="nome" required placeholder="Ex.: Auto Center Silva" />
            </Field>
            <Field label={`Subdomínio (nome.${dominio})`} required>
              <Input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" placeholder="autocentersilva" />
            </Field>
            <Field label="Razão social">
              <Input name="razaoSocial" />
            </Field>
            <Field label="CNPJ">
              <Input name="cnpj" inputMode="numeric" />
            </Field>
            <Field label="Domínios próprios (opcional, separados por vírgula)">
              <Input name="hosts" placeholder="autocentersilva.com.br, www.autocentersilva.com.br" />
            </Field>
            {temServidor ? null : (
              <Field label="URL do banco (postgresql://…)" required>
                <Input name="bancoManual" required />
              </Field>
            )}
          </div>
          <p className="pt-2 text-sm font-medium text-slate-700">Administrador da loja</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nome" required>
              <Input name="adminNome" required />
            </Field>
            <Field label="E-mail" required>
              <Input name="adminEmail" type="email" required />
            </Field>
            <Field label="Senha inicial (mín. 8)" required>
              <Input name="adminSenha" type="password" minLength={8} required autoComplete="new-password" />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Passe a senha inicial ao cliente por um canal seguro e peça para ele trocar no primeiro acesso.
          </p>
        </FormPlataforma>
      </Card>
    </div>
  );
}
