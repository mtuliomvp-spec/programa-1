// Limite de carregamento da página do veículo (mesma razão do loading.tsx da
// vitrine: garante dados frescos a cada navegação em vez do cache de 5 min).
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
      <p className="text-sm font-medium text-slate-500">Carregando veículo…</p>
    </div>
  );
}
