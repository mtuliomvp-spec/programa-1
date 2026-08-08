"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { pingDatabaseAction } from "./actions";

type Result = Awaited<ReturnType<typeof pingDatabaseAction>>;

/** Veredito em português para o número medido. */
function verdict(avg: number) {
  if (avg < 15)
    return {
      tone: "text-emerald-700",
      text: "Rápido. O banco está perto do servidor — se o sistema está lento, o problema é a QUANTIDADE de consultas, e isso se resolve no código.",
    };
  if (avg < 50)
    return {
      tone: "text-amber-700",
      text: "Aceitável, mas não ideal. Vale reduzir a quantidade de consultas; aproximar o banco ainda daria um ganho.",
    };
  return {
    tone: "text-rose-700",
    text: "Lento. Nessa faixa, o banco está longe do servidor: cada ida custa caro e uma tela que faz 40 consultas gasta segundos só em viagem. Aqui o caminho é aproximar os dois (mesma região), não só mexer no código.",
  };
}

export default function PingButton() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Result | null>(null);

  return (
    <div>
      <Button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setRes(await pingDatabaseAction()))}
      >
        {pending ? "Medindo..." : "Medir agora"}
      </Button>

      {res?.ok && res.avgMs !== undefined ? (
        <div className="mt-3">
          <p className="text-3xl font-semibold text-slate-900">
            {res.avgMs.toFixed(1)} ms
            <span className="ml-2 text-sm font-normal text-slate-500">por ida ao banco</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            10 medições · mais rápida {res.minMs?.toFixed(1)} ms · mais lenta {res.maxMs?.toFixed(1)} ms
          </p>
          <p className={`mt-2 text-sm ${verdict(res.avgMs).tone}`}>{verdict(res.avgMs).text}</p>
        </div>
      ) : null}

      {res && !res.ok ? <p className="mt-3 text-sm text-rose-600">{res.error}</p> : null}
    </div>
  );
}
