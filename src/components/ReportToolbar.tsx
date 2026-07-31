import type { ReactNode } from "react";
import { Card, Input, Button, LinkButton } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

/**
 * Barra padrão de filtros + PDF das listagens. Some na impressão (print:hidden)
 * e, no lugar, imprime um cabeçalho com o título e a data. Os filtros usam um
 * form GET: cada campo vira parâmetro na URL e a página filtra as linhas.
 */
export default function ReportToolbar({
  basePath,
  printTitle,
  q,
  placeholder = "Buscar em todos os campos (texto, placa, valor...)",
  date = false,
  value = false,
  de,
  ate,
  min,
  max,
  extra,
}: {
  basePath: string;
  printTitle: string;
  q?: string;
  placeholder?: string;
  date?: boolean;
  value?: boolean;
  de?: string;
  ate?: string;
  min?: string;
  max?: string;
  extra?: ReactNode;
}) {
  const emittedAt = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      {/* Cabeçalho que só aparece na impressão / PDF */}
      <div className="mb-3 hidden print:block">
        <p className="text-sm font-semibold text-slate-900">MVP Veículos · {printTitle}</p>
        <p className="text-xs text-slate-500">Emitido em {emittedAt}</p>
      </div>

      <Card className="mb-4 px-4 py-3 print:hidden">
        <form className="flex flex-wrap items-end gap-3">
          <div className="min-w-[320px] flex-[2] basis-full sm:basis-auto">
            <label className="flex flex-col gap-0.5 text-xs text-slate-500">
              Buscar
              <Input name="q" placeholder={placeholder} defaultValue={q} className="mt-0.5 h-11 text-base" />
            </label>
          </div>

          {date ? (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                De
                <Input type="date" name="de" defaultValue={de} className="mt-0.5 h-11 w-44" />
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                Até
                <Input type="date" name="ate" defaultValue={ate} className="mt-0.5 h-11 w-44" />
              </label>
            </div>
          ) : null}

          {value ? (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                Valor mín.
                <Input
                  name="min"
                  inputMode="decimal"
                  defaultValue={min}
                  placeholder="0,00"
                  className="mt-0.5 h-11 w-32"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-slate-500">
                Valor máx.
                <Input
                  name="max"
                  inputMode="decimal"
                  defaultValue={max}
                  placeholder="—"
                  className="mt-0.5 h-11 w-32"
                />
              </label>
            </div>
          ) : null}

          {extra}

          <div className="flex items-center gap-2">
            <Button type="submit">Filtrar</Button>
            <LinkButton href={basePath} variant="secondary">
              Limpar
            </LinkButton>
            <PrintButton title={printTitle} />
          </div>
        </form>
      </Card>
    </>
  );
}
