import BrandMark from "@/components/BrandMark";
import ResetForm from "./ResetForm";

export const dynamic = "force-dynamic";

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
          <h1 className="text-lg font-bold text-slate-900">Criar nova senha</h1>
          <p className="mb-5 mt-1 text-sm text-slate-500">
            Escolha uma nova senha para o seu acesso.
          </p>
          {token ? (
            <ResetForm token={token} />
          ) : (
            <p className="text-sm text-rose-600">
              Link incompleto. Abra o link exatamente como veio no e-mail, ou peça um novo em
              &quot;Esqueci a senha&quot;.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
