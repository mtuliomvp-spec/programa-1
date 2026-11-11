"use client";

import "./globals.css";
import TelaDeErro from "@/components/TelaDeErro";

/** Erro no próprio layout (menu): substitui a página inteira, por isso traz html e body. */
export default function ErroGlobal({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-screen bg-slate-50 p-4 text-slate-900">
        <title>Erro — recarregue a página</title>
        <TelaDeErro error={error} tentarDeNovo={unstable_retry} />
      </body>
    </html>
  );
}
