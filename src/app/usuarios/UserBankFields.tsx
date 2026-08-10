"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui";

export type UserBank = {
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  bankName?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  bankAccountType?: string | null;
  pixKey?: string | null;
  pixKeyType?: string | null;
};

const PIX_PLACEHOLDER: Record<string, string> = {
  cpf: "000.000.000-00",
  cnpj: "00.000.000/0000-00",
  telefone: "(00) 90000-0000",
  email: "nome@exemplo.com",
  aleatoria: "chave aleatória (EVP)",
};

/**
 * Campos "Dados para pagamento" do usuário (aparecem na Ordem de Pagamento da
 * comissão). Reutilizado no cadastro e na edição rápida. A chave PIX tem um
 * seletor de TIPO que preenche a chave a partir dos dados já digitados na ficha
 * (CPF/CNPJ, Telefone, E-mail da conta) — sempre editável depois.
 */
export default function UserBankFields({ user, compact = false }: { user?: UserBank; compact?: boolean }) {
  const [documentValue, setDocumentValue] = useState(user?.document || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [pixKey, setPixKey] = useState(user?.pixKey || "");
  const [pixKeyType, setPixKeyType] = useState(user?.pixKeyType || "");

  function onTypeChange(type: string) {
    setPixKeyType(type);
    // Preenche a chave a partir dos dados da ficha (o usuário pode ajustar).
    if (type === "cpf" || type === "cnpj") setPixKey(documentValue.trim());
    else if (type === "telefone") setPixKey(phone.trim());
    else if (type === "email") setPixKey((user?.email || "").trim());
    else if (type === "aleatoria") setPixKey("");
  }

  return (
    <div className={`grid grid-cols-1 gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
      <Field label="CPF / CNPJ">
        <Input
          name="document"
          value={documentValue}
          onChange={(e) => setDocumentValue(e.target.value)}
          placeholder="000.000.000-00"
        />
      </Field>
      <Field label="Telefone">
        <Input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="Banco">
        <Input name="bankName" defaultValue={user?.bankName || ""} placeholder="Ex: 001 - Banco do Brasil" />
      </Field>
      <Field label="Tipo de chave PIX">
        <Select name="pixKeyType" value={pixKeyType} onChange={(e) => onTypeChange(e.target.value)}>
          <option value="">— escolha o tipo —</option>
          <option value="cpf">CPF (usa o CPF da ficha)</option>
          <option value="cnpj">CNPJ (usa o CNPJ da ficha)</option>
          <option value="telefone">Telefone (usa o telefone da ficha)</option>
          <option value="email">E-mail (usa o e-mail da conta)</option>
          <option value="aleatoria">Chave aleatória</option>
        </Select>
      </Field>
      <Field label="Chave PIX">
        <Input
          name="pixKey"
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
          placeholder={PIX_PLACEHOLDER[pixKeyType] || "Escolha o tipo acima ou digite a chave"}
        />
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
