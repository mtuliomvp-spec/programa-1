"use client";

import TelaDeErro from "@/components/TelaDeErro";

/** Erro numa tela: mostra o aviso em português sem perder o menu do sistema. */
export default function Erro({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <TelaDeErro error={error} tentarDeNovo={unstable_retry} />;
}
