"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";
import { createCategoryAction, renameCategoryAction, deleteCategoryAction } from "./actions";

type Row = { id: string; name: string; system: boolean; code: string | null };
type Kind = "DESPESA" | "RECEITA";

function CategoryRowItem({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await renameCategoryAction(row.id, name);
      if (!r.ok) {
        setMsg(r.error || "Erro ao renomear.");
        return;
      }
      setEditing(false);
      onChanged();
    });
  }

  function remove() {
    setMsg(null);
    if (!confirm(`Excluir a categoria "${row.name}"? Os lançamentos antigos mantêm o texto.`)) return;
    start(async () => {
      const r = await deleteCategoryAction(row.id);
      if (!r.ok) {
        setMsg(r.error || "Erro ao excluir.");
        return;
      }
      onChanged();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      {editing ? (
        <>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 max-w-xs"
            autoFocus
          />
          <Button className="h-8 px-2 py-1 text-xs" disabled={pending} onClick={save}>
            Salvar
          </Button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(row.name);
              setMsg(null);
            }}
            className="text-xs text-slate-400 hover:underline"
          >
            Cancelar
          </button>
        </>
      ) : (
        <>
          <span className="font-medium text-slate-800">{row.name}</span>
          {row.system ? <Badge tone="info">Sistema</Badge> : null}
          <span className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
            >
              Renomear
            </button>
            {row.system ? (
              <span className="text-xs text-slate-300" title="Categoria padrão — não pode ser excluída">
                Excluir
              </span>
            ) : (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
              >
                Excluir
              </button>
            )}
          </span>
        </>
      )}
      {msg ? <p className="w-full text-xs text-rose-600">{msg}</p> : null}
    </li>
  );
}

function KindSection({ title, description, kind, rows }: { title: string; description: string; kind: Kind; rows: Row[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const onChanged = () => router.refresh();

  function add() {
    setMsg(null);
    if (!name.trim()) {
      setMsg("Informe o nome.");
      return;
    }
    start(async () => {
      const r = await createCategoryAction(name, kind);
      if (!r.ok) {
        setMsg(r.error || "Erro ao cadastrar.");
        return;
      }
      setName("");
      onChanged();
    });
  }

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Nova categoria..."
          className="h-9 max-w-xs"
        />
        <Button className="h-9" disabled={pending} onClick={add}>
          ➕ Cadastrar
        </Button>
        {msg ? <p className="w-full text-xs text-rose-600">{msg}</p> : null}
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <CategoryRowItem key={r.id} row={r} onChanged={onChanged} />
        ))}
      </ul>
    </Card>
  );
}

export default function CategoriesManager({ despesa, receita }: { despesa: Row[]; receita: Row[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <KindSection
        title="Categorias de despesa"
        description="Contas a pagar, saídas no caixa e recorrências a pagar"
        kind="DESPESA"
        rows={despesa}
      />
      <KindSection
        title="Categorias de receita"
        description="Contas a receber e recorrências a receber"
        kind="RECEITA"
        rows={receita}
      />
    </div>
  );
}
