"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Esconde na hora os itens abonados do cartão (como o "tirar da fila" dos
 * pagamentos futuros): a atualização da página pelo servidor nem sempre chega
 * a esta tela, e o item abonado continuava na lista até recarregar.
 */
const Ctx = createContext<{ ocultos: Set<string>; ocultar: (ids: string[]) => void } | null>(null);

export function AbonoGrupo({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const ocultar = (novos: string[]) => setOcultos((prev) => new Set([...prev, ...novos]));
  // Abonou tudo: o cartão inteiro sai da tela.
  if (ids.length > 0 && ids.every((id) => ocultos.has(id))) return null;
  return <Ctx.Provider value={{ ocultos, ocultar }}>{children}</Ctx.Provider>;
}

/** Linha que some quando o veículo dela é abonado. */
export function AbonoLinha({ vehicleId, children }: { vehicleId?: string; children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (vehicleId && ctx?.ocultos.has(vehicleId)) return null;
  return <>{children}</>;
}

export function useAbono() {
  return useContext(Ctx);
}
