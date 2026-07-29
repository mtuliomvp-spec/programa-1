"use client";

import { useState } from "react";
import { Field, Select } from "@/components/ui";
import NewSupplierInline from "@/components/NewSupplierInline";

type Option = { id: string; name: string };

/**
 * Seletor de fornecedor com a opção de CADASTRAR na hora (reaproveita o
 * NewSupplierInline). Ao cadastrar, o novo fornecedor entra na lista e já fica
 * selecionado. Submete o id no campo `name` (padrão "supplierId").
 */
export default function SupplierSelect({
  suppliers,
  name = "supplierId",
  label = "Fornecedor",
  defaultValue = "",
  emptyLabel = "Sem fornecedor",
  required = false,
}: {
  suppliers: Option[];
  name?: string;
  label?: string;
  defaultValue?: string;
  emptyLabel?: string;
  required?: boolean;
}) {
  const [list, setList] = useState<Option[]>(suppliers);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  return (
    <Field label={label}>
      <Select name={name} value={value} onChange={(e) => setValue(e.target.value)} required={required}>
        <option value="">{emptyLabel}</option>
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 text-xs font-medium text-blue-700 hover:underline"
      >
        {open ? "Fechar" : "➕ Cadastrar fornecedor"}
      </button>
      {open ? (
        <NewSupplierInline
          onCreated={(nm, id) => {
            setList((prev) => (prev.some((s) => s.id === id) ? prev : [...prev, { id, name: nm }]));
            setValue(id);
            setOpen(false);
          }}
        />
      ) : null}
    </Field>
  );
}
