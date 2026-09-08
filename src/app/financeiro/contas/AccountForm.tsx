"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import BankInput from "@/components/BankInput";
import { createAccountAction, updateAccountAction, type ContaFormState } from "./actions";

type Beneficiary = { id: string; name: string };

/** Conta já cadastrada, quando o formulário está EDITANDO. */
export type AccountFormInitial = {
  id: string;
  name: string;
  type: string;
  bankName: string | null;
  agency: string | null;
  accountNumber: string | null;
  initialBalance: number;
  isInvestment: boolean;
  investmentMaturity: string | null; // yyyy-mm-dd
  returnTaxPercent: number;
  ownerBeneficiaryId: string | null;
  /** Já tem título baixado ou transferência: o saldo inicial fica travado. */
  temMovimento: boolean;
};

/**
 * Cadastro E edição da conta financeira — os mesmos campos nos dois casos.
 * Na edição, o que não pode mudar aparece travado com o motivo à vista, em vez
 * de sumir da tela: saldo inicial com movimento (já entrou no resultado) e o
 * "Conta de Aplicação" (o saldo dela é rateado entre os sócios).
 */
export default function AccountForm({
  beneficiaries = [],
  initial,
}: {
  beneficiaries?: Beneficiary[];
  initial?: AccountFormInitial;
}) {
  const router = useRouter();
  const editando = Boolean(initial);
  const [state, formAction, pending] = useActionState(
    async (prev: ContaFormState, formData: FormData) => {
      const res = initial
        ? await updateAccountAction(prev, formData)
        : await createAccountAction(prev, formData);
      if (initial && !res.error) router.push("/financeiro/contas");
      return res;
    },
    {} as ContaFormState,
  );
  const [type, setType] = useState(initial?.type ?? "CAIXA");
  const [isInvestment, setIsInvestment] = useState(initial?.isInvestment ?? false);
  const saldoTravado = Boolean(initial?.temMovimento);

  return (
    <form action={formAction} className="space-y-3">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      <Field label="Nome" required>
        <Input
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="Ex: Caixa da loja / Banco Itaú"
        />
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
          disabled={editando}
          onChange={(e) => setIsInvestment(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        <span>
          <strong>Conta de Aplicação</strong> (investimento dos sócios)
          <span className="mt-0.5 block text-xs font-normal text-slate-400">
            {editando
              ? "Não muda depois de cadastrada: o saldo da aplicação é rateado entre os sócios do Capital."
              : "O saldo é dividido entre os sócios do Capital. Começa em zero — o dinheiro entra pela tela da conta (Aplicar / Rendimento)."}
          </span>
        </span>
      </label>
      {/* O checkbox desabilitado não é enviado: o valor vai num campo oculto. */}
      {editando && isInvestment ? <input type="hidden" name="isInvestment" value="true" /> : null}
      {isInvestment ? (
        <Field label="Vencimento da aplicação">
          <Input
            name="investmentMaturity"
            type="date"
            className="max-w-xs"
            defaultValue={initial?.investmentMaturity ?? ""}
          />
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
            defaultValue={initial?.returnTaxPercent ?? 0}
            placeholder="Ex: 15"
          />
          <p className="mt-1 text-xs text-slate-400">
            Percentual que a financeira retém sobre o retorno. A loja recebe o líquido.
          </p>
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Banco">
          <BankInput name="bankName" placeholder="Ex: Itaú" defaultValue={initial?.bankName ?? ""} />
        </Field>
        <Field label="Agência">
          <Input name="agency" placeholder="0000" defaultValue={initial?.agency ?? ""} />
        </Field>
      </div>
      <Field label="Número da conta">
        <Input name="accountNumber" placeholder="00000-0" defaultValue={initial?.accountNumber ?? ""} />
        {editando ? (
          <p className="mt-1 text-xs text-slate-400">
            É por agência e número que o sistema reconhece sozinho a conta debitada no comprovante
            de pagamento — vale mantê-los certos.
          </p>
        ) : null}
      </Field>
      {beneficiaries.length > 0 ? (
        <Field label="Titular da conta">
          <Select name="ownerBeneficiaryId" defaultValue={initial?.ownerBeneficiaryId ?? ""}>
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
            <Input
              name="initialBalance"
              type="number"
              step="0.01"
              defaultValue={initial?.initialBalance ?? 0}
              disabled={saldoTravado}
            />
          </Field>
          <p className="-mt-2 text-xs text-slate-400">
            {saldoTravado
              ? "🔒 Travado: esta conta já tem lançamentos, e o saldo inicial já entrou no Lucro/Prejuízo e na equação patrimonial. Uma correção de saldo se faz por lançamento no movimento de caixa."
              : "Dinheiro que a conta já tem hoje, de antes do sistema. Ele entra no caixa e aparece no Lucro/Prejuízo como “Saldo inicial” na data do cadastro."}
          </p>
          {saldoTravado ? (
            <input type="hidden" name="initialBalance" value={initial?.initialBalance ?? 0} />
          ) : null}
          {!editando ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="isDefault" value="true" className="h-4 w-4 rounded border-slate-300" />
              Usar como conta padrão das baixas
            </label>
          ) : null}
        </>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar conta"}
      </Button>
    </form>
  );
}
