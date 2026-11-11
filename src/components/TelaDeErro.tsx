"use client";

import { useEffect } from "react";

/**
 * O que aconteceu, em português, no lugar do "This page couldn't load".
 *
 * O caso mais comum não é defeito: a tela foi aberta ANTES de uma atualização
 * do sistema (no celular a aba fica dias em segundo plano) e o botão chamou
 * uma função que a versão nova não tem mais. Nesse caso nada foi gravado —
 * é só recarregar e repetir.
 */
type Tipo = "versao" | "conexao" | "outro";

function tipoDoErro(error: Error | undefined): Tipo {
  const texto = `${error?.name ?? ""} ${error?.message ?? ""}`;
  if (
    /Server Action .*(was not found|not found on the server)|failed-to-find-server-action|ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed/i.test(
      texto,
    )
  ) {
    return "versao";
  }
  if (/Failed to fetch|Load failed|NetworkError|network error|conex/i.test(texto)) return "conexao";
  return "outro";
}

const TEXTOS: Record<Tipo, { titulo: string; texto: string }> = {
  versao: {
    titulo: "O sistema foi atualizado",
    texto:
      "Esta tela foi aberta antes da atualização e o botão não encontrou mais a função antiga. " +
      "Nada foi gravado. Recarregue a página e repita a operação.",
  },
  conexao: {
    titulo: "A conexão caiu",
    texto:
      "O pedido não chegou ao sistema (internet instável). Confira a conexão, recarregue a página e veja se a " +
      "operação ficou registrada antes de repetir.",
  },
  outro: {
    titulo: "Algo deu errado nesta tela",
    texto:
      "Recarregue a página. Se acontecer de novo, mande um print desta tela e do que você estava fazendo para o suporte.",
  },
};

export default function TelaDeErro({
  error,
  tentarDeNovo,
}: {
  error: Error & { digest?: string };
  tentarDeNovo?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const tipo = tipoDoErro(error);
  const { titulo, texto } = TEXTOS[tipo];
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm">
      <p className="text-4xl">{tipo === "versao" ? "🔄" : "⚠️"}</p>
      <h1 className="mt-3 text-lg font-semibold text-slate-900">{titulo}</h1>
      <p className="mt-2 text-sm text-slate-600">{texto}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Recarregar a página
        </button>
        {tipo === "outro" && tentarDeNovo ? (
          <button
            type="button"
            onClick={tentarDeNovo}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Tentar de novo
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => history.back()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Voltar
        </button>
      </div>
      {error?.digest ? <p className="mt-4 text-[11px] text-slate-400">Código: {error.digest}</p> : null}
    </div>
  );
}
