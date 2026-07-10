import { prisma } from "@/lib/prisma";
import BrandMark from "@/components/BrandMark";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const userCount = await prisma.user.count();
  const isSetup = userCount === 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <BrandMark dark />
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl">
          <h1 className="text-lg font-bold text-slate-900">
            {isSetup ? "Bem-vindo! Crie o administrador" : "Entrar no sistema"}
          </h1>
          <p className="mb-5 mt-1 text-sm text-slate-500">
            {isSetup
              ? "Primeiro acesso: crie o usuário dono do sistema. Só você poderá cadastrar outros usuários."
              : "Use seu e-mail e senha cadastrados."}
          </p>
          <LoginForm isSetup={isSetup} next={params.next} />
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          MVP Veículos · acesso restrito
        </p>
      </div>
    </div>
  );
}
