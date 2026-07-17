"use client";

import { Field, Input, Select } from "@/components/ui";

export type UserBank = {
  document?: string | null;
  phone?: string | null;
  bankName?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  bankAccountType?: string | null;
  pixKey?: string | null;
};

/**
 * Campos "Dados para pagamento" do usuário (aparecem na Ordem de Pagamento da
 * comissão). Reutilizado no cadastro e na edição rápida.
 */
export default function UserBankFields({ user, compact = false }: { user?: UserBank; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
      <Field label="CPF / CNPJ">
        <Input name="document" defaultValue={user?.document || ""} placeholder="000.000.000-00" />
      </Field>
      <Field label="Telefone">
        <Input name="phone" defaultValue={user?.phone || ""} />
      </Field>
      <Field label="Banco">
        <Input name="bankName" defaultValue={user?.bankName || ""} placeholder="Ex: 001 - Banco do Brasil" />
      </Field>
      <Field label="Chave PIX">
        <Input name="pixKey" defaultValue={user?.pixKey || ""} placeholder="CPF, e-mail, telefone ou aleatória" />
      </Field>
      <Field label="Agência">
        <Input name="bankAgency" defaultValue={user?.bankAgency || ""} placeholder="0000" />
      </Field>
      <Field label="Conta">
        <Input name="bankAccount" defaultValue={user?.bankAccount || ""} placeholder="00000-0" />
      </Field>
      <Field label="Tipo de conta">
        <Select name="bankAccountType" defaultValue={user?.bankAccountType || ""}>
          <option value="">—</option>
          <option value="corrente">Corrente</option>
          <option value="poupanca">Poupança</option>
        </Select>
      </Field>
    </div>
  );
}
