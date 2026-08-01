/**
 * Fallback global de navegação: aparece NA HORA em que o usuário toca num link,
 * enquanto a página de destino carrega no servidor — feedback de que o sistema
 * aceitou o comando (sem ele, telas dinâmicas pareciam "clique morto").
 */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      <p className="text-sm font-medium text-slate-500">Carregando…</p>
    </div>
  );
}
