"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge, Button, Select } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/format";
import { payRequestPayableAction } from "../actions";

type Payable = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "PENDENTE" | "PAGO" | "ATRASADO";
  documentNumber: string | null;
  paymentDate: string | null;
  accountName: string | null;
};
type Account = { id: string; name: string };

/**
 * Espelho da solicitação em Contas a pagar: lista os títulos (1 ou N parcelas)
 * com o nº da NF/documento e permite PAGAR direto por aqui (mesmo pagamento do
 * a-pagar). Ao quitar tudo, a solicitação vira Concluída automaticamente.
 */
export default function RequestPayables({
  payables,
  accounts,
  canPay,
  cashboxOpen,
}: {
  payables: Payable[];
  accounts: Account[];
  canPay: boolean;
  cashboxOpen: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [account, setAccount] = useState(accounts[0]?.id || "");
  const [error, setError] = useState<string | null>(null);

  function pay(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await payRequestPayableAction(id, account);
      if (!res.ok) setError(res.error || "Não foi possível pagar.");
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {canPay ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs text-slate-500">
            Conta que paga
            <Select value={account} onChange={(e) => setAccount(e.target.value)} className="w-56">
              <option value="">Selecione a conta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          {!cashboxOpen ? (
            <p className="text-xs text-amber-600">Abra o caixa para pagar por aqui.</p>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <ul className="divide-y divide-slate-100">
        {payables.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                {formatCurrency(p.amount)}{" "}
                <Badge tone={p.status === "PAGO" ? "success" : p.status === "ATRASADO" ? "danger" : "warning"}>
                  {p.status === "PAGO" ? "Pago" : p.status === "ATRASADO" ? "Atrasado" : "Pendente"}
                </Badge>
              </p>
              <p className="text-xs text-slate-500">
                Vencimento {formatDate(p.dueDate)}
                {p.documentNumber ? ` · NF/Doc ${p.documentNumber}` : ""}
                {p.paymentDate ? ` · pago em ${formatDate(p.paymentDate)}` : ""}
                {p.accountName ? ` · ${p.accountName}` : ""}
              </p>
            </div>
            {canPay && p.status !== "PAGO" ? (
              <Button type="button" disabled={pending || !account || !cashboxOpen} onClick={() => pay(p.id)}>
                {pending ? "Pagando..." : "Pagar"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <Link href="/financeiro/a-pagar" className="inline-block font-medium text-blue-700 hover:underline">
        Abrir em Contas a pagar →
      </Link>
    </div>
  );
}
