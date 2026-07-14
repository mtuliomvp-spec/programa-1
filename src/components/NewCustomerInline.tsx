"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input } from "@/components/ui";
import { quickCreateCustomerAction } from "@/app/clientes/actions";
import { lookupCnpjAction } from "@/app/cnpj-actions";

/**
 * Painel para cadastrar um cliente sem sair da tela. Opcionalmente busca por
 * CNPJ (quando o cliente é empresa). Ao concluir, devolve id e nome para o
 * formulário selecioná-lo.
 */
export default function NewCustomerInline({
  onCreated,
}: {
  onCreated: (c: { id: string; name: string }) => void;
}) {
  const [data, setData] = useState({ name: "", document: "", phone: "", email: "", address: "" });
  const [saving, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function set(field: keyof typeof data, value: string) {
    setData((prev) => ({ ...prev, [field]: value }));
  }

  function handleCnpj() {
    if (!data.document.trim()) {
      setMsg({ tone: "err", text: "Digite o CNPJ antes de buscar." });
      return;
    }
    setMsg(null);
    start(async () => {
      const result = await lookupCnpjAction(data.document);
      if (!result.ok) {
        setMsg({ tone: "err", text: result.error });
        return;
      }
      setData((prev) => ({
        ...prev,
        name: result.data.name || prev.name,
        phone: result.data.phone || prev.phone,
        email: result.data.email || prev.email,
        address: result.data.address || prev.address,
      }));
      setMsg({ tone: "ok", text: `Dados encontrados: ${result.data.name}.` });
    });
  }

  function handleCreate() {
    if (!data.name.trim()) {
      setMsg({ tone: "err", text: "Informe o nome do cliente." });
      return;
    }
    setMsg(null);
    start(async () => {
      const result = await quickCreateCustomerAction(data);
      if (!result.ok) {
        setMsg({ tone: "err", text: result.error });
        return;
      }
      onCreated({ id: result.id, name: result.name });
    });
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-end gap-2">
        <Field label="CPF / CNPJ">
          <Input
            value={data.document}
            onChange={(e) => set("document", e.target.value)}
            placeholder="000.000.000-00 ou CNPJ"
          />
        </Field>
        <Button type="button" variant="secondary" onClick={handleCnpj} disabled={saving}>
          {saving ? "..." : "🔍 CNPJ"}
        </Button>
      </div>
      <Field label="Nome / razão social" required>
        <Input value={data.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome do cliente" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Telefone">
          <Input value={data.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="E-mail">
          <Input value={data.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
      </div>
      <Field label="Endereço">
        <Input value={data.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      {msg ? (
        <p className={`text-sm ${msg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>
      ) : null}
      <Button type="button" onClick={handleCreate} disabled={saving} className="w-full">
        {saving ? "Salvando..." : "Cadastrar cliente"}
      </Button>
    </div>
  );
}
