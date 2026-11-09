"use client";

import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { UsuarioFuncionario } from "@/lib/usuarios-funcionarios";
import { updateEmployeeAction } from "../actions";
import { useEnvio } from "./useEnvio";

/** Dados do funcionário: a admissão é a base das férias e da rescisão. */
export default function EditarFuncionario({
  e,
  usuarios,
}: {
  usuarios: UsuarioFuncionario[];
  e: { id: string; userId: string | null; name: string; role: string | null; cpf: string | null; pixKey: string | null; salary: number; admissionDate: string; notes: string | null };
}) {
  const { erro, pendente, aoEnviar } = useEnvio(updateEmployeeAction);
  return (
    <form onSubmit={aoEnviar} className="space-y-3">
      <input type="hidden" name="id" value={e.id} />
      <Field label="Usuário do sistema">
        <Select name="userId" defaultValue={e.userId ?? ""}>
          <option value="">— sem usuário —</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.email}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" required>
          <Input name="name" defaultValue={e.name} required />
        </Field>
        <Field label="Cargo">
          <Input name="role" defaultValue={e.role ?? ""} />
        </Field>
        <Field label="CPF">
          <Input name="cpf" defaultValue={e.cpf ?? ""} />
        </Field>
        <Field label="Chave PIX">
          <Input name="pixKey" defaultValue={e.pixKey ?? ""} />
        </Field>
        <Field label="Salário mensal (R$)" required>
          <Input name="salary" type="number" step="0.01" min={0} defaultValue={e.salary} required />
        </Field>
        <Field label="Data de admissão" required>
          <Input name="admissionDate" type="date" defaultValue={e.admissionDate} required />
        </Field>
      </div>
      <Field label="Observações">
        <Textarea name="notes" rows={2} defaultValue={e.notes ?? ""} />
      </Field>
      {erro ? <p className="text-sm text-rose-600">{erro}</p> : null}
      <Button type="submit" variant="secondary" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar dados"}
      </Button>
    </form>
  );
}
