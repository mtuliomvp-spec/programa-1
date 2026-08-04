// Limite de carregamento da vitrine. Além do spinner, ele muda o prefetch dos
// <Link> (chips de filtro, cards): sem este arquivo o Next pré-busca a página
// INTEIRA e a guarda 5 min no cache do navegador — clicar num filtro podia
// mostrar uma versão velha da lista ("preso" no filtro). Com ele, cada
// navegação busca os dados frescos no servidor.
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
      <p className="text-sm font-medium text-slate-500">Carregando veículos…</p>
    </div>
  );
}
