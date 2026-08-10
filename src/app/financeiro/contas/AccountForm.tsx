"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import BankInput from "@/components/BankInput";
import { createAccountAction, type ContaFormState } from "./actions";

type Beneficiary = { id: string; name: string };

export default function AccountForm({ beneficiaries = [] }: { beneficiaries?: Beneficiary[] }) {
  const [state, formAction, pending] = useActionState(createAccountAction, {} as ContaFormState);
  const [type, setType] = useState("CAIXA");
  const [isInvestment, setIsInvestment] = useState(false);

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Nome" required>
        <Input name="name" required placeholder="Ex: Caixa da loja / Banco Itaú" />
      </Field>
      <Field label="Tipo" required>
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="CAIXA">Caixa físico</option>
          <option value="BANCO">Banco (conta corrente)</option>
          <option value="POUPANCA">Poupança</option>
          <option value="FINANCEIRA">Financeira (repasses de financiamento)</option>
          <option value="OUTRO">Outro</option>
        </Select>
      </Field>
      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <input
          type="checkbox"
          name="isInvestment"
          value="true"
          checked={isInvestment}
          onChange={(e) => setIsInvestment(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        <span>
          <strong>Conta de Aplicação</strong> (investimento dos sócios)
          <span className="mt-0.5 block text-xs font-normal text-slate-400">
            O saldo é dividido entre os sócios do Capital. Começa em zero — o dinheiro entra
            pela tela da conta (Aplicar / Rendimento).
          </span>
        </span>
      </label>
      {isInvestment ? (
        <Field label="Vencimento da aplicação">
          <Input name="investmentMaturity" type="date" className="max-w-xs" />
          <p className="mt-1 text-xs text-slate-400">
            Até quando o dinheiro rende. Deixe em branco se a aplicação não tem prazo. O sistema
            avisa antes de vencer, para o dinheiro não ficar parado.
          </p>
        </Field>
      ) : null}
      {type === "FINANCEIRA" && !isInvestment ? (
        <Field label="Desconto de impostos sobre o retorno (%)">
          <Input
            name="returnTaxPercent"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={0}
            placeholder="Ex: 15"
          />
          <p className="mt-1 text-xs text-slate-400">
            Percentual que a financeira retém sobre o retorno. A loja recebe o líquido.
          </p>
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Banco">
          <BankInput name="bankName" placeholder="Ex: Itaú" />
        </Field>
        <Field label="Agência">
          <Input name="agency" placeholder="0000" />
        </Field>
      </div>
      <Field label="Número da conta">
        <Input name="accountNumber" placeholder="00000-0" />
      </Field>
      {beneficiaries.length > 0 ? (
        <Field label="Titular da conta">
          <Select name="ownerBeneficiaryId" defaultValue="">
            <option value="">MVP Veículos (empresa)</option>
            {beneficiaries.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-400">
            Quando a conta é de um sócio mas opera como se fosse da MVP, escolha o dono
            verdadeiro. Só identifica o titular nas telas — não altera a contabilidade.
          </p>
        </Field>
      ) : null}
      {!isInvestment ? (
        <>
          <Field label="Saldo inicial (R$)">
            <Input name="initialBalance" type="number" step="0.01" defaultValue={0} />
          </Field>
          <p className="-mt-2 text-xs text-slate-400">
            Dinheiro que a conta já tem hoje, de antes do sistema. Ele entra no caixa e
            aparece no Lucro/Prejuízo como &quot;Saldo inicial&quot; na data do cadastro.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="isDefault" value="true" className="h-4 w-4 rounded border-slate-300" />
            Usar como conta padrão das baixas
          </label>
        </>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Cadastrar conta"}
      </Button>
    </form>
  );
}
