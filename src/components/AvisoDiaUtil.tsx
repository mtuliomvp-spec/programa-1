"use client";

import { isDiaUtilBancario, proximoDiaUtil } from "@/lib/banking-days";

/**
 * Data do comprovante em fim de semana ou feriado nacional: a transferência
 * foi feita, mas o banco costuma compensar no dia útil seguinte. Mostra o
 * aviso e o atalho para usar essa data (o campo continua editável).
 */
export default function AvisoDiaUtil({
  data,
  escolhida,
  onUsar,
  className = "",
}: {
  /** yyyy-mm-dd lido do comprovante. */
  data: string;
  /** yyyy-mm-dd que está no campo agora. */
  escolhida: string;
  onUsar: (d: string) => void;
  className?: string;
}) {
  const dia = new Date(`${data}T12:00:00Z`);
  if (Number.isNaN(dia.getTime()) || isDiaUtilBancario(dia)) return null;
  const seguinte = proximoDiaUtil(dia).toISOString().slice(0, 10);
  const br = (iso: string) => iso.split("-").reverse().join("/");
  const nomeDia = dia.getUTCDay() === 0 ? "domingo" : dia.getUTCDay() === 6 ? "sábado" : "feriado";
  return (
    <span className={`block text-amber-700 ${className}`}>
      {br(data)} é {nomeDia}: a compensação costuma ser no dia útil seguinte.{" "}
      {escolhida !== seguinte ? (
        <button type="button" onClick={() => onUsar(seguinte)} className="font-semibold text-sky-700 hover:underline">
          Usar {br(seguinte)}
        </button>
      ) : (
        <span className="font-semibold">Usando {br(seguinte)}.</span>
      )}
    </span>
  );
}
