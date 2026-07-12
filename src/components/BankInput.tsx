"use client";

import { useId } from "react";
import { Input } from "@/components/ui";
import { BANKS } from "@/lib/banks";

/**
 * Campo de banco/instituição com sugestões do Sistema Financeiro Nacional
 * (datalist). O usuário escolhe da lista ou digita outro valor livremente.
 */
export default function BankInput(props: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const listId = useId();
  return (
    <>
      <Input {...props} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {BANKS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
    </>
  );
}
