"use client";

import { useState, useTransition } from "react";
import { Button, Input, Select } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { aplicarHoleriteAction, lerHoleriteAction, type ItemHoleriteLido } from "./actions";

type Funcionario = { id: string; name: string; recebeSalario: boolean; active: boolean };
type Linha = ItemHoleriteLido & { destino: string; liquidoTexto: string };

const paraNumero = (t: string) => {
  const s = t.trim();
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Importa o PDF de holerites da contabilidade: a IA lê o líquido de cada
 * funcionário, o usuário confere (e escolhe quem é quem) e o valor vai para o
 * salário da competência — descontando os vales já tirados.
 */
export default function ImportarHolerite({ competenciaPadrao }: { competenciaPadrao: string }) {
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [competencia, setCompetencia] = useState(competenciaPadrao);
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [resultados, setResultados] = useState<{ ok: boolean; texto: string }[] | null>(null);
  const [pending, startTransition] = useTransition();

  function fechar() {
    setAberto(false);
    setArquivo(null);
    setLinhas(null);
    setErro(null);
    setResultados(null);
  }

  if (!aberto) {
    return (
      <Button type="button" variant="secondary" onClick={() => setAberto(true)}>
        📄 Importar holerite do contador
      </Button>
    );
  }

  const ler = () =>
    startTransition(async () => {
      if (!arquivo) return setErro("Escolha o PDF do holerite.");
      setErro(null);
      const fd = new FormData();
      fd.set("arquivo", arquivo);
      const r = await lerHoleriteAction(fd);
      if (!r.ok) return setErro(r.erro);
      if (r.competencia) setCompetencia(r.competencia);
      setFuncionarios(r.funcionarios);
      setLinhas(
        r.itens.map((i) => ({
          ...i,
          destino: i.employeeId ?? "novo",
          liquidoTexto: i.liquido.toFixed(2).replace(".", ","),
        })),
      );
      if (!r.itens.length) setErro("A IA não encontrou holerites neste arquivo.");
    });

  const aplicar = () =>
    startTransition(async () => {
      if (!linhas || !arquivo) return;
      const itens = [];
      for (const l of linhas) {
        const liquido = paraNumero(l.liquidoTexto);
        if (l.destino && !(liquido > 0)) return setErro(`Valor líquido inválido para ${l.nome}.`);
        itens.push({
          destino: l.destino,
          nome: l.nome,
          cargo: l.cargo,
          salarioBase: l.salarioBase,
          totalVencimentos: l.totalVencimentos,
          totalDescontos: l.totalDescontos,
          liquido,
        });
      }
      setErro(null);
      const fd = new FormData();
      fd.set("arquivo", arquivo);
      fd.set("competencia", competencia.trim());
      fd.set("itens", JSON.stringify(itens));
      const r = await aplicarHoleriteAction(fd);
      if (r.error) return setErro(r.error);
      setResultados(r.resultados);
    });

  const mudar = (idx: number, campo: Partial<Linha>) =>
    setLinhas((ls) => (ls ? ls.map((l, i) => (i === idx ? { ...l, ...campo } : l)) : ls));

  return (
    <div className="w-full rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/30">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-800 dark:text-slate-100">Importar holerite do contador</p>
        <button type="button" onClick={fechar} className="text-slate-500 hover:text-slate-800" aria-label="Fechar">
          ✕
        </button>
      </div>

      {resultados ? (
        <div className="space-y-2">
          <ul className="space-y-1">
            {resultados.map((r, i) => (
              <li key={i} className={r.ok ? "text-emerald-800 dark:text-emerald-300" : "text-rose-700"}>
                {r.ok ? "✅" : "⚠️"} {r.texto}
              </li>
            ))}
          </ul>
          <Button type="button" onClick={() => location.reload()}>
            Ver a folha atualizada
          </Button>
        </div>
      ) : !linhas ? (
        <div className="space-y-2">
          <p className="text-slate-600 dark:text-slate-300">
            Envie o PDF de holerites que a contabilidade manda. A IA lê o <strong>valor líquido</strong> de cada
            funcionário; você confere antes de aplicar.
          </p>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <Button type="button" onClick={ler} disabled={pending || !arquivo}>
            {pending ? "Lendo o holerite…" : "Ler holerite"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <span className="text-slate-600 dark:text-slate-300">Competência</span>
            <Input value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-28" placeholder="10/2026" />
          </label>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1 pr-2">No holerite</th>
                  <th className="py-1 pr-2 text-right">Líquido (R$)</th>
                  <th className="py-1">Lançar para</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const f = funcionarios.find((x) => x.id === l.destino);
                  return (
                    <tr key={i} className="border-t border-blue-100 align-top dark:border-blue-900">
                      <td className="py-2 pr-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">{l.nome}</span>
                        <span className="block text-xs text-slate-500">
                          {[
                            l.cargo,
                            l.totalVencimentos ? `vencimentos ${formatCurrency(l.totalVencimentos)}` : null,
                            l.totalDescontos ? `descontos ${formatCurrency(l.totalDescontos)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Input
                          value={l.liquidoTexto}
                          onChange={(e) => mudar(i, { liquidoTexto: e.target.value })}
                          inputMode="decimal"
                          className="ml-auto w-28 text-right"
                        />
                      </td>
                      <td className="py-2">
                        <Select value={l.destino} onChange={(e) => mudar(i, { destino: e.target.value })}>
                          <option value="">— ignorar —</option>
                          <option value="novo">➕ Cadastrar como novo funcionário</option>
                          {funcionarios.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                              {!x.active ? " (desligado)" : ""}
                              {!x.recebeSalario ? " (só comissão)" : ""}
                            </option>
                          ))}
                        </Select>
                        {f && !f.recebeSalario ? (
                          <span className="mt-1 block text-xs text-amber-700">
                            Só comissão: o holerite será ignorado (ligue o salário na lista se ele passar a receber).
                          </span>
                        ) : l.destino === "novo" ? (
                          <span className="mt-1 block text-xs text-amber-700">
                            Não achei no cadastro: será cadastrado(a) — confira a admissão depois.
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            O líquido vira o valor do salário da competência. Vales e adiantamentos já pagos são descontados do saldo a
            pagar, e o PDF fica anexado ao título.
          </p>
          <Button type="button" onClick={aplicar} disabled={pending}>
            {pending ? "Aplicando…" : "Aplicar na folha"}
          </Button>
        </div>
      )}
      {erro ? <p className="mt-2 text-rose-600">{erro}</p> : null}
    </div>
  );
}
