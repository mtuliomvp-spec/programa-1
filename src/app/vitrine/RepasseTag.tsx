/**
 * Tarja de REPASSE sobre a foto do anúncio.
 *
 * Fica numa faixa que atravessa o TOPO da imagem, e não no meio: o objetivo é
 * marcar o anúncio sem esconder o carro. Quem usa precisa de um contêiner
 * `relative` em volta da foto.
 */
export default function RepasseTag({ size = "sm" }: { size?: "sm" | "lg" }) {
  const grande = size === "lg";
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 z-10 bg-slate-900/75 text-center backdrop-blur-[1px] ${
        grande ? "py-2.5" : "py-1.5"
      }`}
    >
      <span
        className={`font-black uppercase text-white ${
          grande ? "text-lg tracking-[0.4em]" : "text-xs tracking-[0.3em]"
        }`}
      >
        Repasse
      </span>
    </div>
  );
}
