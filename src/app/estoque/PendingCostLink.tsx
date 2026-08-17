"use client";

import { useRouter } from "next/navigation";

/**
 * "falta R$ X" clicável: leva a Contas a pagar já filtrado nos títulos em aberto
 * daquele veículo. Usa <span> (não <a>) com stopPropagation porque o card do
 * estoque no celular é, ele todo, um link para a ficha do veículo — um <a>
 * aninhado seria HTML inválido.
 */
export default function PendingCostLink({
  vehicleId,
  amountLabel,
}: {
  vehicleId: string;
  amountLabel: string;
}) {
  const router = useRouter();
  const go = () => router.push(`/financeiro/a-pagar?veiculo=${vehicleId}&status=NAO_PAGO`);
  return (
    <span
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        go();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          go();
        }
      }}
      title="Ver os títulos que faltam pagar deste veículo"
      className="cursor-pointer text-rose-500 underline decoration-dotted underline-offset-2 hover:text-rose-700"
    >
      falta {amountLabel}
    </span>
  );
}
