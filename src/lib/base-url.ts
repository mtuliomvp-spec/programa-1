import "server-only";
import { headers } from "next/headers";

/**
 * Endereço base (origin) do sistema para montar links absolutos — como o QR
 * Code de verificação da Ordem de Pagamento.
 *
 * Prioridade:
 *  1. Variável de ambiente `NEXT_PUBLIC_APP_URL` (ou `APP_URL`) — o domínio
 *     OFICIAL (ex.: https://mvpveiculos.com.br). Defina na Vercel para que os
 *     QR Codes sempre apontem para o domínio oficial, não importa por onde a
 *     página foi aberta.
 *  2. Sem a variável: usa o endereço pelo qual a página está sendo acessada.
 */
export async function getBaseUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured) return configured.trim().replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
