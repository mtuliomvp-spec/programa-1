import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarLojaPorSlug } from "@/lib/catalogo";
import { acessoAoPainel, SEGREDOS_DA_LOJA } from "@/lib/plataforma";
import { hostDoPainel } from "@/lib/tenant";
import { Badge, Card, Field, Input, Select } from "@/components/ui";
import FormPlataforma from "../FormPlataforma";
import { atualizarLojaAction, salvarSegredosAction } from "../actions";

export const dynamic = "force-dynamic";

/** Ficha da loja no painel da plataforma: dados, situação e segredos. */
export default async function LojaPlataformaPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await acessoAoPainel())) notFound();
  const { slug } = await params;
  const loja = await buscarLojaPorSlug(slug);
  if (!loja) notFound();
  const dominio = hostDoPainel()?.replace(/^admin\./, "") ?? "";
  const endereco = `https://${loja.slug}.${dominio}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <Link href="/plataforma" className="text-sm text-blue-700 hover:underline">
          ← Lojas
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{loja.nome}</h1>
        <p className="text-sm text-slate-500">
          <a href={endereco} className="text-blue-700 hover:underline" target="_blank" rel="noreferrer">
            {endereco.replace("https://", "")}
          </a>
          {loja.hosts.map((h) => ` · ${h}`).join("")} · criada em {loja.criadoEm.toLocaleDateString("pt-BR")}
        </p>
        {loja.status === "PREPARANDO" ? (
          <p className="mt-2">
            <Badge tone="warning">Em preparo — fica pronta na próxima publicação</Badge>
          </p>
        ) : null}
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Dados e situação</h2>
        <FormPlataforma acao={atualizarLojaAction} botao="Salvar">
          <input type="hidden" name="slug" value={loja.slug} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input name="nome" defaultValue={loja.nome} />
            </Field>
            <Field label="Situação">
              <Select name="status" defaultValue={loja.status} disabled={loja.status === "PREPARANDO"}>
                <option value="ATIVA">Ativa</option>
                <option value="SUSPENSA">Suspensa (ninguém entra)</option>
                {loja.status === "PREPARANDO" ? <option value="PREPARANDO">Em preparo</option> : null}
              </Select>
            </Field>
          </div>
          <Field label="Domínios próprios (separados por vírgula)">
            <Input name="hosts" defaultValue={loja.hosts.join(", ")} placeholder="loja.com.br, www.loja.com.br" />
          </Field>
          <p className="text-xs text-slate-500">
            O domínio próprio também precisa ser adicionado no projeto da Vercel (Settings › Domains) e apontado no
            DNS da loja.
          </p>
        </FormPlataforma>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Certificado e tokens da loja</h2>
        {loja.usaAmbiente ? (
          <p className="mt-2 text-sm text-slate-600">
            Esta loja usa as variáveis do projeto na Vercel (é a loja que veio da instalação de uma loja só).
          </p>
        ) : (
          <>
            <p className="mb-4 mt-1 text-sm text-slate-500">
              Ficam cifrados no catálogo e nunca são mostrados de volta. Campo em branco mantém o que está.
            </p>
            <FormPlataforma acao={salvarSegredosAction} botao="Salvar segredos">
              <input type="hidden" name="slug" value={loja.slug} />
              <div className="space-y-3">
                {SEGREDOS_DA_LOJA.map((s) => {
                  const tem = !!loja.segredos[s.chave];
                  return (
                    <div key={s.chave} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{s.rotulo}</span>
                        <Badge tone={tem ? "success" : "default"}>{tem ? "✓ configurado" : "não configurado"}</Badge>
                      </div>
                      {"arquivo" in s && s.arquivo ? (
                        <Input name={s.chave} type="file" accept=".pfx,.p12" />
                      ) : (
                        <Input
                          name={s.chave}
                          type={"senha" in s && s.senha ? "password" : "text"}
                          autoComplete="off"
                          placeholder={tem ? "•••••• (deixe em branco para manter)" : ""}
                        />
                      )}
                      {tem ? (
                        <label className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <input type="checkbox" name={`apagar_${s.chave}`} /> apagar
                        </label>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </FormPlataforma>
          </>
        )}
      </Card>
    </div>
  );
}
