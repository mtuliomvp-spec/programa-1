"use client";

import { useActionState, useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createEmployeeAction, type FolhaFormState } from "./actions";
import { toDateInputValue } from "@/lib/format";
import type { UsuarioFuncionario } from "@/lib/usuarios-funcionarios";

/**
 * Novo funcionário. Pode partir de um usuário do sistema: nome, CPF, PIX e
 * cargo vêm do cadastro dele, e a ficha fica ligada ao usuário.
 */
export default function EmployeeForm({ usuarios }: { usuarios: UsuarioFuncionario[] }) {
  const [state, formAction, pending] = useActionState(createEmployeeAction, {} as FolhaFormState);
  const [userId, setUserId] = useState("");
  const [campos, setCampos] = useState({ name: "", role: "", cpf: "", pixKey: "" });
  const muda = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos((c) => ({ ...c, [k]: e.target.value }));

  function escolher(id: string) {
    setUserId(id);
    const u = usuarios.find((x) => x.id === id);
    if (u) setCampos({ name: u.name, role: u.cargo, cpf: u.cpf, pixKey: u.pixKey });
  }

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {usuarios.length ? (
        <Field label="Usuário do sistema (opcional)">
          <Select name="userId" value={userId} onChange={(e) => escolher(e.target.value)}>
            <option value="">— cadastrar sem usuário —</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.email}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-slate-500">
            Escolha quem já usa o sistema: os dados dele preenchem a ficha e ela fica ligada ao usuário.
          </p>
        </Field>
      ) : null}
      <Field label="Nome" required>
        <Input name="name" required placeholder="Ex: Marcos Silva" value={campos.name} onChange={muda("name")} />
      </Field>
      <Field label="Cargo">
        <Input name="role" placeholder="Ex: Vendedor" value={campos.role} onChange={muda("role")} />
      </Field>
      <Field label="CPF">
        <Input name="cpf" placeholder="000.000.000-00" value={campos.cpf} onChange={muda("cpf")} />
      </Field>
      <Field label="Chave PIX">
        <Input name="pixKey" placeholder="CPF, e-mail ou telefone" value={campos.pixKey} onChange={muda("pixKey")} />
      </Field>
      <Field label="Salário mensal (R$)" required>
        <Input name="salary" type="number" step="0.01" min={0} required />
      </Field>
      <Field label="Data de admissão" required>
        <Input name="admissionDate" type="date" defaultValue={toDateInputValue(new Date())} required />
        {userId ? (
          <p className="mt-1 text-xs text-amber-700">
            Use a data de admissão da carteira de trabalho (não a do cadastro no sistema): é dela que saem as
            férias.
          </p>
        ) : null}
      </Field>
      <Field label="Observações">
        <Textarea name="notes" rows={2} />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Salvando..." : "Cadastrar funcionário"}
      </Button>
    </form>
  );
}
